/**
 * A2A (Agent-to-Agent) JSON-RPC Endpoint
 *
 * Implements the A2A protocol specification v0.3.0
 * @see https://google.github.io/a2a-spec/
 *
 * Standard Methods:
 * - message/send: Send a message to create/continue a task
 * - message/stream: Send message with streaming response (SSE)
 * - tasks/get: Get task status and history
 * - tasks/cancel: Cancel a running task
 *
 * Extension Methods (backwards compatibility):
 * - a2a.chatCompletion: Direct LLM inference
 * - a2a.generateImage: Image generation
 * - a2a.getBalance: Check credit balance
 * - a2a.getUsage: Get usage statistics
 */

import { NextRequest, NextResponse } from "next/server";
// IMPORTANT: Use zod3 for Turbopack compatibility
// Zod v4 has issues with Turbopack bundling
import { z } from "zod3";
import { v4 as uuidv4 } from "uuid";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";
import {
  creditsService,
  usageService,
  organizationsService,
  generationsService,
  conversationsService,
  memoryService,
  charactersService,
  containersService,
  contentModerationService,
  agentReputationService,
  apiKeysService,
} from "@/lib/services";
import { agentService } from "@/lib/services/agents/agents";
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { calculateCost, getProviderFromModel, estimateRequestCost, IMAGE_GENERATION_COST } from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import type { UserWithOrganization } from "@/lib/types";
import type { Organization } from "@/db/schemas/organizations";
import {
  Task,
  TaskState,
  Message,
  Part,
  Artifact,
  MessageSendParams,
  TaskGetParams,
  TaskCancelParams,
  A2AErrorCodes,
  createTextPart,
  createDataPart,
  createTask,
  createTaskStatus,
  createArtifact,
  createMessage,
  jsonRpcSuccess,
  jsonRpcError,
  JSONRPCRequest,
  JSONRPCResponse,
} from "@/lib/types/a2a";

export const maxDuration = 60;

// ===== In-memory task store (replace with persistent storage for production) =====

interface TaskStore {
  task: Task;
  userId: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

const taskStore = new Map<string, TaskStore>();

// Clean up old tasks (older than 1 hour)
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 3600000);
  for (const [id, store] of taskStore.entries()) {
    if (store.updatedAt < oneHourAgo) {
      taskStore.delete(id);
    }
  }
}, 300000); // Run every 5 minutes

// ===== Helper Functions =====

function getTaskStore(taskId: string, organizationId: string): TaskStore | null {
  const store = taskStore.get(taskId);
  if (!store || store.organizationId !== organizationId) {
    return null;
  }
  return store;
}

function updateTaskState(taskId: string, state: TaskState, message?: Message): Task | null {
  const store = taskStore.get(taskId);
  if (!store) return null;

  store.task.status = createTaskStatus(state, message);
  store.updatedAt = new Date();
  return store.task;
}

function addArtifactToTask(taskId: string, artifact: Artifact): Task | null {
  const store = taskStore.get(taskId);
  if (!store) return null;

  if (!store.task.artifacts) {
    store.task.artifacts = [];
  }
  store.task.artifacts.push(artifact);
  store.updatedAt = new Date();
  return store.task;
}

function addMessageToHistory(taskId: string, message: Message): void {
  const store = taskStore.get(taskId);
  if (!store) return;

  if (!store.task.history) {
    store.task.history = [];
  }
  store.task.history.push(message);
  store.updatedAt = new Date();
}

// ===== Context Types =====

interface A2AContext {
  user: UserWithOrganization & { organization_id: string; organization: Organization };
  apiKeyId: string | null;
  agentIdentifier: string;
}

// ===== JSON-RPC Response Helpers =====

function a2aError(code: number, message: string, id: string | number | null, status = 400): NextResponse {
  return NextResponse.json(jsonRpcError(code, message, id), { status });
}

function a2aSuccess<T>(result: T, id: string | number | null): NextResponse {
  return NextResponse.json(jsonRpcSuccess(result, id));
}

// ===== A2A Standard Method Handlers =====

/**
 * message/send - Core A2A method
 * Sends a message to create a new task or continue an existing one
 */
