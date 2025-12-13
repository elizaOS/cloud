import { group, sleep } from "k6";
import { callMcpTool } from "../../helpers/mcp";

export function checkCredits(): number {
  const r = callMcpTool<{ balance: number }>("check_credits");
  return r?.balance ?? -1;
}

export function listAgents(): unknown[] {
  return callMcpTool<{ agents: unknown[] }>("list_agents")?.agents || [];
}

export function listRooms(): unknown[] {
  return callMcpTool<{ rooms: unknown[] }>("list_rooms")?.rooms || [];
}

export function listModels(): unknown[] {
  return callMcpTool<{ models: unknown[] }>("list_models")?.models || [];
}

export function listApiKeys(): unknown[] {
  return callMcpTool<{ apiKeys: unknown[] }>("list_api_keys")?.apiKeys || [];
}

export function listVoices(): unknown[] {
  return callMcpTool<{ voices: unknown[] }>("list_voices")?.voices || [];
}

export function listContainers(): unknown[] {
  return callMcpTool<{ containers: unknown[] }>("list_containers")?.containers || [];
}

export function getUserProfile(): Record<string, unknown> | null {
  return callMcpTool<{ user: Record<string, unknown> }>("get_user_profile")?.user || null;
}

export function getCreditSummary(): Record<string, unknown> | null {
  return callMcpTool<{ summary: Record<string, unknown> }>("get_credit_summary")?.summary || null;
}

export function getBillingUsage(days = 7): Record<string, unknown> | null {
  return callMcpTool<{ usage: Record<string, unknown> }>("get_billing_usage", { days })?.usage || null;
}

export function getContainerQuota(): Record<string, unknown> | null {
  return callMcpTool<{ quota: Record<string, unknown> }>("get_container_quota")?.quota || null;
}

export function discoverServices(sources = ["local"], limit = 10): unknown[] {
  return callMcpTool<{ services: unknown[] }>("discover_services", { sources, limit })?.services || [];
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
