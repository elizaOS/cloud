/**
 * Custom Assertions for Load Tests
 *
 * Provides structured check helpers for common API response patterns.
 */

import { check } from "k6";
import { Response } from "k6/http";

export interface ApiResponse {
  success?: boolean;
  error?: { code: number; message: string };
  [key: string]: unknown;
}

export interface McpResponse {
  jsonrpc: string;
  result?: {
    content?: Array<{ type: string; text: string }>;
  };
  error?: { code: number; message: string };
  id: number;
}

export interface A2aResponse {
  jsonrpc: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  id: number;
}

/**
 * Check that a response is successful (2xx status).
 */
export function checkSuccess(response: Response, name: string): boolean {
  return check(response, {
    [`${name} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });
}

/**
 * Check that a response has valid JSON.
 */
export function checkJson(response: Response, name: string): boolean {
  return check(response, {
    [`${name} has valid JSON`]: (r) => {
      try {
        JSON.parse(r.body as string);
        return true;
      } catch {
        return false;
      }
    },
  });
}

/**
 * Check API response structure with success field.
 */
export function checkApiSuccess(response: Response, name: string): boolean {
  const statusOk = check(response, {
    [`${name} status 200`]: (r) => r.status === 200,
  });

  if (!statusOk) return false;

  try {
    const body: ApiResponse = JSON.parse(response.body as string);
    return check(null, {
      [`${name} success true`]: () => body.success === true || body.success === undefined,
      [`${name} no error`]: () => body.error === undefined,
    });
  } catch {
    return false;
  }
}

/**
 * Check MCP response structure.
 */
export function checkMcpSuccess(response: Response, name: string): boolean {
  const statusOk = check(response, {
    [`${name} status 200`]: (r) => r.status === 200,
  });

  if (!statusOk) return false;

  try {
    const body: McpResponse = JSON.parse(response.body as string);
    return check(null, {
      [`${name} has result`]: () => body.result !== undefined,
      [`${name} no error`]: () => body.error === undefined,
      [`${name} has content`]: () => body.result?.content !== undefined,
    });
  } catch {
    return false;
  }
}

/**
 * Check A2A response structure.
 */
export function checkA2aSuccess(response: Response, name: string): boolean {
  const statusOk = check(response, {
    [`${name} status 200`]: (r) => r.status === 200,
  });

  if (!statusOk) return false;

  try {
    const body: A2aResponse = JSON.parse(response.body as string);
    return check(null, {
      [`${name} has result`]: () => body.result !== undefined,
      [`${name} no error`]: () => body.error === undefined,
    });
  } catch {
    return false;
  }
}

/**
 * Check response time is under threshold.
 */
export function checkResponseTime(response: Response, name: string, maxMs: number): boolean {
  return check(response, {
    [`${name} response time < ${maxMs}ms`]: (r) => r.timings.duration < maxMs,
  });
}

/**
 * Check for rate limit response.
 */
export function checkNotRateLimited(response: Response, name: string): boolean {
  return check(response, {
    [`${name} not rate limited`]: (r) => r.status !== 429,
  });
}

/**
 * Parse MCP response content.
 */
export function parseMcpResult(response: Response): Record<string, unknown> {
  const body: McpResponse = JSON.parse(response.body as string);
  const text = body.result?.content?.[0]?.text;
  if (!text) return {};
  return JSON.parse(text);
}

/**
 * Parse A2A response result.
 */
export function parseA2aResult(response: Response): Record<string, unknown> {
  const body: A2aResponse = JSON.parse(response.body as string);
  return body.result || {};
}