async function handleMessageSend(params: MessageSendParams, ctx: A2AContext): Promise<Task | Message> {
  const { message, configuration, metadata } = params;

  if (!message?.parts?.length) {
    throw new Error("Message must contain at least one part");
  }

  // Check if user is blocked due to moderation violations
  if (await contentModerationService.shouldBlockUser(ctx.user.id)) {
    throw new Error("Account suspended due to policy violations");
  }

  // Extract text content for moderation
  const textContent = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  if (textContent) {
    contentModerationService.moderateAgentInBackground(
      textContent,
      ctx.user.id,
      ctx.agentIdentifier,
      undefined,
      (result) => {
        logger.warn("[A2A] Moderation violation detected", {
          userId: ctx.user.id,
          categories: result.flaggedCategories,
          action: result.action,
        });
      }
    );
  }

  // Create a new task
  const taskId = metadata?.taskId as string | undefined || uuidv4();
  const contextId = metadata?.contextId as string | undefined || uuidv4();

  const task = createTask(taskId, "working", undefined, contextId, metadata);

  // Store the task
  taskStore.set(taskId, {
    task,
    userId: ctx.user.id,
    organizationId: ctx.user.organization_id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Add user message to history
  addMessageToHistory(taskId, message);

  // Process the message based on content
  const result = await processA2AMessage(task, message, ctx, configuration);

  return result;
}

/**
 * Process an A2A message and generate a response
 */
async function processA2AMessage(
  task: Task,
  message: Message,
  ctx: A2AContext,
  configuration?: MessageSendParams["configuration"]
): Promise<Task> {
  const textParts = message.parts.filter((p): p is { type: "text"; text: string } => p.type === "text");
  const dataParts = message.parts.filter((p): p is { type: "data"; data: Record<string, unknown> } => p.type === "data");

  // Determine intent from message
  const textContent = textParts.map((p) => p.text).join("\n");
  const dataContent = dataParts.length > 0 ? dataParts[0].data : {};

  // Check for explicit skill request in data
  const skillId = dataContent.skill as string | undefined;

  let responseMessage: Message;
  let artifacts: Artifact[] = [];

  if (skillId === "chat_completion" || (textContent && !skillId)) {
    // Default: treat as chat completion request
    const result = await executeSkillChatCompletion(textContent, dataContent, ctx);
    responseMessage = createMessage("agent", [createTextPart(result.content)]);
    artifacts.push(createArtifact([createDataPart({
      model: result.model,
      usage: result.usage,
      cost: result.cost,
    })], "usage", "Token usage and cost information"));
  } else if (skillId === "image_generation") {
    const result = await executeSkillImageGeneration(textContent, dataContent, ctx);
    responseMessage = createMessage("agent", [
      { type: "file", file: { bytes: result.image.split(",")[1], mimeType: result.mimeType } },
    ]);
    artifacts.push(createArtifact([createDataPart({ cost: result.cost })], "cost", "Generation cost"));
  } else if (skillId === "chat_with_agent") {
    const result = await executeSkillChatWithAgent(textContent, dataContent, ctx);
    responseMessage = createMessage("agent", [createTextPart(result.response)]);
  } else if (skillId === "list_agents") {
    const result = await executeSkillListAgents(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "check_balance") {
    const result = await executeSkillCheckBalance(ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "get_usage") {
    const result = await executeSkillGetUsage(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "save_memory") {
    const result = await executeSkillSaveMemory(textContent, dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "retrieve_memories") {
    const result = await executeSkillRetrieveMemories(textContent, dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "list_containers") {
    const result = await executeSkillListContainers(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "create_conversation") {
    const result = await executeSkillCreateConversation(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "delete_memory") {
    const result = await executeSkillDeleteMemory(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "get_conversation_context") {
    const result = await executeSkillGetConversationContext(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "create_agent") {
    const result = await executeSkillCreateAgent(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "update_agent") {
    const result = await executeSkillUpdateAgent(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "delete_agent") {
    const result = await executeSkillDeleteAgent(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "video_generation" || skillId === "generate_video") {
    const result = await executeSkillVideoGeneration(textContent, dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "generate_embeddings" || skillId === "embeddings") {
    const result = await executeSkillGenerateEmbeddings(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "list_models" || skillId === "models") {
    const result = await executeSkillListModels(ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "query_knowledge" || skillId === "knowledge") {
    const result = await executeSkillQueryKnowledge(textContent, dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "list_gallery" || skillId === "gallery") {
    const result = await executeSkillListGallery(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "text_to_speech" || skillId === "tts") {
    const result = await executeSkillTextToSpeech(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "list_voices" || skillId === "voices") {
    const result = await executeSkillListVoices(ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "get_analytics" || skillId === "analytics") {
    const result = await executeSkillGetAnalytics(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "list_api_keys" || skillId === "api_keys") {
    const result = await executeSkillListApiKeys(ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "create_api_key") {
    const result = await executeSkillCreateApiKey(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "delete_api_key") {
    const result = await executeSkillDeleteApiKey(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "get_redemption_balance" || skillId === "redemptions") {
    const result = await executeSkillGetRedemptionBalance(ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "generate_prompts" || skillId === "prompts") {
    const result = await executeSkillGeneratePrompts(ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "upload_knowledge") {
    const result = await executeSkillUploadKnowledge(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "get_container") {
    const result = await executeSkillGetContainer(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "get_container_health") {
    const result = await executeSkillGetContainerHealth(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "get_container_logs") {
    const result = await executeSkillGetContainerLogs(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "list_mcps") {
    const result = await executeSkillListMcps(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "create_mcp") {
    const result = await executeSkillCreateMcp(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "delete_mcp") {
    const result = await executeSkillDeleteMcp(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "list_rooms") {
    const result = await executeSkillListRooms(ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "create_room") {
    const result = await executeSkillCreateRoom(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "get_user_profile" || skillId === "profile") {
    const result = await executeSkillGetUserProfile(ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "update_user_profile") {
    const result = await executeSkillUpdateUserProfile(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else if (skillId === "get_redemption_quote") {
    const result = await executeSkillGetRedemptionQuote(dataContent, ctx);
    responseMessage = createMessage("agent", [createDataPart(result)]);
  } else {
    // Default to chat completion for unknown skills
    const result = await executeSkillChatCompletion(textContent, dataContent, ctx);
    responseMessage = createMessage("agent", [createTextPart(result.content)]);
  }

  // Update task with response
  task.status = createTaskStatus("completed", responseMessage);
  addMessageToHistory(task.id, responseMessage);
  for (const artifact of artifacts) {
    addArtifactToTask(task.id, artifact);
  }

  // Update stored task
  const store = taskStore.get(task.id);
  if (store) {
    store.task = task;
    store.updatedAt = new Date();
  }

  return task;
}

// ===== Skill Implementations =====

async function executeSkillChatCompletion(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ content: string; model: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number }; cost: number }> {
  const model = (dataContent.model as string) || "gpt-4o";
  const messages = (dataContent.messages as Array<{ role: string; content: string }>) || [
    { role: "user", content: textContent },
  ];
  const options = {
    temperature: dataContent.temperature as number | undefined,
    maxTokens: dataContent.max_tokens as number | undefined,
  };

  const provider = getProviderFromModel(model);
  const estimatedCost = await estimateRequestCost(model, messages);

  if (Number(ctx.user.organization.credit_balance) < estimatedCost) {
    throw new Error(`Insufficient credits: need $${estimatedCost.toFixed(4)}, have $${Number(ctx.user.organization.credit_balance).toFixed(4)}`);
  }

  const deduction = await creditsService.deductCredits({
    organizationId: ctx.user.organization_id,
    amount: estimatedCost,
    description: `A2A chat: ${model}`,
    metadata: { user_id: ctx.user.id, model },
  });

  if (!deduction.success) throw new Error("Credit deduction failed");

  const result = await streamText({
    model: gateway.languageModel(model),
    messages: messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ...options,
  });

  let fullText = "";
  for await (const delta of result.textStream) fullText += delta;
  const usage = await result.usage;

  const { inputCost, outputCost, totalCost } = await calculateCost(model, provider, usage?.inputTokens || 0, usage?.outputTokens || 0);
  const costDiff = totalCost - estimatedCost;

  if (costDiff > 0) {
    await creditsService.deductCredits({ organizationId: ctx.user.organization_id, amount: costDiff, description: `A2A chat additional: ${model}`, metadata: { user_id: ctx.user.id } });
  } else if (costDiff < 0) {
    await creditsService.refundCredits({ organizationId: ctx.user.organization_id, amount: -costDiff, description: `A2A chat refund: ${model}`, metadata: { user_id: ctx.user.id } });
  }

  await usageService.create({
    organization_id: ctx.user.organization_id,
    user_id: ctx.user.id,
    api_key_id: ctx.apiKeyId,
    type: "chat",
    model,
    provider,
    input_tokens: usage?.inputTokens || 0,
    output_tokens: usage?.outputTokens || 0,
    input_cost: String(inputCost),
    output_cost: String(outputCost),
    is_successful: true,
  });

  return {
    content: fullText,
    model,
    usage: {
      inputTokens: usage?.inputTokens || 0,
      outputTokens: usage?.outputTokens || 0,
      totalTokens: usage?.totalTokens || 0,
    },
    cost: totalCost,
  };
}

async function executeSkillImageGeneration(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ image: string; mimeType: string; aspectRatio: string; cost: number }> {
  const prompt = (dataContent.prompt as string) || textContent;
  const aspectRatio = (dataContent.aspectRatio as string) || "1:1";

  if (!prompt) throw new Error("Image prompt required");

  if (Number(ctx.user.organization.credit_balance) < IMAGE_GENERATION_COST) {
    throw new Error(`Insufficient credits: need $${IMAGE_GENERATION_COST.toFixed(4)}`);
  }

  const deduction = await creditsService.deductCredits({
    organizationId: ctx.user.organization_id,
    amount: IMAGE_GENERATION_COST,
    description: "A2A image generation",
    metadata: { user_id: ctx.user.id },
  });
  if (!deduction.success) throw new Error("Credit deduction failed");

  const generation = await generationsService.create({
    organization_id: ctx.user.organization_id,
    user_id: ctx.user.id,
    api_key_id: ctx.apiKeyId,
    type: "image",
    model: "google/gemini-2.5-flash-image-preview",
    provider: "google",
    prompt,
    status: "pending",
    credits: String(IMAGE_GENERATION_COST),
    cost: String(IMAGE_GENERATION_COST),
  });

  const aspectDesc: Record<string, string> = { "1:1": "square", "16:9": "wide landscape", "9:16": "tall portrait", "4:3": "landscape", "3:4": "portrait" };
  const result = streamText({
    model: "google/gemini-2.5-flash-image-preview",
    providerOptions: { google: { responseModalities: ["TEXT", "IMAGE"] } },
    prompt: `Generate an image: ${prompt}, ${aspectDesc[aspectRatio] || "square"} composition`,
  });

  let imageBase64: string | null = null;
  let mimeType = "image/png";

  for await (const delta of result.fullStream) {
    if (delta.type === "file" && delta.file.mediaType.startsWith("image/")) {
      mimeType = delta.file.mediaType || "image/png";
      imageBase64 = `data:${mimeType};base64,${Buffer.from(delta.file.uint8Array).toString("base64")}`;
      break;
    }
  }

  if (!imageBase64) {
    await creditsService.refundCredits({ organizationId: ctx.user.organization_id, amount: IMAGE_GENERATION_COST, description: "A2A image refund (failed)", metadata: { generation_id: generation.id } });
    throw new Error("No image generated");
  }

  await generationsService.update(generation.id, { status: "completed", content: imageBase64, mime_type: mimeType, completed_at: new Date() });
  return { image: imageBase64, mimeType, aspectRatio, cost: IMAGE_GENERATION_COST };
}

async function executeSkillCheckBalance(ctx: A2AContext): Promise<{ balance: number; organizationId: string; organizationName: string }> {
  const org = await organizationsService.getById(ctx.user.organization_id);
  if (!org) throw new Error("Organization not found");
  return { balance: Number(org.credit_balance), organizationId: org.id, organizationName: org.name };
}

async function executeSkillGetUsage(dataContent: Record<string, unknown>, ctx: A2AContext): Promise<{ usage: Array<Record<string, unknown>>; total: number }> {
  const limit = Math.min(50, (dataContent.limit as number) || 10);
  const records = await usageService.listByOrganization(ctx.user.organization_id, limit);
  return {
    usage: records.map((r) => ({
      id: r.id,
      type: r.type,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      totalCost: Number(r.input_cost || 0) + Number(r.output_cost || 0),
      createdAt: r.created_at.toISOString(),
    })),
    total: records.length,
  };
}

async function executeSkillListAgents(dataContent: Record<string, unknown>, ctx: A2AContext): Promise<{ agents: Array<Record<string, unknown>>; total: number }> {
  const limit = (dataContent.limit as number) || 20;
  const chars = await charactersService.listByOrganization(ctx.user.organization_id);
  return {
    agents: chars.slice(0, limit).map((c) => ({ id: c.id, name: c.name, bio: c.bio, avatarUrl: c.avatar_url, createdAt: c.created_at })),
    total: chars.length,
  };
}

async function executeSkillChatWithAgent(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ response: string; roomId: string; messageId: string; timestamp: string }> {
  const message = (dataContent.message as string) || textContent;
  const roomId = dataContent.roomId as string | undefined;
  const entityId = dataContent.entityId as string | undefined;

  if (!message) throw new Error("Message required");

  const actualRoomId = roomId || (await agentService.getOrCreateRoom(entityId || ctx.user.id, ctx.user.organization_id));
  const response = await agentService.sendMessage({
    roomId: actualRoomId,
    entityId: entityId || ctx.user.id,
    message,
    organizationId: ctx.user.organization_id,
    streaming: false,
  });

  return { response: response.content, roomId: actualRoomId, messageId: response.messageId, timestamp: response.timestamp };
}

async function executeSkillSaveMemory(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ memoryId: string; storage: string; cost: number }> {
  const content = (dataContent.content as string) || textContent;
  const type = (dataContent.type as "fact" | "preference" | "context" | "document") || "fact";
  const roomId = dataContent.roomId as string;
  const tags = dataContent.tags as string[] | undefined;
  const metadata = dataContent.metadata as Record<string, unknown> | undefined;

  if (!content || !roomId) throw new Error("content and roomId required");

  const COST = 1;
  const deduction = await creditsService.deductCredits({ organizationId: ctx.user.organization_id, amount: COST, description: `A2A memory: ${type}`, metadata: { user_id: ctx.user.id } });
  if (!deduction.success) throw new Error("Insufficient credits");

  const result = await memoryService.saveMemory({ organizationId: ctx.user.organization_id, roomId, entityId: ctx.user.id, content, type, tags, metadata, persistent: true });
  return { memoryId: result.memoryId, storage: result.storage, cost: COST };
}

async function executeSkillRetrieveMemories(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ memories: Array<Record<string, unknown>>; count: number }> {
  const query = (dataContent.query as string) || textContent;
  const roomId = dataContent.roomId as string | undefined;
  const type = dataContent.type as string[] | undefined;
  const tags = dataContent.tags as string[] | undefined;
  const limit = Math.min(50, (dataContent.limit as number) || 10);
  const sortBy = (dataContent.sortBy as "relevance" | "recent" | "importance") || "relevance";

  const memories = await memoryService.retrieveMemories({ organizationId: ctx.user.organization_id, query, roomId, type, tags, limit, sortBy });
  return {
    memories: memories.map((m) => ({
      id: m.memory.id,
      content: m.memory.content,
      score: m.score,
      createdAt: m.memory.createdAt,
    })),
    count: memories.length,
  };
}

async function executeSkillCreateConversation(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ conversationId: string; title: string; model: string; cost: number }> {
  const title = dataContent.title as string;
  const model = (dataContent.model as string) || "gpt-4o";
  const systemPrompt = dataContent.systemPrompt as string | undefined;

  if (!title) throw new Error("title required");

  const COST = 1;
  const deduction = await creditsService.deductCredits({ organizationId: ctx.user.organization_id, amount: COST, description: `A2A conversation: ${title}`, metadata: { user_id: ctx.user.id } });
  if (!deduction.success) throw new Error("Insufficient credits");

  const conv = await conversationsService.create({ organization_id: ctx.user.organization_id, user_id: ctx.user.id, title, model, settings: { systemPrompt } });
  return { conversationId: conv.id, title: conv.title, model: conv.model, cost: COST };
}

async function executeSkillListContainers(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ containers: Array<Record<string, unknown>>; total: number }> {
  const status = dataContent.status as string | undefined;
  let containers = await containersService.listByOrganization(ctx.user.organization_id);
  if (status) containers = containers.filter((c) => c.status === status);
  return {
    containers: containers.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      url: c.load_balancer_url,
      createdAt: c.created_at,
    })),
    total: containers.length,
  };
}

// ===== Additional Skills for Full Coverage =====

async function executeSkillDeleteMemory(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ success: boolean; memoryId: string }> {
  const memoryId = dataContent.memoryId as string;
  if (!memoryId) throw new Error("memoryId required");

  await memoryService.deleteMemory({ organizationId: ctx.user.organization_id, memoryId });
  return { success: true, memoryId };
}

async function executeSkillGetConversationContext(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ context: Record<string, unknown> }> {
  const conversationId = dataContent.conversationId as string;
  if (!conversationId) throw new Error("conversationId required");

  const conversation = await conversationsService.getById(conversationId);
  if (!conversation || conversation.organization_id !== ctx.user.organization_id) {
    throw new Error("Conversation not found");
  }

  return {
    context: {
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      settings: conversation.settings,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    },
  };
}

async function executeSkillCreateAgent(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ agentId: string; name: string }> {
  const name = dataContent.name as string;
  const bio = dataContent.bio as string | string[];
  const system = dataContent.system as string | undefined;
  const category = dataContent.category as string | undefined;
  const tags = dataContent.tags as string[] | undefined;

  if (!name) throw new Error("name required");

  const character = await charactersService.create({
    organization_id: ctx.user.organization_id,
    user_id: ctx.user.id,
    name,
    bio: Array.isArray(bio) ? bio : [bio || ""],
    system: system || null,
    category: category || "assistant",
    tags: tags || [],
    source: "a2a",
  });

  return { agentId: character.id, name: character.name };
}

async function executeSkillUpdateAgent(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ success: boolean; agentId: string }> {
  const agentId = dataContent.agentId as string;
  if (!agentId) throw new Error("agentId required");

  const updates: Record<string, unknown> = {};
  if (dataContent.name) updates.name = dataContent.name;
  if (dataContent.bio) updates.bio = Array.isArray(dataContent.bio) ? dataContent.bio : [dataContent.bio as string];
  if (dataContent.system !== undefined) updates.system = dataContent.system;
  if (dataContent.category) updates.category = dataContent.category;
  if (dataContent.tags) updates.tags = dataContent.tags;

  const updated = await charactersService.updateForUser(agentId, ctx.user.id, updates);
  if (!updated) throw new Error("Agent not found or not owned by user");

  return { success: true, agentId };
}

async function executeSkillDeleteAgent(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ success: boolean; agentId: string }> {
  const agentId = dataContent.agentId as string;
  if (!agentId) throw new Error("agentId required");

  const deleted = await charactersService.deleteForUser(agentId, ctx.user.id);
  if (!deleted) throw new Error("Agent not found or not owned by user");

  return { success: true, agentId };
}

async function executeSkillVideoGeneration(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ jobId: string; status: string; cost: number }> {
  const prompt = (dataContent.prompt as string) || textContent;
  const model = (dataContent.model as string) || "fal-ai/veo3";

  if (!prompt) throw new Error("Video prompt required");

  // Video generation costs more than images
  const VIDEO_COST = 5; // $5 per video

  if (Number(ctx.user.organization.credit_balance) < VIDEO_COST) {
    throw new Error(`Insufficient credits: need $${VIDEO_COST.toFixed(2)}`);
  }

  const deduction = await creditsService.deductCredits({
    organizationId: ctx.user.organization_id,
    amount: VIDEO_COST,
    description: "A2A video generation",
    metadata: { user_id: ctx.user.id, model },
  });
  if (!deduction.success) throw new Error("Credit deduction failed");

  const generation = await generationsService.create({
    organization_id: ctx.user.organization_id,
    user_id: ctx.user.id,
    api_key_id: ctx.apiKeyId,
    type: "video",
    model,
    provider: "fal",
    prompt,
    status: "pending",
    credits: String(VIDEO_COST),
    cost: String(VIDEO_COST),
  });

  // Note: Actual video generation is async and would be handled by a queue
  // For now, return the job ID for polling
  return {
    jobId: generation.id,
    status: "pending",
    cost: VIDEO_COST,
  };
}

async function executeSkillGenerateEmbeddings(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ embeddings: number[][]; model: string; usage: { totalTokens: number }; cost: number }> {
  const input = dataContent.input as string | string[];
  const model = (dataContent.model as string) || "text-embedding-3-small";

  if (!input) throw new Error("input required");

  const inputs = Array.isArray(input) ? input : [input];
  const { getProvider } = await import("@/lib/providers");
  const { estimateTokens } = await import("@/lib/pricing");

  // Estimate cost
  const totalTokens = inputs.reduce((sum, text) => sum + estimateTokens(text), 0);
  const COST_PER_TOKEN = 0.00002 / 1000; // $0.00002 per 1K tokens
  const estimatedCost = totalTokens * COST_PER_TOKEN;

  if (Number(ctx.user.organization.credit_balance) < estimatedCost) {
    throw new Error(`Insufficient credits: need $${estimatedCost.toFixed(6)}`);
  }

  const deduction = await creditsService.deductCredits({
    organizationId: ctx.user.organization_id,
    amount: estimatedCost,
    description: `A2A embeddings: ${model}`,
    metadata: { user_id: ctx.user.id, model, tokenCount: totalTokens },
  });
  if (!deduction.success) throw new Error("Credit deduction failed");

  const provider = getProvider();
  const response = await provider.createEmbeddings({ model, input: inputs });
  const data = await response.json();

  return {
    embeddings: data.data.map((d: { embedding: number[] }) => d.embedding),
    model,
    usage: { totalTokens },
    cost: estimatedCost,
  };
}

async function executeSkillListModels(
  ctx: A2AContext
): Promise<{ models: Array<{ id: string; owned_by: string; created: number }> }> {
  const { getProvider } = await import("@/lib/providers");
  const provider = getProvider();
  const response = await provider.listModels();
  const data = await response.json();

  return {
    models: data.data.map((m: { id: string; owned_by: string; created: number }) => ({
      id: m.id,
      owned_by: m.owned_by,
      created: m.created,
    })),
  };
}

async function executeSkillQueryKnowledge(
  query: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ results: Array<{ content: string; score: number; id: string }>; count: number }> {
  const characterId = dataContent.characterId as string | undefined;
  const limit = Math.min(20, (dataContent.limit as number) || 5);

  if (!query) throw new Error("query required");

  // Query knowledge base via memory service (which has RAG capabilities)
  const results = await memoryService.retrieveMemories({
    organizationId: ctx.user.organization_id,
    query,
    roomId: characterId,
    limit,
    sortBy: "relevance",
  });

  return {
    results: results.map((r) => ({
      content: r.memory.content?.text || String(r.memory.content),
      score: r.score,
      id: r.memory.id,
    })),
    count: results.length,
  };
}

async function executeSkillListGallery(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ media: Array<{ id: string; type: string; url: string; prompt: string; createdAt: string }>; total: number }> {
  const type = dataContent.type as "image" | "video" | undefined;
  const limit = Math.min(50, (dataContent.limit as number) || 20);

  const generations = await generationsService.listByOrganization(ctx.user.organization_id, limit);
  let filtered = generations;
  if (type) {
    filtered = generations.filter((g) => g.type === type);
  }

  return {
    media: filtered.map((g) => ({
      id: g.id,
      type: g.type,
      url: g.storage_url || g.content || "",
      prompt: g.prompt || "",
      createdAt: g.created_at.toISOString(),
    })),
    total: filtered.length,
  };
}

// ===== Additional Skills for 100% Coverage =====

async function executeSkillTextToSpeech(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ audioUrl: string; format: string; cost: number }> {
  const text = dataContent.text as string;
  const voiceId = (dataContent.voiceId as string) || "21m00Tcm4TlvDq8ikWAM"; // Default voice
  
  if (!text) throw new Error("text required");
  if (text.length > 5000) throw new Error("Text too long (max 5000 chars)");

  const TTS_COST = 0.001 * Math.ceil(text.length / 100); // ~$0.001 per 100 chars
  
  const deduction = await creditsService.deductCredits({
    organizationId: ctx.user.organization_id,
    amount: TTS_COST,
    description: "A2A text-to-speech",
    metadata: { user_id: ctx.user.id, chars: text.length },
  });
  if (!deduction.success) throw new Error("Insufficient credits");

  const { getElevenLabsService } = await import("@/lib/services/elevenlabs");
  const elevenLabs = await getElevenLabsService();
  const audioBuffer = await elevenLabs.textToSpeech(text, voiceId);

  // Upload to blob storage
  const { uploadFromBuffer } = await import("@/lib/blob");
  const audioUrl = await uploadFromBuffer(audioBuffer, `tts-${Date.now()}.mp3`, "audio/mpeg");

  return { audioUrl, format: "mp3", cost: TTS_COST };
}

async function executeSkillListVoices(
  ctx: A2AContext
): Promise<{ voices: Array<{ id: string; name: string; category: string }> }> {
  const { getElevenLabsService } = await import("@/lib/services/elevenlabs");
  const elevenLabs = await getElevenLabsService();
  const voices = await elevenLabs.listVoices();

  return {
    voices: voices.map((v: { voice_id: string; name: string; category: string }) => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
    })),
  };
}

async function executeSkillGetAnalytics(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ overview: Record<string, unknown> }> {
  const timeRange = (dataContent.timeRange as "daily" | "weekly" | "monthly") || "daily";

  const { analyticsService } = await import("@/lib/services/analytics");
  const overview = await analyticsService.getOverview(ctx.user.organization_id, timeRange);

  return {
    overview: {
      totalRequests: overview.summary.totalRequests,
      successRate: overview.summary.successRate,
      totalCost: overview.summary.totalCost,
      avgCostPerRequest: overview.summary.avgCostPerRequest,
      timeRange,
    },
  };
}

async function executeSkillListApiKeys(
  ctx: A2AContext
): Promise<{ apiKeys: Array<{ id: string; name: string; keyPrefix: string; createdAt: string }> }> {
  const keys = await apiKeysService.listByOrganization(ctx.user.organization_id);

  return {
    apiKeys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix,
      createdAt: k.created_at.toISOString(),
    })),
  };
}

async function executeSkillCreateApiKey(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ apiKey: { id: string; name: string; keyPrefix: string }; plainKey: string }> {
  const name = dataContent.name as string;
  const description = dataContent.description as string | undefined;
  const rateLimit = (dataContent.rateLimit as number) || 1000;

  if (!name) throw new Error("name required");

  const { apiKey, plainKey } = await apiKeysService.create({
    name,
    description: description || null,
    organization_id: ctx.user.organization_id,
    user_id: ctx.user.id,
    permissions: [],
    rate_limit: rateLimit,
    expires_at: null,
    is_active: true,
  });

  return {
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.key_prefix,
    },
    plainKey, // Only returned once!
  };
}

async function executeSkillDeleteApiKey(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ success: boolean; apiKeyId: string }> {
  const apiKeyId = dataContent.apiKeyId as string;
  if (!apiKeyId) throw new Error("apiKeyId required");

  await apiKeysService.delete(apiKeyId, ctx.user.organization_id);
  return { success: true, apiKeyId };
}

async function executeSkillGetRedemptionBalance(
  ctx: A2AContext
): Promise<{ redeemableBalance: number; pendingRedemptions: number }> {
  const { secureTokenRedemptionService } = await import("@/lib/services/token-redemption-secure");
  const balance = await secureTokenRedemptionService.getEarnedBalance(ctx.user.organization_id);
  const pending = await secureTokenRedemptionService.getPendingRedemptions(ctx.user.organization_id);

  return {
    redeemableBalance: balance,
    pendingRedemptions: pending.reduce((sum, p) => sum + p.pointsAmount, 0),
  };
}

async function executeSkillGeneratePrompts(
  ctx: A2AContext
): Promise<{ prompts: string[] }> {
  const { openai } = await import("@ai-sdk/openai");
  const { generateText } = await import("ai");

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    prompt: `Generate 4 short, practical AI agent concepts (max 8 words each). Return ONLY a JSON array of strings, nothing else.
Examples:
- "Technical documentation writer with dry humor"
- "Personal finance advisor for freelancers"
- "Code reviewer focused on security best practices"`,
  });

  const prompts = JSON.parse(text);
  return { prompts };
}

async function executeSkillUploadKnowledge(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ documentId: string; status: string }> {
  const content = dataContent.content as string;
  const title = dataContent.title as string;
  const characterId = dataContent.characterId as string | undefined;

  if (!content) throw new Error("content required");
  if (!title) throw new Error("title required");

  // Save as a document in memory service
  const result = await memoryService.saveMemory({
    organizationId: ctx.user.organization_id,
    content,
    roomId: characterId,
    metadata: { title, type: "knowledge" },
  });

  return {
    documentId: result.memoryId,
    status: "indexed",
  };
}

// ===== Container Management =====

async function executeSkillGetContainer(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ container: Record<string, unknown> }> {
  const containerId = dataContent.containerId as string;
  if (!containerId) throw new Error("containerId required");

  const { getContainer } = await import("@/lib/services");
  const container = await getContainer(containerId, ctx.user.organization_id);
  if (!container) throw new Error("Container not found");

  return {
    container: {
      id: container.id,
      name: container.name,
      status: container.status,
      url: container.load_balancer_url,
      createdAt: container.created_at,
    },
  };
}

async function executeSkillGetContainerHealth(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ healthy: boolean; status: string }> {
  const containerId = dataContent.containerId as string;
  if (!containerId) throw new Error("containerId required");

  const { getContainer } = await import("@/lib/services");
  const container = await getContainer(containerId, ctx.user.organization_id);
  if (!container) throw new Error("Container not found");

  return {
    healthy: container.status === "running",
    status: container.status,
  };
}

async function executeSkillGetContainerLogs(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ logs: string[]; containerId: string }> {
  const containerId = dataContent.containerId as string;
  const limit = Math.min(100, (dataContent.limit as number) || 50);
  if (!containerId) throw new Error("containerId required");

  const { getContainer } = await import("@/lib/services");
  const container = await getContainer(containerId, ctx.user.organization_id);
  if (!container) throw new Error("Container not found");

  // Logs would come from CloudWatch in production
  return {
    logs: [`Container ${containerId} logs (last ${limit} entries)`, `Status: ${container.status}`],
    containerId,
  };
}

// ===== MCP Server Management =====

async function executeSkillListMcps(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ mcps: Array<Record<string, unknown>>; total: number }> {
  const scope = (dataContent.scope as "own" | "public") || "own";
  const limit = Math.min(50, (dataContent.limit as number) || 20);

  const { userMcpsService } = await import("@/lib/services");
  const mcps = await userMcpsService.list({
    organizationId: ctx.user.organization_id,
    scope,
    limit,
    offset: 0,
  });

  return {
    mcps: mcps.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      description: m.description,
      status: m.status,
      pricingType: m.pricing_type,
    })),
    total: mcps.length,
  };
}

async function executeSkillCreateMcp(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ mcpId: string; slug: string }> {
  const name = dataContent.name as string;
  const slug = dataContent.slug as string;
  const description = dataContent.description as string;

  if (!name || !slug || !description) {
    throw new Error("name, slug, and description required");
  }

  const { userMcpsService } = await import("@/lib/services");
  const mcp = await userMcpsService.create({
    organization_id: ctx.user.organization_id,
    user_id: ctx.user.id,
    name,
    slug,
    description,
    status: "draft",
  });

  return { mcpId: mcp.id, slug: mcp.slug };
}

async function executeSkillDeleteMcp(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ success: boolean; mcpId: string }> {
  const mcpId = dataContent.mcpId as string;
  if (!mcpId) throw new Error("mcpId required");

  const { userMcpsService } = await import("@/lib/services");
  await userMcpsService.delete(mcpId, ctx.user.organization_id);

  return { success: true, mcpId };
}

// ===== Eliza Rooms =====

async function executeSkillListRooms(
  ctx: A2AContext
): Promise<{ rooms: Array<Record<string, unknown>>; total: number }> {
  const { roomsService } = await import("@/lib/services/agents/rooms");
  const rooms = await roomsService.getRoomsForEntity(ctx.user.id);

  return {
    rooms: rooms.map((r) => ({
      id: r.id,
      characterId: r.character_id,
      lastMessage: r.last_message_preview,
      updatedAt: r.updated_at,
    })),
    total: rooms.length,
  };
}

async function executeSkillCreateRoom(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ roomId: string; characterId: string }> {
  const characterId = dataContent.characterId as string;

  const { roomsService } = await import("@/lib/services/agents/rooms");
  const room = await roomsService.createRoom({
    userId: ctx.user.id,
    characterId: characterId || "b850bc30-45f8-0041-a00a-83df46d8555d", // Default Eliza
  });

  return { roomId: room.id, characterId: room.character_id };
}

// ===== User Profile =====

async function executeSkillGetUserProfile(
  ctx: A2AContext
): Promise<{ user: Record<string, unknown> }> {
  return {
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      organizationId: ctx.user.organization_id,
      creditBalance: ctx.user.organization.credit_balance,
    },
  };
}

async function executeSkillUpdateUserProfile(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ success: boolean }> {
  const name = dataContent.name as string | undefined;

  if (name) {
    const { usersService } = await import("@/lib/services");
    await usersService.update(ctx.user.id, { name });
  }

  return { success: true };
}

// ===== Redemption =====

async function executeSkillGetRedemptionQuote(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ quote: Record<string, unknown> }> {
  const pointsAmount = dataContent.pointsAmount as number;
  const network = dataContent.network as string;

  if (!pointsAmount || !network) throw new Error("pointsAmount and network required");

  const { secureTokenRedemptionService } = await import("@/lib/services/token-redemption-secure");
  const quote = await secureTokenRedemptionService.getRedemptionQuote(pointsAmount, network);

  return { quote };
}

// ===== tasks/get Handler =====

async function handleTasksGet(params: TaskGetParams, ctx: A2AContext): Promise<Task> {
  const { id, historyLength } = params;

  const store = getTaskStore(id, ctx.user.organization_id);
  if (!store) {
    throw new Error(`Task not found: ${id}`);
  }

  const task = { ...store.task };

  // Optionally truncate history
  if (historyLength !== undefined && task.history) {
    task.history = task.history.slice(-historyLength);
  }

  return task;
}

// ===== tasks/cancel Handler =====

async function handleTasksCancel(params: TaskCancelParams, ctx: A2AContext): Promise<Task> {
  const { id } = params;

  const store = getTaskStore(id, ctx.user.organization_id);
  if (!store) {
    throw new Error(`Task not found: ${id}`);
  }

  // Check if task can be canceled
  const terminalStates: TaskState[] = ["completed", "canceled", "failed", "rejected"];
  if (terminalStates.includes(store.task.status.state)) {
    throw new Error(`Task ${id} is already in terminal state: ${store.task.status.state}`);
  }

  // Update task state
  const task = updateTaskState(id, "canceled");
  if (!task) {
    throw new Error(`Failed to update task: ${id}`);
  }

  return task;
}

// ===== Legacy Method Handlers (backwards compatibility) =====

const handleLegacyChatCompletion = async (params: Record<string, unknown>, ctx: A2AContext) => {
  const result = await executeSkillChatCompletion("", params, ctx);
  return {
    content: result.content,
    model: result.model,
    usage: { prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens, total_tokens: result.usage.totalTokens },
    cost: result.cost,
  };
};

const handleLegacyGenerateImage = async (params: Record<string, unknown>, ctx: A2AContext) => {
  const prompt = params.prompt as string;
  const result = await executeSkillImageGeneration(prompt, params, ctx);
  return result;
};

const handleLegacyGetBalance = async (_params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillCheckBalance(ctx);
};

const handleLegacyGetUsage = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillGetUsage(params, ctx);
};

const handleLegacyListAgents = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillListAgents(params, ctx);
};

const handleLegacyChatWithAgent = async (params: Record<string, unknown>, ctx: A2AContext) => {
  const message = params.message as string;
  return executeSkillChatWithAgent(message, params, ctx);
};

const handleLegacySaveMemory = async (params: Record<string, unknown>, ctx: A2AContext) => {
  const content = params.content as string;
  return executeSkillSaveMemory(content, params, ctx);
};

const handleLegacyRetrieveMemories = async (params: Record<string, unknown>, ctx: A2AContext) => {
  const query = params.query as string || "";
  return executeSkillRetrieveMemories(query, params, ctx);
};

const handleLegacyCreateConversation = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillCreateConversation(params, ctx);
};

const handleLegacyListContainers = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillListContainers(params, ctx);
};

// ===== Additional Legacy Handlers for Full Coverage =====

const handleLegacyDeleteMemory = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillDeleteMemory(params, ctx);
};

const handleLegacyGetConversationContext = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillGetConversationContext(params, ctx);
};

const handleLegacyCreateAgent = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillCreateAgent(params, ctx);
};

const handleLegacyUpdateAgent = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillUpdateAgent(params, ctx);
};

const handleLegacyDeleteAgent = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillDeleteAgent(params, ctx);
};

const handleLegacyGenerateVideo = async (params: Record<string, unknown>, ctx: A2AContext) => {
  const prompt = params.prompt as string;
  return executeSkillVideoGeneration(prompt, params, ctx);
};

const handleLegacyGenerateEmbeddings = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillGenerateEmbeddings(params, ctx);
};

const handleLegacyListModels = async (_params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillListModels(ctx);
};

const handleLegacyQueryKnowledge = async (params: Record<string, unknown>, ctx: A2AContext) => {
  const query = params.query as string;
  return executeSkillQueryKnowledge(query, params, ctx);
};

const handleLegacyListGallery = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillListGallery(params, ctx);
};

const handleLegacyTextToSpeech = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillTextToSpeech(params, ctx);
};

const handleLegacyListVoices = async (_params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillListVoices(ctx);
};

const handleLegacyGetAnalytics = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillGetAnalytics(params, ctx);
};

const handleLegacyListApiKeys = async (_params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillListApiKeys(ctx);
};

const handleLegacyCreateApiKey = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillCreateApiKey(params, ctx);
};

const handleLegacyDeleteApiKey = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillDeleteApiKey(params, ctx);
};

const handleLegacyGetRedemptionBalance = async (_params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillGetRedemptionBalance(ctx);
};

const handleLegacyGeneratePrompts = async (_params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillGeneratePrompts(ctx);
};

const handleLegacyUploadKnowledge = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillUploadKnowledge(params, ctx);
};

const handleLegacyGetContainer = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillGetContainer(params, ctx);
};

const handleLegacyGetContainerHealth = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillGetContainerHealth(params, ctx);
};

const handleLegacyGetContainerLogs = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillGetContainerLogs(params, ctx);
};

const handleLegacyListMcps = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillListMcps(params, ctx);
};

const handleLegacyCreateMcp = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillCreateMcp(params, ctx);
};

const handleLegacyDeleteMcp = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillDeleteMcp(params, ctx);
};

const handleLegacyListRooms = async (_params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillListRooms(ctx);
};

const handleLegacyCreateRoom = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillCreateRoom(params, ctx);
};

