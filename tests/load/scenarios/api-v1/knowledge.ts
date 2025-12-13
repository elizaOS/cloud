import { group, sleep } from "k6";
import { getConfig } from "../../config/environments";
import { generateKnowledgeContent, generateMemoryContent } from "../../helpers/data-generators";
import { callMcpTool } from "../../helpers/mcp";
import { Counter, Trend } from "k6/metrics";

const config = getConfig();
const knowledgeQueries = new Counter("knowledge_queries");
const queryLatency = new Trend("knowledge_query_latency");

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
