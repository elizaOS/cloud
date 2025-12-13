import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl, getConfig } from "../../config/environments";
import { getAuthHeaders } from "../../helpers/auth";
import { parseBody } from "../../helpers/assertions";
import { generateKnowledgeContent, generateMemoryContent } from "../../helpers/data-generators";
import { recordHttpError } from "../../helpers/metrics";
import { Counter, Trend } from "k6/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();
const config = getConfig();

const knowledgeQueries = new Counter("knowledge_queries");
const queryLatency = new Trend("knowledge_query_latency");

function callMcpTool<T>(name: string, args: Record<string, unknown> = {}): T | null {
  const res = http.post(
    `${baseUrl}/api/mcp`,
    JSON.stringify({ jsonrpc: "2.0", method: "tools/call", params: { name, arguments: args }, id: Date.now() }),
    { headers, tags: { endpoint: "knowledge" } }
  );
  if (!check(res, { [`${name} 200`]: (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  const body = parseBody<{ result?: { content?: Array<{ text: string }> } }>(res);
  const text = body.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

export function queryKnowledge(query: string, limit = 5): unknown[] {
  const start = Date.now();
  const r = callMcpTool<{ results: unknown[] }>("query_knowledge", { query, limit });
  queryLatency.add(Date.now() - start);
  knowledgeQueries.add(1);
  return r?.results || [];
}

export function uploadKnowledge(content: string, title: string): string | null {
  const r = callMcpTool<{ knowledgeId?: string; id?: string }>("upload_knowledge", { content, title });
  return r?.knowledgeId || r?.id || null;
}

export function saveMemory(content: string, tags: string[] = []): string | null {
  const r = callMcpTool<{ memoryId?: string; id?: string }>("save_memory", { content, tags });
  return r?.memoryId || r?.id || null;
}

export function retrieveMemories(query: string, limit = 5): unknown[] {
  return callMcpTool<{ memories: unknown[] }>("retrieve_memories", { query, limit })?.memories || [];
}

export function knowledgeOperationsCycle() {
  group("Knowledge Ops", () => {
    queryKnowledge("test query");
    sleep(0.5);
    if (!config.safeMode) uploadKnowledge(generateKnowledgeContent(), "Load Test");
  });
  sleep(1);
}

export function memoryOperationsCycle() {
  group("Memory Ops", () => {
    retrieveMemories("test");
    sleep(0.3);
    if (!config.safeMode) saveMemory(generateMemoryContent(), ["loadtest"]);
  });
  sleep(1);
}

export default function () {
  knowledgeOperationsCycle();
  memoryOperationsCycle();
}