const handleLegacyGetUserProfile = async (_params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillGetUserProfile(ctx);
};

const handleLegacyUpdateUserProfile = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillUpdateUserProfile(params, ctx);
};

const handleLegacyGetRedemptionQuote = async (params: Record<string, unknown>, ctx: A2AContext) => {
  return executeSkillGetRedemptionQuote(params, ctx);
};

// ===== Method Registry =====

type MethodHandler<T = Record<string, unknown>, R = unknown> = (params: T, ctx: A2AContext) => Promise<R>;

interface MethodDefinition {
  handler: MethodHandler;
  description: string;
}

const METHODS: Record<string, MethodDefinition> = {
  // A2A Standard Methods
  "message/send": {
    handler: handleMessageSend as MethodHandler,
    description: "Send a message to create/continue a task (A2A standard)",
  },
  "tasks/get": {
    handler: handleTasksGet as MethodHandler,
    description: "Get task status and history (A2A standard)",
  },
  "tasks/cancel": {
    handler: handleTasksCancel as MethodHandler,
    description: "Cancel a running task (A2A standard)",
  },

  // Legacy/Extension Methods (backwards compatibility)
  "a2a.chatCompletion": {
    handler: handleLegacyChatCompletion,
    description: "Generate text with LLMs (extension)",
  },
  "a2a.generateImage": {
    handler: handleLegacyGenerateImage,
    description: "Generate images (extension)",
  },
  "a2a.getBalance": {
    handler: handleLegacyGetBalance,
    description: "Check credit balance (extension)",
  },
  "a2a.getUsage": {
    handler: handleLegacyGetUsage,
    description: "Get usage stats (extension)",
  },
  "a2a.listAgents": {
    handler: handleLegacyListAgents,
    description: "List agents (extension)",
  },
  "a2a.chatWithAgent": {
    handler: handleLegacyChatWithAgent,
    description: "Chat with agent (extension)",
  },
  "a2a.saveMemory": {
    handler: handleLegacySaveMemory,
    description: "Save memory (extension)",
  },
  "a2a.retrieveMemories": {
    handler: handleLegacyRetrieveMemories,
    description: "Retrieve memories (extension)",
  },
  "a2a.createConversation": {
    handler: handleLegacyCreateConversation,
    description: "Create conversation (extension)",
  },
  "a2a.listContainers": {
    handler: handleLegacyListContainers,
    description: "List containers (extension)",
  },
  "a2a.deleteMemory": {
    handler: handleLegacyDeleteMemory,
    description: "Delete memory (extension)",
  },
  "a2a.getConversationContext": {
    handler: handleLegacyGetConversationContext,
    description: "Get conversation context (extension)",
  },
  "a2a.createAgent": {
    handler: handleLegacyCreateAgent,
    description: "Create agent (extension)",
  },
  "a2a.updateAgent": {
    handler: handleLegacyUpdateAgent,
    description: "Update agent (extension)",
  },
  "a2a.deleteAgent": {
    handler: handleLegacyDeleteAgent,
    description: "Delete agent (extension)",
  },
  "a2a.generateVideo": {
    handler: handleLegacyGenerateVideo,
    description: "Generate video (extension)",
  },
  "a2a.generateEmbeddings": {
    handler: handleLegacyGenerateEmbeddings,
    description: "Generate embeddings (extension)",
  },
  "a2a.listModels": {
    handler: handleLegacyListModels,
    description: "List available AI models (extension)",
  },
  "a2a.queryKnowledge": {
    handler: handleLegacyQueryKnowledge,
    description: "Query knowledge base (extension)",
  },
  "a2a.listGallery": {
    handler: handleLegacyListGallery,
    description: "List generated media (extension)",
  },
  "a2a.textToSpeech": {
    handler: handleLegacyTextToSpeech,
    description: "Convert text to speech (extension)",
  },
  "a2a.listVoices": {
    handler: handleLegacyListVoices,
    description: "List available voices (extension)",
  },
  "a2a.getAnalytics": {
    handler: handleLegacyGetAnalytics,
    description: "Get usage analytics (extension)",
  },
  "a2a.listApiKeys": {
    handler: handleLegacyListApiKeys,
    description: "List API keys (extension)",
  },
  "a2a.createApiKey": {
    handler: handleLegacyCreateApiKey,
    description: "Create API key (extension)",
  },
  "a2a.deleteApiKey": {
    handler: handleLegacyDeleteApiKey,
    description: "Delete API key (extension)",
  },
  "a2a.getRedemptionBalance": {
    handler: handleLegacyGetRedemptionBalance,
    description: "Get token redemption balance (extension)",
  },
  "a2a.generatePrompts": {
    handler: handleLegacyGeneratePrompts,
    description: "Generate agent prompts (extension)",
  },
  "a2a.uploadKnowledge": {
    handler: handleLegacyUploadKnowledge,
    description: "Upload knowledge document (extension)",
  },
  "a2a.getContainer": {
    handler: handleLegacyGetContainer,
    description: "Get container details (extension)",
  },
  "a2a.getContainerHealth": {
    handler: handleLegacyGetContainerHealth,
    description: "Get container health status (extension)",
  },
  "a2a.getContainerLogs": {
    handler: handleLegacyGetContainerLogs,
    description: "Get container logs (extension)",
  },
  "a2a.listMcps": {
    handler: handleLegacyListMcps,
    description: "List MCP servers (extension)",
  },
  "a2a.createMcp": {
    handler: handleLegacyCreateMcp,
    description: "Create MCP server (extension)",
  },
  "a2a.deleteMcp": {
    handler: handleLegacyDeleteMcp,
    description: "Delete MCP server (extension)",
  },
  "a2a.listRooms": {
    handler: handleLegacyListRooms,
    description: "List chat rooms (extension)",
  },
  "a2a.createRoom": {
    handler: handleLegacyCreateRoom,
    description: "Create chat room (extension)",
  },
  "a2a.getUserProfile": {
    handler: handleLegacyGetUserProfile,
    description: "Get user profile (extension)",
  },
  "a2a.updateUserProfile": {
    handler: handleLegacyUpdateUserProfile,
    description: "Update user profile (extension)",
  },
  "a2a.getRedemptionQuote": {
    handler: handleLegacyGetRedemptionQuote,
    description: "Get token redemption quote (extension)",
  },
};

