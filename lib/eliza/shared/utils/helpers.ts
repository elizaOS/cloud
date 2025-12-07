/**
 * Common helper functions for workflow handlers.
 */

import {
  logger,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  ModelType,
  parseKeyValueXml,
  createUniqueUuid,
  type UUID,
} from "@elizaos/core";
import { v4 } from "uuid";
import type { ParsedResponse, ParsedPlan } from "./parsers";

export const MAX_RESPONSE_RETRIES = 3;
export const EVALUATOR_TIMEOUT_MS = 30000;

const actionAttachmentCache = new Map<string, unknown[]>();
const actionResponseSentCache = new Map<string, boolean>();

export function hasActionSentResponse(roomId: string): boolean {
  return actionResponseSentCache.get(roomId) === true;
}

export function clearActionResponseFlag(roomId: string): void {
  actionResponseSentCache.delete(roomId);
}

function isBase64DataUrl(url: string): boolean {
  return url.startsWith("data:");
}

export function getAndClearCachedAttachments(roomId: string): unknown[] {
  const attachments = actionAttachmentCache.get(roomId) || [];
  actionAttachmentCache.delete(roomId);
  return attachments;
}

export function clearCachedAttachments(roomId: string): void {
  actionAttachmentCache.delete(roomId);
}

export function cleanPrompt(prompt: string): string {
  return prompt
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

interface Attachment {
  url?: string;
  id?: string;
  contentType?: string;
  [key: string]: unknown;
}

interface ActionResult {
  data?: { attachments?: Attachment[] };
}

export function extractAttachments(actionResults: ActionResult[]): Attachment[] {
  return actionResults
    .flatMap((result) => result.data?.attachments ?? [])
    .filter((att): att is Attachment => {
      if (!att?.url) return false;
      if (isBase64DataUrl(att.url)) return false;
      if (att.url.startsWith("[") || att.url === "" || !att.url.startsWith("http")) return false;
      return true;
    });
}

export async function executeProviders(
  runtime: IAgentRuntime,
  message: Memory,
  plannedProviders: string[],
  currentState: State,
): Promise<State> {
  if (plannedProviders.length === 0) return currentState;

  const providerState = await runtime.composeState(message, [...plannedProviders, "CHARACTER"]);
  return { ...currentState, ...providerState };
}

export async function executeActions(
  runtime: IAgentRuntime,
  message: Memory,
  plannedActions: string[],
  plan: ParsedPlan | null,
  currentState: State,
  callback?: HandlerCallback,
): Promise<State> {
  if (plannedActions.length === 0) return currentState;

  const actionResponse: Memory = {
    id: createUniqueUuid(runtime, v4() as UUID),
    entityId: runtime.agentId,
    agentId: runtime.agentId,
    roomId: message.roomId,
    worldId: message.worldId,
    content: { text: plan?.thought || "Executing actions", actions: plannedActions, source: "agent" },
  };

  actionAttachmentCache.set(message.roomId as string, []);
  actionResponseSentCache.set(message.roomId as string, false);

  const wrappedCallback: HandlerCallback = async (content) => {
    if (content.text?.trim()) {
      actionResponseSentCache.set(message.roomId as string, true);
    }

    if (content.attachments?.length) {
      const existing = actionAttachmentCache.get(message.roomId as string) || [];
      for (const att of content.attachments) {
        const a = att as Attachment;
        if (a.url?.startsWith("http")) {
          existing.push({ id: a.id, url: a.url, title: a.title, contentType: a.contentType });
        }
      }
      actionAttachmentCache.set(message.roomId as string, existing);
    }

    return callback ? callback(content) : [];
  };

  await runtime.processActions(message, [actionResponse], currentState, wrappedCallback);
  const actionState = await runtime.composeState(message, ["CURRENT_RUN_CONTEXT"]);
  return { ...currentState, ...actionState };
}

export async function generateResponseWithRetry(
  runtime: IAgentRuntime,
  prompt: string,
): Promise<{ text: string; thought: string }> {
  for (let i = 0; i < MAX_RESPONSE_RETRIES; i++) {
    const response = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });
    const parsed = parseKeyValueXml(response) as ParsedResponse | null;
    if (parsed?.text) {
      return { text: parsed.text, thought: parsed.thought || "" };
    }
  }
  return { text: "", thought: "" };
}

export async function runEvaluatorsWithTimeout(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  responseMemory: Memory,
  callback: HandlerCallback,
): Promise<void> {
  if (typeof runtime.evaluate !== "function") return;

  await Promise.race([
    runtime.evaluate(message, { ...state }, true, (content) => callback?.(content) ?? [], [responseMemory]),
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Evaluators timeout")), EVALUATOR_TIMEOUT_MS)),
  ]);
}
