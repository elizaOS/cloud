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
import { conversationsService } from "@/lib/services/conversations";
import { memoryService } from "@/lib/services/memory";
import { charactersService } from "@/lib/services/characters/characters";
import { containersService } from "@/lib/services/containers";
import { agentService } from "@/lib/services/agents/agents";
import { storageService, calculateUploadCost, formatPrice } from "@/lib/services/storage";
import { ipfsService } from "@/lib/services/ipfs";
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
  CreateConversationResult,
  ListContainersResult,
  VideoGenerationResult,
  FragmentGenerationResult,
  FragmentExecutionResult,
  FragmentProjectResult,
  FragmentProjectListResult,
  FragmentDeploymentResult,
} from "./types";

export type {
  N8nWorkflowResult,
  N8nWorkflowListResult,
};

/**
 * Chat completion skill - Generate text with LLMs
 */
export async function executeSkillChatCompletion(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<ChatCompletionResult> {
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

  return { image: imageBase64, mimeType, aspectRatio, cost: IMAGE_GENERATION_COST };
}

/**
 * Get x402 topup requirements skill
 * Permissionless - no authentication required
 */
export async function executeSkillGetX402TopupRequirements(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  x402: {
    enabled: boolean;
    topupEndpoint: string;
    network: string;
    asset: string;
    payTo: string;
    price: string;
    creditsPerDollar: number;
    creditsPerTopup: number;
    instructions: string[];
    docs: string;
  };
}> {
  const {
    X402_ENABLED,
    X402_RECIPIENT_ADDRESS,
    getDefaultNetwork,
    USDC_ADDRESSES,
    TOPUP_PRICE,
    CREDITS_PER_DOLLAR,
    isX402Configured,
  } = await import("@/lib/config/x402");

  if (!isX402Configured()) {
    throw new Error("x402 payments not configured");
  }

  const network = getDefaultNetwork();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return {
    x402: {
      enabled: X402_ENABLED,
      topupEndpoint: `${baseUrl}/api/v1/credits/topup`,
      network,
      asset: USDC_ADDRESSES[network],
      payTo: X402_RECIPIENT_ADDRESS,
      price: TOPUP_PRICE,
      creditsPerDollar: CREDITS_PER_DOLLAR,
      creditsPerTopup: Math.floor(parseFloat(TOPUP_PRICE.replace("$", "")) * CREDITS_PER_DOLLAR),
      instructions: [
        "1. Sign payment authorization with your wallet",
        "2. Include X-PAYMENT header in POST request to topupEndpoint",
        "3. Credits will be added to your organization (created from wallet address if needed)",
        "4. Use the credits to call A2A skills or MCP tools",
      ],
      docs: "https://x402.org",
    },
  };
}

/**
 * Check balance skill
 */
export async function executeSkillCheckBalance(ctx: A2AContext): Promise<BalanceResult> {
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

/**
 * List agents skill
 */
export async function executeSkillListAgents(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<ListAgentsResult> {
  const limit = (dataContent.limit as number) || 20;
  const chars = await charactersService.listByOrganization(ctx.user.organization_id);
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
  const actualRoomId = roomId || (await agentService.getOrCreateRoom(entityId || ctx.user.id, agentId!));

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
  const type = (dataContent.type as "fact" | "preference" | "context" | "document") || "fact";
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
  const sortBy = (dataContent.sortBy as "relevance" | "recent" | "importance") || "relevance";

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
 * Create conversation skill
 */
export async function executeSkillCreateConversation(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<CreateConversationResult> {
  const title = dataContent.title as string;
  const model = (dataContent.model as string) || "gpt-4o";
  const systemPrompt = dataContent.systemPrompt as string | undefined;

  if (!title) throw new Error("title required");

  const COST = 1;
  const deduction = await creditsService.deductCredits({
    organizationId: ctx.user.organization_id,
    amount: COST,
    description: `A2A conversation: ${title}`,
    metadata: { user_id: ctx.user.id },
  });
  if (!deduction.success) throw new Error("Insufficient credits");

  const conv = await conversationsService.create({
    organization_id: ctx.user.organization_id,
    user_id: ctx.user.id,
    title,
    model,
    settings: { systemPrompt },
  });

  return { conversationId: conv.id, title: conv.title, model: conv.model, cost: COST };
}

/**
 * List containers skill
 */
export async function executeSkillListContainers(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<ListContainersResult> {
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
 * Get conversation context skill
 */
export async function executeSkillGetConversationContext(
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

// ============ STORAGE SKILLS ============

/**
 * Storage upload result
 */
export interface StorageUploadResult {
  id: string;
  url: string;
  cid?: string;
  ipfsGatewayUrl?: string;
  size: number;
  contentType: string;
  cost: number;
  provider: string;
}

/**
 * Storage list result
 */
export interface StorageListResult {
  items: Array<{
    id: string;
    url: string;
    pathname: string;
    contentType: string;
    size: number;
    uploadedAt: string;
  }>;
  count: number;
  hasMore: boolean;
}

/**
 * Storage stats result
 */
export interface StorageStatsResult {
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeGB: number;
  pricing: {
    uploadPerMB: string;
    retrievalPerMB: string;
    pinPerGBMonth: string;
    minUploadFee: string;
  };
}

/**
 * Upload to storage skill
 */
export async function executeSkillStorageUpload(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<StorageUploadResult> {
  const content = dataContent.content as string;
  const filename = (dataContent.filename as string) || "file.bin";
  const contentType = (dataContent.contentType as string) || "application/octet-stream";
  const pinToIPFS = (dataContent.pinToIPFS as boolean) ?? true;
  
  if (!content) {
    throw new Error("Content required (base64 encoded)");
  }
  
  // Decode base64 content
  const buffer = Buffer.from(content, "base64");
  const cost = calculateUploadCost(buffer.length);
  
  // Check balance
  if (Number(ctx.user.organization.credit_balance) < cost) {
    throw new Error(`Insufficient credits: need ${formatPrice(cost)}, have ${formatPrice(Number(ctx.user.organization.credit_balance))}`);
  }
  
  // Deduct credits
  const deduction = await creditsService.deductCredits({
    organizationId: ctx.user.organization_id,
    amount: cost,
    description: `A2A storage upload: ${filename}`,
    metadata: { user_id: ctx.user.id, filename, size: buffer.length },
  });
  
  if (!deduction.success) {
    throw new Error("Credit deduction failed");
  }
  
  // Upload
  const result = await storageService.upload(buffer, {
    filename,
    contentType,
    ownerAddress: ctx.user.id,
    pinToIPFS,
  });
  
  return {
    id: result.id,
    url: result.url,
    cid: result.cid,
    ipfsGatewayUrl: result.ipfsGatewayUrl,
    size: result.size,
    contentType: result.contentType,
    cost,
    provider: pinToIPFS && result.cid ? "ipfs+blob" : "blob",
  };
}

/**
 * List storage files skill
 */
export async function executeSkillStorageList(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<StorageListResult> {
  const limit = Math.min(100, (dataContent.limit as number) || 50);
  const cursor = dataContent.cursor as string | undefined;
  
  const result = await storageService.list({
    ownerAddress: ctx.user.id,
    limit,
    cursor,
  });
  
  return {
    items: result.items.map(item => ({
      id: item.id,
      url: item.url,
      pathname: item.pathname,
      contentType: item.contentType,
      size: item.size,
      uploadedAt: item.uploadedAt.toISOString(),
    })),
    count: result.items.length,
    hasMore: result.hasMore,
  };
}

/**
 * Get storage stats skill
 */
export async function executeSkillStorageStats(
  ctx: A2AContext
): Promise<StorageStatsResult> {
  const stats = await storageService.getStats(ctx.user.id);
  const pricing = storageService.getPricing();
  
  return {
    ...stats,
    pricing,
  };
}

/**
 * Calculate storage cost skill
 */
export async function executeSkillStorageCalculateCost(
  dataContent: Record<string, unknown>
): Promise<{ sizeBytes: number; cost: number; costFormatted: string }> {
  const sizeBytes = dataContent.sizeBytes as number;
  
  if (!sizeBytes || sizeBytes <= 0) {
    throw new Error("sizeBytes required and must be positive");
  }
  
  const cost = calculateUploadCost(sizeBytes);
  
  return {
    sizeBytes,
    cost,
    costFormatted: formatPrice(cost),
  };
}

/**
 * Pin to IPFS skill
 */
export async function executeSkillStoragePin(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ id: string; cid: string; status: string; gatewayUrl: string }> {
  const cid = dataContent.cid as string;
  const name = (dataContent.name as string) || cid;
  
  if (!cid) {
    throw new Error("CID required");
  }
  
  // Check IPFS health
  const health = await ipfsService.health().catch(() => null);
  if (!health) {
    throw new Error("IPFS service unavailable");
  }
  
  const result = await ipfsService.pin({
    cid,
    name,
  });
  
  return {
    id: result.id,
    cid: result.cid,
    status: result.status,
    gatewayUrl: ipfsService.getGatewayUrl(result.cid),
  };
}

// ============ N8N WORKFLOW SKILLS ============

/**
 * N8N workflow result types
 */
export interface N8nWorkflowResult {
  id: string;
  name: string;
  status: string;
  version: number;
}

export interface N8nWorkflowListResult {
  workflows: Array<{
    id: string;
    name: string;
    status: string;
    version: number;
    createdAt: string;
  }>;
  total: number;
}

/**
 * Create n8n workflow skill
 */
export async function executeSkillN8nCreateWorkflow(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<N8nWorkflowResult> {
  const { n8nWorkflowsService } = await import("@/lib/services/n8n-workflows");
  const { appsService } = await import("@/lib/services/apps");

  const name = (dataContent.name as string) || textContent;
  const description = dataContent.description as string | undefined;
  const workflowData = dataContent.workflowData as Record<string, unknown> | undefined;
  const tags = dataContent.tags as string[] | undefined;

  if (!name) {
    throw new Error("Workflow name required");
  }

  if (!workflowData) {
    throw new Error("Workflow data required");
  }

  const apps = await appsService.listByOrganization(ctx.user.organization_id);
  if (apps.length === 0) {
    throw new Error("No app found for this organization");
  }

  const workflow = await n8nWorkflowsService.createWorkflow({
    organizationId: ctx.user.organization_id,
    userId: ctx.user.id,
    name,
    description,
    workflowData,
    tags,
  });

  return {
    id: workflow.id,
    name: workflow.name,
    status: workflow.status,
    version: workflow.version,
  };
}

/**
 * List n8n workflows skill
 */
export async function executeSkillN8nListWorkflows(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<N8nWorkflowListResult> {
  const { n8nWorkflowsService } = await import("@/lib/services/n8n-workflows");

  const status = dataContent.status as "draft" | "active" | "archived" | undefined;
  const limit = Math.min(50, (dataContent.limit as number) || 20);

  const workflows = await n8nWorkflowsService.listWorkflows(ctx.user.organization_id, {
    status,
    limit,
  });

  return {
    workflows: workflows.map((w) => ({
      id: w.id,
      name: w.name,
      status: w.status,
      version: w.version,
      createdAt: w.created_at.toISOString(),
    })),
    total: workflows.length,
  };
}

/**
 * Generate n8n workflow skill (uses Cloud API)
 */
export async function executeSkillN8nGenerateWorkflow(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ workflow: Record<string, unknown>; cost: number; savedWorkflow?: { id: string; name: string }; validation?: { valid: boolean; errors: string[]; warnings: string[] } }> {
  const prompt = (dataContent.prompt as string) || textContent;
  const context = dataContent.context as Record<string, unknown> | undefined;
  const autoSave = (dataContent.autoSave as boolean) || false;
  const workflowName = dataContent.workflowName as string | undefined;
  const tags = dataContent.tags as string[] | undefined;

  if (!prompt) {
    throw new Error("Prompt required");
  }

  // Import services for context
  const { n8nWorkflowsService } = await import("@/lib/services/n8n-workflows");
  const { endpointDiscoveryService } = await import("@/lib/services/endpoint-discovery");

  // Discover endpoints and get context
  const availableEndpoints = await endpointDiscoveryService.discoverAllEndpoints();
  const endpointNodes = availableEndpoints.map(e => ({
    id: e.id,
    name: e.name,
    description: e.description,
    type: e.type,
    category: e.category,
    endpoint: e.endpoint,
    method: e.method,
  }));

  const existingWorkflows = await n8nWorkflowsService.listWorkflows(ctx.user.organization_id, { limit: 10 });
  const workflowContext = existingWorkflows.map(w => ({
    id: w.id,
    name: w.name,
    description: w.description,
    tags: w.tags,
  }));

  const globalVariables = await n8nWorkflowsService.getGlobalVariables(ctx.user.organization_id);
  const variablesContext = Object.fromEntries(
    globalVariables.map(v => [v.name, v.is_secret ? "***" : v.value])
  );

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const response = await fetch(`${baseUrl}/api/v1/n8n/generate-workflow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      context: {
        ...context,
        availableNodes: endpointNodes,
        existingWorkflows: workflowContext,
        variables: variablesContext,
      },
      autoSave,
      workflowName,
      tags,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to generate workflow: ${error.error || response.statusText}`);
  }

  const result = await response.json();

  return {
    workflow: result.workflow,
    cost: result.metadata?.cost || 0,
    savedWorkflow: result.savedWorkflow,
    validation: result.validation,
  };
}

/**
 * Generate fragment skill
 */
export async function executeSkillFragmentGenerate(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<FragmentGenerationResult> {
  const prompt = (dataContent.prompt as string) || textContent;
  const template = (dataContent.template as string) || "auto";
  const model = (dataContent.model as string) || "gpt-4o";

  if (!prompt) {
    throw new Error("Prompt required");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const response = await fetch(`${baseUrl}/api/fragments/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      template,
      model,
      config: {
        model,
        temperature: (dataContent.temperature as number) || 0.7,
        maxTokens: (dataContent.maxTokens as number) || 4000,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to generate fragment: ${error.error || response.statusText}`);
  }

  // Parse streaming response
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fragment: unknown = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        if (!data.trim()) continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.object) {
            fragment = parsed.object;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  if (!fragment) {
    throw new Error("Failed to parse fragment from response");
  }

  return {
    fragment: fragment as FragmentGenerationResult["fragment"],
    cost: 0, // Cost is handled by the API
  };
}

/**
 * Execute fragment skill
 */
export async function executeSkillFragmentExecute(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<FragmentExecutionResult> {
  const fragment = dataContent.fragment as Record<string, unknown>;

  if (!fragment) {
    throw new Error("Fragment required");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const response = await fetch(`${baseUrl}/api/fragments/sandbox`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      fragment,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to execute fragment: ${error.error || response.statusText}`);
  }

  const result = await response.json();
  return {
    containerId: result.containerId || "",
    template: result.template || "",
    url: result.url,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/**
 * List fragment projects skill
 */
export async function executeSkillFragmentListProjects(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<FragmentProjectListResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const status = dataContent.status as string | undefined;
  const userId = dataContent.userId as string | undefined;

  const searchParams = new URLSearchParams();
  if (status) searchParams.set("status", status);
  if (userId) searchParams.set("userId", userId);

  const response = await fetch(`${baseUrl}/api/v1/fragments/projects?${searchParams.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to list projects: ${error.error || response.statusText}`);
  }

  const data = await response.json();

  return {
    projects: data.projects || [],
    count: data.projects?.length || 0,
  };
}

/**
 * Create fragment project skill
 */
export async function executeSkillFragmentCreateProject(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<FragmentProjectResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const name = dataContent.name as string;
  const description = dataContent.description as string | undefined;
  const fragment = dataContent.fragment as Record<string, unknown>;

  if (!name || !fragment) {
    throw new Error("Name and fragment are required");
  }

  const response = await fetch(`${baseUrl}/api/v1/fragments/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      name,
      description,
      fragment,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to create project: ${error.error || response.statusText}`);
  }

  const data = await response.json();

  return {
    project: data.project,
  };
}

/**
 * Get fragment project skill
 */
export async function executeSkillFragmentGetProject(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<FragmentProjectResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const projectId = (dataContent.projectId as string) || textContent;

  if (!projectId) {
    throw new Error("Project ID is required");
  }

  const response = await fetch(`${baseUrl}/api/v1/fragments/projects/${projectId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to get project: ${error.error || response.statusText}`);
  }

  const data = await response.json();

  return {
    project: data.project,
  };
}

/**
 * Update fragment project skill
 */
export async function executeSkillFragmentUpdateProject(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<FragmentProjectResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const projectId = dataContent.projectId as string;
  const name = dataContent.name as string | undefined;
  const description = dataContent.description as string | undefined;
  const fragment = dataContent.fragment as Record<string, unknown> | undefined;
  const status = dataContent.status as "draft" | "deployed" | "archived" | undefined;

  if (!projectId) {
    throw new Error("Project ID is required");
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (fragment !== undefined) updateData.fragment = fragment;
  if (status !== undefined) updateData.status = status;

  const response = await fetch(`${baseUrl}/api/v1/fragments/projects/${projectId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(updateData),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to update project: ${error.error || response.statusText}`);
  }

  const data = await response.json();

  return {
    project: data.project,
  };
}

/**
 * Delete fragment project skill
 */
export async function executeSkillFragmentDeleteProject(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ success: boolean; message: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const projectId = (dataContent.projectId as string) || textContent;

  if (!projectId) {
    throw new Error("Project ID is required");
  }

  const response = await fetch(`${baseUrl}/api/v1/fragments/projects/${projectId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to delete project: ${error.error || response.statusText}`);
  }

  return {
    success: true,
    message: "Project deleted successfully",
  };
}

/**
 * Deploy fragment project skill
 */
export async function executeSkillFragmentDeployProject(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<FragmentDeploymentResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const projectId = dataContent.projectId as string;
  const type = dataContent.type as "miniapp" | "container";
  const appUrl = dataContent.appUrl as string | undefined;
  const allowedOrigins = dataContent.allowedOrigins as string[] | undefined;
  const autoStorage = (dataContent.autoStorage as boolean) ?? true;
  const autoInject = (dataContent.autoInject as boolean) ?? true;
  const name = dataContent.name as string | undefined;
  const project_name = dataContent.project_name as string | undefined;
  const port = dataContent.port as number | undefined;

  if (!projectId || !type) {
    throw new Error("Project ID and deployment type are required");
  }

  const deployData: Record<string, unknown> = { type };
  if (type === "miniapp") {
    if (appUrl) deployData.appUrl = appUrl;
    if (allowedOrigins) deployData.allowedOrigins = allowedOrigins;
    deployData.autoStorage = autoStorage;
    deployData.autoInject = autoInject;
  } else {
    if (name) deployData.name = name;
    if (project_name) deployData.project_name = project_name;
    if (port) deployData.port = port;
  }

  const response = await fetch(`${baseUrl}/api/v1/fragments/projects/${projectId}/deploy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(deployData),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to deploy project: ${error.error || response.statusText}`);
  }

  const data = await response.json();

  return {
    deployment: data.deployment,
  };
}

