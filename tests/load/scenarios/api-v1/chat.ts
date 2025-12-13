import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl } from "../../config/environments";
import { getAuthHeaders } from "../../helpers/auth";
import { parseBody } from "../../helpers/assertions";
import { chatCompletions, chatCompletionTime, recordHttpError } from "../../helpers/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();

interface ChatMessage { role: "user" | "assistant" | "system"; content: string }

export function createChatCompletion(messages: ChatMessage[], model = "gpt-4o-mini", maxTokens = 50) {
  const start = Date.now();
  const res = http.post(
    `${baseUrl}/api/v1/chat`,
    JSON.stringify({ messages, model, maxTokens, temperature: 0.7 }),
    { headers, tags: { endpoint: "chat" }, timeout: "30s" }
  );
  chatCompletionTime.add(Date.now() - start);

  if (!check(res, { "chat 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  chatCompletions.add(1);
  return parseBody<{ content?: string }>(res);
}

export function a2aChatCompletion(messages: ChatMessage[], model = "gpt-4o-mini", maxTokens = 50) {
  const start = Date.now();
  const res = http.post(
    `${baseUrl}/api/a2a`,
    JSON.stringify({ jsonrpc: "2.0", method: "a2a.chatCompletion", params: { messages, model, maxTokens }, id: Date.now() }),
    { headers, tags: { endpoint: "chat" }, timeout: "30s" }
  );
  chatCompletionTime.add(Date.now() - start);

  if (!check(res, { "a2a chat 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  chatCompletions.add(1);
  return parseBody<{ result: unknown }>(res).result;
}

export function generateEmbeddings(text: string): number[] | null {
  const res = http.post(`${baseUrl}/api/v1/embeddings`, JSON.stringify({ text }), { headers, tags: { endpoint: "chat" } });
  if (!check(res, { "embeddings 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  const body = parseBody<{ embedding?: number[]; embeddings?: number[] }>(res);
  return body.embedding || body.embeddings || null;
}

export function minimalChatCompletion() {
  group("Minimal Chat", () => {
    createChatCompletion([{ role: "user", content: "Say 'test' only" }], "gpt-4o-mini", 10);
  });
  sleep(2);
}

export function embeddingsTest() {
  group("Embeddings", () => {
    const r = generateEmbeddings("Test text");
    check(null, { "embeddings ok": () => r !== null && r.length > 0 });
  });
  sleep(1);
}

export function lightAiOperations() {
  embeddingsTest();
}

export function fullAiCoverage() {
  minimalChatCompletion();
  sleep(1);
  embeddingsTest();
}

export default function () {
  minimalChatCompletion();
}
