import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl } from "../../config/environments";
import { getAuthHeaders } from "../../helpers/auth";
import { parseBody, parseMcpResult } from "../../helpers/assertions";
import { mcpToolCalls, mcpToolCallTime, mcpToolErrors, recordHttpError } from "../../helpers/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();

function callTool(name: string, args: Record<string, unknown> = {}): Record<string, unknown> | null {
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
  
  const body = parseBody<{ result?: unknown; error?: unknown }>(res);
  if (body.error) {
    mcpToolErrors.add(1);
    return null;
  }
  return parseMcpResult(res);
}

export function checkCredits(): number {
  const r = callTool("check_credits");
  return typeof r?.balance === "number" ? r.balance : -1;
}

export function listAgents(): unknown[] {
  return callTool("list_agents")?.agents as unknown[] || [];
}

export function listRooms(): unknown[] {
  return callTool("list_rooms")?.rooms as unknown[] || [];
}

export function listModels(): unknown[] {
  return callTool("list_models")?.models as unknown[] || [];
}

export function listApiKeys(): unknown[] {
  return callTool("list_api_keys")?.apiKeys as unknown[] || [];
}

export function listVoices(): unknown[] {
  return callTool("list_voices")?.voices as unknown[] || [];
}

export function listContainers(): unknown[] {
  return callTool("list_containers")?.containers as unknown[] || [];
}

export function getUserProfile(): Record<string, unknown> | null {
  return callTool("get_user_profile")?.user as Record<string, unknown> || null;
}

export function getCreditSummary(): Record<string, unknown> | null {
  return callTool("get_credit_summary")?.summary as Record<string, unknown> || null;
}

export function getBillingUsage(days = 7): Record<string, unknown> | null {
  return callTool("get_billing_usage", { days })?.usage as Record<string, unknown> || null;
}

export function getContainerQuota(): Record<string, unknown> | null {
  return callTool("get_container_quota")?.quota as Record<string, unknown> || null;
}

export function discoverServices(sources = ["local"], limit = 10): unknown[] {
  return callTool("discover_services", { sources, limit })?.services as unknown[] || [];
}

export function lightMcpTools() {
  group("MCP Light", () => {
    checkCredits();
    sleep(0.1);
    listAgents();
    sleep(0.1);
    listModels();
    sleep(0.1);
    getUserProfile();
  });
  sleep(0.5);
}

export function fullMcpToolsCoverage() {
  group("MCP Full", () => {
    checkCredits();
    getCreditSummary();
    getBillingUsage(7);
    sleep(0.2);
    listAgents();
    listRooms();
    sleep(0.2);
    listModels();
    listVoices();
    listApiKeys();
    listContainers();
    getContainerQuota();
    sleep(0.2);
    getUserProfile();
    discoverServices(["local"], 5);
  });
  sleep(1);
}

export default function () {
  fullMcpToolsCoverage();
}