// ===== Request Schema =====

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});

// ===== Main POST Handler =====

export async function POST(request: NextRequest) {
  // Parse JSON - user-supplied data requires parse error handling
  let body: unknown;
  const bodyText = await request.text();
  try {
    body = JSON.parse(bodyText);
  } catch {
    return a2aError(A2AErrorCodes.PARSE_ERROR, "Parse error: Invalid JSON", null);
  }

  const parsed = JsonRpcRequestSchema.safeParse(body);
  if (!parsed.success) {
    return a2aError(A2AErrorCodes.INVALID_REQUEST, "Invalid Request: Does not conform to JSON-RPC 2.0", null);
  }

  const { method, params, id } = parsed.data;

  // Auth - user-supplied credentials require error handling
  let authResult: Awaited<ReturnType<typeof requireAuthOrApiKeyWithOrg>>;
  try {
    authResult = await requireAuthOrApiKeyWithOrg(request);
  } catch (e) {
    // Return 402 with payment info if x402 is enabled, so agents know they can pay to get credits
    const { X402_RECIPIENT_ADDRESS, getDefaultNetwork, USDC_ADDRESSES, TOPUP_PRICE, CREDITS_PER_DOLLAR, isX402Configured } = await import("@/lib/config/x402");
    if (isX402Configured()) {
      return NextResponse.json(
        jsonRpcError(A2AErrorCodes.AUTHENTICATION_REQUIRED, "Authentication required. Get an API key or top up credits via x402 payment at /api/v1/credits/topup", id, {
          x402: {
            topupEndpoint: "/api/v1/credits/topup",
            network: getDefaultNetwork(),
            asset: USDC_ADDRESSES[getDefaultNetwork()],
            payTo: X402_RECIPIENT_ADDRESS,
            minimumTopup: TOPUP_PRICE,
            creditsPerDollar: CREDITS_PER_DOLLAR,
          },
        }),
        { status: 402 }
      );
    }
    return a2aError(A2AErrorCodes.AUTHENTICATION_REQUIRED, e instanceof Error ? e.message : "Auth failed", id, 401);
  }

  // ===== Agent Reputation Tracking =====
  // Create agent identifier from organization ID (or ERC-8004 headers if present)
  const agentTokenId = request.headers.get("x-agent-token-id");
  const agentChainId = request.headers.get("x-agent-chain-id");
  const agentIdentifier = agentChainId && agentTokenId
    ? `${agentChainId}:${agentTokenId}`
    : `org:${authResult.user.organization_id}`;

  // Check if agent is banned
  const isAgentBanned = await agentReputationService.shouldBlockAgent(agentIdentifier);
  if (isAgentBanned) {
    return a2aError(A2AErrorCodes.AGENT_BANNED, "Agent is banned due to policy violations", id, 403);
  }

  // Get agent reputation for rate limiting
  const agent = await agentReputationService.getAgent(agentIdentifier);
  const trustLevel = (agent?.trustLevel ?? "neutral") as "untrusted" | "low" | "neutral" | "trusted" | "verified";
  const rateLimit = agentReputationService.getRateLimitForTrustLevel(trustLevel);

  // Rate limit based on trust level
  const rateLimitResult = await checkRateLimitRedis(`a2a:${agentIdentifier}`, 60000, rateLimit);
  if (!rateLimitResult.allowed) {
    return a2aError(A2AErrorCodes.RATE_LIMITED, `Rate limited. Trust level: ${trustLevel}`, id, 429);
  }

  // Find handler
  const methodDef = METHODS[method];
  if (!methodDef) {
    return a2aError(A2AErrorCodes.METHOD_NOT_FOUND, `Method not found: ${method}`, id, 404);
  }

  // Execute
  logger.info(`[A2A] ${method}`, { org: authResult.user.organization_id, user: authResult.user.id, agentIdentifier, trustLevel });
  const ctx: A2AContext = { user: authResult.user, apiKeyId: authResult.apiKey?.id || null, agentIdentifier };

  try {
    const result = await methodDef.handler(params || {}, ctx);

    // Track successful request for reputation (fire and forget)
    agentReputationService.recordRequest({
      agentIdentifier,
      isSuccessful: true,
      method,
    }).catch((err) => logger.error("[A2A] Failed to record request", { error: err }));

    return a2aSuccess(result, id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";

    // Determine error code based on message
    let code = A2AErrorCodes.INTERNAL_ERROR;
    let status = 500;

    if (msg.includes("Insufficient")) {
      code = A2AErrorCodes.INSUFFICIENT_CREDITS;
      status = 402;
    } else if (msg.includes("not found")) {
      code = A2AErrorCodes.TASK_NOT_FOUND;
      status = 404;
    } else if (msg.includes("suspended") || msg.includes("banned")) {
      code = A2AErrorCodes.AGENT_BANNED;
      status = 403;
    }

    // Track failed request for reputation (fire and forget)
    agentReputationService.recordRequest({
      agentIdentifier,
      isSuccessful: false,
      method,
    }).catch((err) => logger.error("[A2A] Failed to record failed request", { error: err }));

    return a2aError(code, msg, id, status);
  }
}

// ===== GET Handler - Service Discovery =====

export async function GET() {
  return NextResponse.json({
    name: "Eliza Cloud A2A",
    version: "1.0.0",
    protocolVersion: "0.3.0",
    protocol: "JSON-RPC 2.0",
    documentation: "https://google.github.io/a2a-spec/",
    agentCard: "/.well-known/agent-card.json",
    methods: Object.entries(METHODS).map(([name, def]) => ({
      name,
      description: def.description,
      isStandard: name.includes("/"), // A2A standard methods use / separator
    })),
  });
}

// ===== OPTIONS Handler - CORS =====

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-PAYMENT, X-Agent-Token-Id, X-Agent-Chain-Id",
    },
  });
}
