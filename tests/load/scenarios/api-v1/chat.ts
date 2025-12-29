import { check, group, sleep } from "k6";
import { httpPost } from "../../helpers/http";
import { chatCompletions, chatCompletionTime } from "../../helpers/metrics";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export function createChatCompletion(
  messages: ChatMessage[],
  model = "gpt-4o-mini",
  maxTokens = 50,
) {
  const start = Date.now();
  const body = httpPost<{ content?: string }>(
    "/api/v1/chat",
    { messages, model, maxTokens, temperature: 0.7 },
    {
      tags: { endpoint: "chat" },
      timeout: "30s",
    },
  );
  chatCompletionTime.add(Date.now() - start);
  if (!body) return null;
  chatCompletions.add(1);
  return body;
}

export function a2aChatCompletion(
  messages: ChatMessage[],
  model = "gpt-4o-mini",
  maxTokens = 50,
) {
  const start = Date.now();
  const body = httpPost<{ result: unknown }>(
    "/api/a2a",
    {
      jsonrpc: "2.0",
      method: "a2a.chatCompletion",
      params: { messages, model, maxTokens },
      id: Date.now(),
    },
    {
      tags: { endpoint: "chat" },
      timeout: "30s",
    },
  );
  chatCompletionTime.add(Date.now() - start);
  if (!body) return null;
  chatCompletions.add(1);
  return body.result;
}

export function generateEmbeddings(text: string): number[] | null {
  const body = httpPost<{ embedding?: number[]; embeddings?: number[] }>(
    "/api/v1/embeddings",
    { text },
    { tags: { endpoint: "chat" } },
  );
  return body?.embedding ?? body?.embeddings ?? null;
}

export function minimalChatCompletion() {
  group("Minimal Chat", () => {
    createChatCompletion(
      [{ role: "user", content: "Say 'test' only" }],
      "gpt-4o-mini",
      10,
    );
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

export default function main() {
  minimalChatCompletion();
}
