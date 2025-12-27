import { check, group, sleep } from "k6";
import { httpGet, httpPost } from "../../helpers/http";
import {
  a2aMethodCalls,
  a2aMethodCallTime,
  a2aMethodErrors,
} from "../../helpers/metrics";

interface A2AResult {
  result?: { id?: string; status?: string; history?: unknown[] };
  error?: { code: number; message: string };
}

function callA2A(
  method: string,
  params: Record<string, unknown> = {},
): A2AResult | null {
  const start = Date.now();
  const body = httpPost<A2AResult>(
    "/api/a2a",
    { jsonrpc: "2.0", method, params, id: Date.now() },
    {
      tags: { endpoint: "a2a", method },
    },
  );
  a2aMethodCallTime.add(Date.now() - start);
  a2aMethodCalls.add(1);
  if (!body) {
    a2aMethodErrors.add(1);
    return null;
  }
  if (body.error) {
    a2aMethodErrors.add(1);
    return null;
  }
  return body;
}

export function sendMessage(message: string): string | null {
  const r = callA2A("message/send", {
    message: { role: "user", parts: [{ type: "text", text: message }] },
  });
  return r?.result?.id ?? null;
}

export function getTask(taskId: string): A2AResult["result"] | null {
  const r = callA2A("tasks/get", { id: taskId });
  return r?.result ?? null;
}

export function cancelTask(taskId: string): boolean {
  const r = callA2A("tasks/cancel", { id: taskId });
  return r?.result !== undefined;
}

export function getAgentCard(): Record<string, unknown> | null {
  return httpGet<Record<string, unknown>>("/.well-known/agent-card.json", {
    public: true,
    tags: { endpoint: "a2a" },
  });
}

export function checkBalance(): string | null {
  return sendMessage("Check my credit balance");
}

export function listAgents(): string | null {
  return sendMessage("List my agents");
}

export function getUserInfo(): string | null {
  return sendMessage("Get my user profile");
}

export function a2aAgentCardCheck() {
  group("A2A Agent Card", () => {
    const card = getAgentCard();
    check(null, {
      "has name": () => card?.name !== undefined,
      "has skills": () => Array.isArray(card?.skills),
    });
  });
  sleep(0.5);
}

export function a2aMessageFlow() {
  group("A2A Message Flow", () => {
    const taskId = sendMessage("Hello, what can you do?");
    if (!taskId) return;
    sleep(1);
    const task = getTask(taskId);
    check(null, { "task retrieved": () => task !== null });
  });
  sleep(1);
}

export function a2aBalanceCheck() {
  group("A2A Balance", () => {
    const taskId = checkBalance();
    check(null, { "balance task created": () => taskId !== null });
  });
  sleep(1);
}

export function lightA2aMethods() {
  a2aAgentCardCheck();
  sleep(0.5);
  a2aBalanceCheck();
}

export function fullA2aMethodsCoverage() {
  group("A2A Full", () => {
    a2aAgentCardCheck();
    sleep(0.5);
    a2aMessageFlow();
    sleep(0.5);
    a2aBalanceCheck();
  });
  sleep(1);
}

export function criticalA2aMethods() {
  group("A2A Critical", () => {
    check(null, { "agent card ok": () => getAgentCard() !== null });
    sleep(0.5);
    check(null, { "message ok": () => sendMessage("ping") !== null });
  });
  sleep(0.5);
}

export default function () {
  fullA2aMethodsCoverage();
}
