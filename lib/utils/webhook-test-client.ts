/**
 * Webhook Test Client
 * 
 * Utility for testing webhook integrations with proper signature generation.
 * Use this client to test webhook triggers locally or in integration tests.
 * 
 * @example
 * ```ts
 * const client = new WebhookTestClient({
 *   baseUrl: 'http://localhost:3000',
 *   webhookKey: 'your-webhook-key',
 *   webhookSecret: 'your-webhook-secret',
 * });
 * 
 * const result = await client.trigger({ event: 'test', data: { foo: 'bar' } });
 * console.log(result.executionId);
 * ```
 */

import {
  generateWebhookSignature,
  createSignatureHeaders,
} from "./webhook-signature";

// =============================================================================
// TYPES
// =============================================================================

export interface WebhookTestClientConfig {
  /** Base URL of the API (e.g., http://localhost:3000) */
  baseUrl: string;
  /** The webhook trigger key */
  webhookKey: string;
  /** The webhook secret for signing requests */
  webhookSecret: string;
  /** Custom signature header name (default: x-webhook-signature) */
  signatureHeader?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

export interface WebhookTriggerOptions {
  /** Skip signature generation (for testing signature validation) */
  skipSignature?: boolean;
  /** Use an invalid signature (for testing rejection) */
  invalidSignature?: boolean;
  /** Use an expired timestamp (for testing replay protection) */
  expiredTimestamp?: boolean;
  /** Custom headers to include */
  headers?: Record<string, string>;
  /** HTTP method (default: POST) */
  method?: "GET" | "POST";
}

export interface WebhookTriggerResult {
  success: boolean;
  status: number;
  executionId?: string;
  executionStatus?: string;
  outputData?: unknown;
  error?: string;
  duration: number;
  headers: Record<string, string>;
}

export interface WebhookHealthResult {
  success: boolean;
  active: boolean;
  requiresSignature: boolean;
  status: number;
}

// =============================================================================
// CLIENT CLASS
// =============================================================================

export class WebhookTestClient {
  private config: Required<WebhookTestClientConfig>;

