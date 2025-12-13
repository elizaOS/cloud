import http from "k6/http";
import { check } from "k6";
import { getBaseUrl } from "../config/environments";
import { getAuthHeaders } from "./auth";
import { parseBody } from "./assertions";
import { mcpToolCalls, mcpToolCallTime, mcpToolErrors, recordHttpError } from "./metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();

export function callMcpTool<T>(name: string, args: Record<string, unknown> = {}): T | null {
  const start = Date.now();
  const res = http.post(
    `${baseUrl}/api/mcp`,
    JSON.stringify({ jsonrpc: "2.0", method: "tools/call", params: { name, arguments: args }, id: Date.now() }),
    { headers, tags: { endpoint: "mcp", tool: name } }
  );
  mcpToolCallTime.add(Date.now() - start);
  mcpToolCalls.add(1);

  if (res.status !== 200) {
    recordHttpError(res.status);
    mcpToolErrors.add(1);
    return null;
  }

  const body = parseBody<{ result?: { content?: Array<{ text: string }> }; error?: unknown }>(res);
  if (body.error) {
    mcpToolErrors.add(1);
    return null;
  }

  const text = body.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

