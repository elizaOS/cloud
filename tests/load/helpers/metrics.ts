import { Counter, Trend, Rate, Gauge } from "k6/metrics";

// Core metrics
export const agentsCreated = new Counter("agents_created");
export const agentsDeleted = new Counter("agents_deleted");
export const agentCreationTime = new Trend("agent_creation_time");
export const roomsCreated = new Counter("rooms_created");

// Credits
export const creditsChecked = new Counter("credits_checked");
export const creditBalance = new Gauge("credit_balance");

// MCP/A2A
export const mcpToolCalls = new Counter("mcp_tool_calls");
export const mcpToolCallTime = new Trend("mcp_tool_call_time");
export const mcpToolErrors = new Counter("mcp_tool_errors");
export const a2aMethodCalls = new Counter("a2a_method_calls");
export const a2aMethodCallTime = new Trend("a2a_method_call_time");
export const a2aMethodErrors = new Counter("a2a_method_errors");

// AI
export const chatCompletions = new Counter("chat_completions");
export const chatCompletionTime = new Trend("chat_completion_time");

// Storage
export const filesUploaded = new Counter("files_uploaded");
export const filesDownloaded = new Counter("files_downloaded");
export const uploadTime = new Trend("upload_time");
export const downloadTime = new Trend("download_time");

// Discovery
export const discoveryQueries = new Counter("discovery_queries");

// Errors
export const httpErrors = new Counter("http_errors");
export const rateLimitHits = new Counter("rate_limit_hits");
export const rateLimitRate = new Rate("rate_limit_rate");

export function recordHttpError(status: number) {
  httpErrors.add(1);
  if (status === 429) {
    rateLimitHits.add(1);
    rateLimitRate.add(1);
  }
}