  constructor(config: WebhookTestClientConfig) {
    this.config = {
      signatureHeader: "x-webhook-signature",
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Get the full webhook URL.
   */
  get webhookUrl(): string {
    return `${this.config.baseUrl}/api/v1/n8n/webhooks/${this.config.webhookKey}`;
  }

  /**
   * Check if webhook is healthy and accessible.
   */
  async health(): Promise<WebhookHealthResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.webhookUrl, {
        method: "GET",
        signal: controller.signal,
      });

      const data = await response.json();

      return {
        success: data.success ?? false,
        active: data.active ?? false,
        requiresSignature: data.requiresSignature ?? true,
        status: response.status,
      };
    } catch (error) {
      return {
        success: false,
        active: false,
        requiresSignature: true,
        status: 0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Trigger the webhook with a payload.
   */
  async trigger(
    payload: Record<string, unknown>,
    options: WebhookTriggerOptions = {}
  ): Promise<WebhookTriggerResult> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...options.headers,
      };

      // Generate signature unless skipped
      if (!options.skipSignature && options.method !== "GET") {
        if (options.invalidSignature) {
          // Generate invalid signature
          headers[this.config.signatureHeader] = `t=${Math.floor(Date.now() / 1000)},v1=${"x".repeat(64)}`;
        } else if (options.expiredTimestamp) {
          // Generate signature with expired timestamp (10 minutes ago)
          const expiredTimestamp = Math.floor(Date.now() / 1000) - 600;
          headers[this.config.signatureHeader] = generateWebhookSignature({
            payload: body,
            secret: this.config.webhookSecret,
            timestamp: expiredTimestamp,
          });
        } else {
          // Generate valid signature
          const signatureHeaders = createSignatureHeaders(
            body,
            this.config.webhookSecret,
            { signatureHeader: this.config.signatureHeader }
          );
          headers[this.config.signatureHeader] = signatureHeaders[this.config.signatureHeader];
        }
      }

      const response = await fetch(this.webhookUrl, {
        method: options.method || "POST",
        headers,
        body: options.method === "GET" ? undefined : body,
        signal: controller.signal,
      });

      const duration = Date.now() - startTime;
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const data = await response.json().catch(() => ({}));

      return {
        success: data.success ?? false,
        status: response.status,
        executionId: data.executionId,
        executionStatus: data.status,
        outputData: data.outputData,
        error: data.error,
        duration,
        headers: responseHeaders,
      };
    } catch (error) {
      return {
        success: false,
        status: 0,
        error: error instanceof Error ? error.message : "Request failed",
        duration: Date.now() - startTime,
        headers: {},
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Test various webhook scenarios.
   */
  async runTests(): Promise<WebhookTestReport> {
    const report: WebhookTestReport = {
      webhookUrl: this.webhookUrl,
      tests: [],
      passed: 0,
      failed: 0,
      duration: 0,
    };

    const startTime = Date.now();

    // Test 1: Health check
    const health = await this.health();
    report.tests.push({
      name: "Health Check",
      passed: health.success && health.active,
      details: health,
    });
    if (health.success && health.active) report.passed++;
    else report.failed++;

    // Test 2: Valid request with signature
    const validRequest = await this.trigger({ test: true, timestamp: Date.now() });
    report.tests.push({
      name: "Valid Request",
      passed: validRequest.success,
      details: {
        status: validRequest.status,
        executionId: validRequest.executionId,
        duration: validRequest.duration,
      },
    });
    if (validRequest.success) report.passed++;
    else report.failed++;

    // Test 3: Request without signature (should fail if signature required)
    const noSignature = await this.trigger({ test: true }, { skipSignature: true });
    const noSigExpectedFail = health.requiresSignature;
    const noSigPassed = noSigExpectedFail ? noSignature.status === 401 : noSignature.success;
    report.tests.push({
      name: "No Signature (should fail if required)",
      passed: noSigPassed,
      details: {
        status: noSignature.status,
        error: noSignature.error,
        requiresSignature: health.requiresSignature,
      },
    });
    if (noSigPassed) report.passed++;
    else report.failed++;

    // Test 4: Invalid signature
    const invalidSig = await this.trigger({ test: true }, { invalidSignature: true });
    report.tests.push({
      name: "Invalid Signature (should fail)",
      passed: invalidSig.status === 401,
      details: {
        status: invalidSig.status,
        error: invalidSig.error,
      },
    });
    if (invalidSig.status === 401) report.passed++;
    else report.failed++;

    // Test 5: Expired signature
    const expiredSig = await this.trigger({ test: true }, { expiredTimestamp: true });
    report.tests.push({
      name: "Expired Signature (should fail)",
      passed: expiredSig.status === 401,
      details: {
        status: expiredSig.status,
        error: expiredSig.error,
      },
    });
    if (expiredSig.status === 401) report.passed++;
    else report.failed++;

    // Test 6: Rate limit headers present
    report.tests.push({
      name: "Rate Limit Headers Present",
      passed: "x-ratelimit-limit" in validRequest.headers || "X-RateLimit-Limit" in validRequest.headers,
      details: {
        limit: validRequest.headers["x-ratelimit-limit"] || validRequest.headers["X-RateLimit-Limit"],
        remaining: validRequest.headers["x-ratelimit-remaining"] || validRequest.headers["X-RateLimit-Remaining"],
      },
    });
    if ("x-ratelimit-limit" in validRequest.headers || "X-RateLimit-Limit" in validRequest.headers) report.passed++;
    else report.failed++;

    report.duration = Date.now() - startTime;

    return report;
  }
}

export interface WebhookTestReport {
  webhookUrl: string;
  tests: Array<{
    name: string;
    passed: boolean;
    details: Record<string, unknown>;
  }>;
  passed: number;
  failed: number;
  duration: number;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick test a webhook URL.
 */
export async function testWebhook(
  config: WebhookTestClientConfig
): Promise<WebhookTestReport> {
  const client = new WebhookTestClient(config);
  return client.runTests();
}

/**
 * Send a single webhook request.
 */
export async function sendWebhook(
  config: WebhookTestClientConfig,
  payload: Record<string, unknown>
): Promise<WebhookTriggerResult> {
  const client = new WebhookTestClient(config);
  return client.trigger(payload);
}

