/**
 * Cloudflare Workers & Containers API Service
 * Handles deployment and management of ElizaOS containers to Cloudflare
 */

import {
  CloudflareApiError,
  retryWithBackoff,
  withTimeout,
} from "@/lib/errors/deployment-errors";

/**
 * Sanitize sensitive data for logging
 * Masks API keys, tokens, and credentials to prevent leaks
 */
function sanitizeForLogging<T>(data: T): T {
  if (!data || typeof data !== "object") {
    return data;
  }

  const sensitiveKeys = [
    "apiKey",
    "api_key",
    "apiToken",
    "api_token",
    "accessKeyId",
    "access_key_id",
    "secretAccessKey",
    "secret_access_key",
    "sessionToken",
    "session_token",
    "password",
    "secret",
    "token",
    "authorization",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_SESSION_TOKEN",
  ];

  const sanitized = (Array.isArray(data) ? [...data] : { ...data }) as Record<
    string,
    unknown
  >;

  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();

    // Check if this is a sensitive key
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk.toLowerCase()))) {
      const value = sanitized[key];
      if (typeof value === "string" && value.length > 0) {
        // Show first 4 chars and mask the rest
        sanitized[key] =
          value.length > 8
            ? `${value.substring(0, 4)}${"*".repeat(Math.min(value.length - 4, 20))}`
            : "***REDACTED***";
      }
    } else if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeForLogging(sanitized[key]);
    }
  }

  return sanitized as T;
}

export interface CloudflareConfig {
  accountId: string;
  apiToken: string;
  apiEmail?: string;
}

export interface DeploymentConfig {
  name: string;
  imageTag: string;
  port: number;
  maxInstances: number;
  environmentVars?: Record<string, string>;
  healthCheckPath?: string;
  useBootstrapper?: boolean;
  artifactUrl?: string;
  artifactChecksum?: string;
}

export interface DeploymentResult {
  workerId: string;
  containerId: string;
  url: string;
  status: string;
}

export class CloudflareService {
  private config: CloudflareConfig;
  private baseUrl = "https://api.cloudflare.com/client/v4";

  constructor(config: CloudflareConfig) {
    this.config = config;
  }

  /**
   * Deploy a container to Cloudflare Workers
   * Uses bootstrapper architecture for efficient deployments
   */
  async deployContainer(config: DeploymentConfig): Promise<DeploymentResult> {
    try {
      console.log(
        "Starting Cloudflare container deployment",
        sanitizeForLogging({
          name: config.name,
          port: config.port,
          maxInstances: config.maxInstances,
          useBootstrapper: config.useBootstrapper,
          artifactUrl: config.artifactUrl,
        }),
      );

      // Use bootstrapper image for artifact-based deployments
      const finalImageTag = config.useBootstrapper
        ? process.env.BOOTSTRAPPER_IMAGE_TAG || "elizaos/bootstrapper:latest"
        : config.imageTag;

      // Step 1: Create Worker script
      console.log("Creating Worker script");
      const worker = await this.createWorkerScript({
        ...config,
        imageTag: finalImageTag,
      });
      console.log("Worker script created", { workerId: worker.id });

      // Step 2: Deploy container binding
      console.log("Deploying container binding");
      const container = await this.deployContainerBinding(
        { ...config, imageTag: finalImageTag },
        worker.id,
      );
      console.log("Container binding deployed", { containerId: container.id });

      // Step 3: Create route for the worker
      console.log("Creating Worker route");
      const route = await this.createWorkerRoute(worker.id, config.name);
      console.log("Worker route created", { url: route.url });

      const result = {
        workerId: worker.id,
        containerId: container.id,
        url: route.url,
        status: "deployed",
      };

      console.log("Cloudflare deployment completed successfully", result);

      return result;
    } catch (error) {
      console.error(
        "Cloudflare deployment failed",
        error instanceof Error ? error.message : String(error),
        sanitizeForLogging({ config }),
      );
      throw new Error(
        `Deployment failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Create a Worker script with container binding
   */
  private async createWorkerScript(config: DeploymentConfig): Promise<{
    id: string;
    name: string;
  }> {
    const workerScript = this.generateWorkerScript(config);
    const endpoint = `${this.baseUrl}/accounts/${this.config.accountId}/workers/scripts/${config.name}`;

    // Retry with backoff for transient failures
    return await retryWithBackoff(
      async () => {
        // Add timeout to prevent hanging
        return await withTimeout(
          async () => {
            const response = await fetch(endpoint, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${this.config.apiToken}`,
                "Content-Type": "application/javascript",
              },
              body: workerScript,
            });

            if (!response.ok) {
              const error = await response.text();
              throw new CloudflareApiError(
                `Worker creation failed: ${error}`,
                endpoint,
                "PUT",
                { statusCode: response.status },
              );
            }

