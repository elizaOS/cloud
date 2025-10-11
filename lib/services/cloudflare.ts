/**
 * Cloudflare Workers & Containers API Service
 * Handles deployment and management of ElizaOS containers to Cloudflare
 */

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
  async deployContainer(
    config: DeploymentConfig,
  ): Promise<DeploymentResult> {
    try {
      // Use bootstrapper image for artifact-based deployments
      const finalImageTag = config.useBootstrapper 
        ? "elizaos/bootstrapper:latest"  // This should be configurable
        : config.imageTag;

      // Step 1: Create Worker script
      const worker = await this.createWorkerScript({
        ...config,
        imageTag: finalImageTag,
      });

      // Step 2: Deploy container binding
      const container = await this.deployContainerBinding(
        { ...config, imageTag: finalImageTag },
        worker.id,
      );

      // Step 3: Create route for the worker
      const route = await this.createWorkerRoute(worker.id, config.name);

      return {
        workerId: worker.id,
        containerId: container.id,
        url: route.url,
        status: "deployed",
      };
    } catch (error) {
      console.error("Cloudflare deployment failed:", error);
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

    const response = await fetch(
      `${this.baseUrl}/accounts/${this.config.accountId}/workers/scripts/${config.name}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/javascript",
        },
        body: workerScript,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Worker creation failed: ${error}`);
    }

    const data = await response.json();
    return {
      id: data.result.id || config.name,
      name: config.name,
    };
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
   * Deploy container binding to the worker
   */
  private async deployContainerBinding(
    config: DeploymentConfig,
    workerId: string,
  ): Promise<{ id: string }> {
    const bindingConfig = {
      containers: [
        {
          class_name: "ElizaContainer",
          image: config.imageTag,
          max_instances: config.maxInstances,
          environment: config.environmentVars || {},
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

    const response = await fetch(
      `${this.baseUrl}/accounts/${this.config.accountId}/workers/scripts/${workerId}/bindings`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bindingConfig),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Container binding failed: ${error}`);
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
  async getContainerLogs(
    workerId: string,
  ): Promise<string[]> {
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

