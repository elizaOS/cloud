/**
 * A2A Skills Implementation
 *
 * Core skill implementations for A2A protocol.
 * Only includes skills that are fully tested and working.
 */

import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { organizationsService } from "@/lib/services/organizations";
import { generationsService } from "@/lib/services/generations";
import { memoryService } from "@/lib/services/memory";
import { charactersService } from "@/lib/services/characters/characters";
import { containersService } from "@/lib/services/containers";
import { agentService } from "@/lib/services/agents/agents";
import {
  calculateCost,
  getProviderFromModel,
  estimateRequestCost,
  IMAGE_GENERATION_COST,
} from "@/lib/pricing";
import type {
  A2AContext,
  ChatCompletionResult,
  ImageGenerationResult,
  BalanceResult,
  UsageResult,
  ListAgentsResult,
  ChatWithAgentResult,
  SaveMemoryResult,
  RetrieveMemoriesResult,
  ListContainersResult,
  VideoGenerationResult,
} from "./types";

/**
 * Chat completion skill - Generate text with LLMs
 */
export async function executeSkillChatCompletion(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<ChatCompletionResult> {
  const model = (dataContent.model as string) || "gpt-4o";
  const messages = (dataContent.messages as Array<{
    role: string;
    content: string;
  }>) || [{ role: "user", content: textContent }];
  const options = {
    temperature: dataContent.temperature as number | undefined,
    maxTokens: dataContent.max_tokens as number | undefined,
  };

  const provider = getProviderFromModel(model);
  const estimatedCost = await estimateRequestCost(model, messages);

  if (Number(ctx.user.organization.credit_balance) < estimatedCost) {
    throw new Error(
      `Insufficient credits: need $${estimatedCost.toFixed(4)}, have $${Number(ctx.user.organization.credit_balance).toFixed(4)}`
    );
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
    messages: messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
    ...options,
  });

  let fullText = "";
  for await (const delta of result.textStream) fullText += delta;
  const usage = await result.usage;

  const { inputCost, outputCost, totalCost } = await calculateCost(
    model,
    provider,
    usage?.inputTokens || 0,
    usage?.outputTokens || 0
  );
  const costDiff = totalCost - estimatedCost;

  if (costDiff > 0) {
    await creditsService.deductCredits({
      organizationId: ctx.user.organization_id,
      amount: costDiff,
      description: `A2A chat additional: ${model}`,
      metadata: { user_id: ctx.user.id },
    });
  } else if (costDiff < 0) {
    await creditsService.refundCredits({
      organizationId: ctx.user.organization_id,
      amount: -costDiff,
      description: `A2A chat refund: ${model}`,
      metadata: { user_id: ctx.user.id },
    });
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

/**
 * Image generation skill
 */
export async function executeSkillImageGeneration(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<ImageGenerationResult> {
  const prompt = (dataContent.prompt as string) || textContent;
  const aspectRatio = (dataContent.aspectRatio as string) || "1:1";

  if (!prompt) throw new Error("Image prompt required");

  if (Number(ctx.user.organization.credit_balance) < IMAGE_GENERATION_COST) {
    throw new Error(
      `Insufficient credits: need $${IMAGE_GENERATION_COST.toFixed(4)}`
    );
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

  const aspectDesc: Record<string, string> = {
    "1:1": "square",
    "16:9": "wide landscape",
    "9:16": "tall portrait",
    "4:3": "landscape",
    "3:4": "portrait",
  };

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
    await creditsService.refundCredits({
      organizationId: ctx.user.organization_id,
      amount: IMAGE_GENERATION_COST,
      description: "A2A image refund (failed)",
      metadata: { generation_id: generation.id },
    });
    throw new Error("No image generated");
  }

  await generationsService.update(generation.id, {
    status: "completed",
    content: imageBase64,
    mime_type: mimeType,
    completed_at: new Date(),
  });

  return {
    image: imageBase64,
    mimeType,
    aspectRatio,
    cost: IMAGE_GENERATION_COST,
  };
}

/**
 * Check balance skill
 */
export async function executeSkillCheckBalance(
  ctx: A2AContext
): Promise<BalanceResult> {
  const org = await organizationsService.getById(ctx.user.organization_id);
  if (!org) throw new Error("Organization not found");
  return {
    balance: Number(org.credit_balance),
    organizationId: org.id,
    organizationName: org.name,
  };
}

/**
 * Get usage skill
 */
export async function executeSkillGetUsage(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<UsageResult> {
  const limit = Math.min(50, (dataContent.limit as number) || 10);
  const records = await usageService.listByOrganization(
    ctx.user.organization_id,
    limit
  );
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

/**
 * List agents skill
 */
export async function executeSkillListAgents(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<ListAgentsResult> {
  const limit = (dataContent.limit as number) || 20;
  const chars = await charactersService.listByOrganization(
    ctx.user.organization_id
  );
  return {
    agents: chars.slice(0, limit).map((c) => ({
      id: c.id,
      name: c.name,
      bio: c.bio,
      avatarUrl: c.avatar_url,
      createdAt: c.created_at,
    })),
    total: chars.length,
  };
}

/**
 * Chat with agent skill
 */
export async function executeSkillChatWithAgent(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<ChatWithAgentResult> {
  const message = (dataContent.message as string) || textContent;
  const roomId = dataContent.roomId as string | undefined;
  const agentId = dataContent.agentId as string | undefined;
  const entityId = dataContent.entityId as string | undefined;

  if (!message) throw new Error("Message required");
  if (!agentId && !roomId) throw new Error("agentId or roomId required");

  // If we have a roomId, use it directly; otherwise create/get a room for the agent
  const actualRoomId =
    roomId ||
    (await agentService.getOrCreateRoom(entityId || ctx.user.id, agentId!));

  const response = await agentService.sendMessage({
    roomId: actualRoomId,
    entityId: entityId || ctx.user.id,
    message,
    organizationId: ctx.user.organization_id,
    streaming: false,
  });

  return {
    response: response.content,
    roomId: actualRoomId,
    messageId: response.messageId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Save memory skill
 */
export async function executeSkillSaveMemory(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<SaveMemoryResult> {
  const content = (dataContent.content as string) || textContent;
  const type =
    (dataContent.type as "fact" | "preference" | "context" | "document") ||
    "fact";
  const roomId = dataContent.roomId as string;
  const tags = dataContent.tags as string[] | undefined;
  const metadata = dataContent.metadata as Record<string, unknown> | undefined;

  if (!content || !roomId) throw new Error("content and roomId required");

  const COST = 1;
  const deduction = await creditsService.deductCredits({
    organizationId: ctx.user.organization_id,
    amount: COST,
    description: `A2A memory: ${type}`,
    metadata: { user_id: ctx.user.id },
  });
  if (!deduction.success) throw new Error("Insufficient credits");

  const result = await memoryService.saveMemory({
    organizationId: ctx.user.organization_id,
    roomId,
    entityId: ctx.user.id,
    content,
    type,
    tags,
    metadata,
    persistent: true,
  });

  return { memoryId: result.memoryId, storage: result.storage, cost: COST };
}

/**
 * Retrieve memories skill
 */
export async function executeSkillRetrieveMemories(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<RetrieveMemoriesResult> {
  const query = (dataContent.query as string) || textContent;
  const roomId = dataContent.roomId as string | undefined;
  const type = dataContent.type as string[] | undefined;
  const tags = dataContent.tags as string[] | undefined;
  const limit = Math.min(50, (dataContent.limit as number) || 10);
  const sortBy =
    (dataContent.sortBy as "relevance" | "recent" | "importance") ||
    "relevance";

  const memories = await memoryService.retrieveMemories({
    organizationId: ctx.user.organization_id,
    query,
    roomId,
    type,
    tags,
    limit,
    sortBy,
  });

  return {
    memories: memories.map((m) => ({
      id: m.memory.id || "",
      content:
        typeof m.memory.content === "string"
          ? m.memory.content
          : JSON.stringify(m.memory.content),
      score: m.score,
      createdAt: m.memory.createdAt || new Date().toISOString(),
    })),
    count: memories.length,
  };
}

/**
 * List containers skill
 */
export async function executeSkillListContainers(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<ListContainersResult> {
  const status = dataContent.status as string | undefined;
  let containers = await containersService.listByOrganization(
    ctx.user.organization_id
  );
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

/**
 * Delete memory skill
 */
export async function executeSkillDeleteMemory(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ success: boolean; memoryId: string }> {
  const memoryId = dataContent.memoryId as string;
  if (!memoryId) throw new Error("memoryId required");

  await memoryService.deleteMemory({
    organizationId: ctx.user.organization_id,
    memoryId,
  });
  return { success: true, memoryId };
}

/**
 * Video generation skill (async - returns job ID)
 */
export async function executeSkillVideoGeneration(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<VideoGenerationResult> {
  const prompt = (dataContent.prompt as string) || textContent;
  const model = (dataContent.model as string) || "fal-ai/veo3";

  if (!prompt) throw new Error("Video prompt required");

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

  return {
    jobId: generation.id,
    status: "pending",
    cost: VIDEO_COST,
  };
}

/**
 * Get user profile skill
 */
export async function executeSkillGetUserProfile(
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