            const data = await response.json();
            return {
              id: data.result.id || config.name,
              name: config.name,
            };
          },
          30000, // 30 second timeout
          "createWorkerScript",
        );
      },
      { maxAttempts: 3, initialDelayMs: 2000 },
      (attempt, error) => {
        console.warn(
          `Worker script creation failed (attempt ${attempt}): ${error.message}`,
        );
      },
    );
  }

  /**
   * Generate Worker script for container proxy
   */
  private generateWorkerScript(config: DeploymentConfig): string {
    return `
import { Container, getContainer } from "@cloudflare/containers";

export class ElizaContainer extends Container {
  defaultPort = ${config.port};
  sleepAfter = "10m";
}

export default {
  async fetch(request, env) {
    try {
      // Get session ID from request or generate one
      const url = new URL(request.url);
      const sessionId = url.searchParams.get("sessionId") || "default";
      
      // Get container instance
      const containerInstance = getContainer(env.ELIZA_CONTAINER, sessionId);
      
      // Forward request to container
      return await containerInstance.fetch(request);
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: "Container error", 
        message: error.message 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
`;
  }

  /**
   * Deploy container binding to the worker with retry logic
   */
  private async deployContainerBinding(
    config: DeploymentConfig,
    workerId: string,
  ): Promise<{ id: string }> {
    return await retryWithBackoff(
      async () => this.deployContainerBindingInternal(config, workerId),
      { maxAttempts: 3, initialDelayMs: 2000 },
      (attempt, error) => {
        console.warn(
          `Container binding deployment failed (attempt ${attempt}): ${error.message}`,
        );
      },
    );
  }

  /**
   * Internal container binding deployment logic
   */
  private async deployContainerBindingInternal(
    config: DeploymentConfig,
    workerId: string,
  ): Promise<{ id: string }> {
    // Prepare environment variables
    // Start with user-provided vars, then add bootstrapper vars if needed
    const environment: Record<string, string> = {
      ...(config.environmentVars || {}),
    };

    // If using bootstrapper architecture, inject artifact download URL
    // SECURITY: Use presigned URL instead of raw credentials to reduce attack surface
    if (config.useBootstrapper && config.artifactUrl) {
      // The artifact URL is already a presigned URL with authentication baked in
      // No need to pass raw credentials - bootstrapper will use the presigned URL directly
      environment.R2_ARTIFACT_URL = config.artifactUrl;
      environment.R2_ARTIFACT_CHECKSUM = config.artifactChecksum || "";
    }

    const bindingConfig = {
      containers: [
        {
          class_name: "ElizaContainer",
          image: config.imageTag,
          max_instances: config.maxInstances,
          environment,
        },
      ],
      durable_objects: {
        bindings: [
          {
            class_name: "ElizaContainer",
            name: "ELIZA_CONTAINER",
          },
        ],
      },
    };

    const endpoint = `${this.baseUrl}/accounts/${this.config.accountId}/workers/scripts/${workerId}/bindings`;

    const response = await withTimeout(
      async () => {
        return await fetch(endpoint, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(bindingConfig),
        });
      },
      45000, // 45 second timeout for binding
      "deployContainerBinding",
    );

    if (!response.ok) {
      const error = await response.text();
      throw new CloudflareApiError(
        `Container binding failed: ${error}`,
        endpoint,
        "PUT",
        { statusCode: response.status },
      );
    }

    const data = await response.json();
    return {
      id: data.result?.id || `${workerId}-container`,
    };
  }

  /**
   * Create a route for the worker
   */
  private async createWorkerRoute(
    workerId: string,
    name: string,
  ): Promise<{ url: string }> {
    const subdomain = `${name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}-${workerId.slice(0, 8)}`;
    const url = `https://${subdomain}.workers.dev`;

    const response = await fetch(
      `${this.baseUrl}/accounts/${this.config.accountId}/workers/scripts/${workerId}/routes`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pattern: `${subdomain}.workers.dev/*`,
          script: workerId,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Route creation failed: ${error}`);
    }

    return { url };
  }

  /**
   * Delete a container deployment
   */
  async deleteContainer(workerId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/accounts/${this.config.accountId}/workers/scripts/${workerId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Container deletion failed: ${error}`);
    }
  }

  /**
   * Check container health
   */
  async checkContainerHealth(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get container logs (if available)
   */
  async getContainerLogs(workerId: string): Promise<string[]> {
    const response = await fetch(
      `${this.baseUrl}/accounts/${this.config.accountId}/workers/scripts/${workerId}/tails`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
        },
      },
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.result?.logs || [];
  }
}

/**
 * Get Cloudflare service instance
 */
export function getCloudflareService(): CloudflareService {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "Cloudflare credentials not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables.",
    );
  }

  return new CloudflareService({
    accountId,
    apiToken,
  });
}
