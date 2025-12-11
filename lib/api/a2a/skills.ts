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
  FullAppBuilderSessionResult,
  FullAppBuilderPromptResult,
  FullAppBuilderStatusResult,
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
  const type = dataContent.type as "app" | "container";
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
  if (type === "app") {
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

// ============ ERC-8004 MARKETPLACE DISCOVERY SKILLS ============

/**
 * Marketplace discovery result type
 */
export interface MarketplaceDiscoveryResult {
  items: Array<{
    id: string;
    type: string;
    name: string;
    description: string;
    image?: string;
    erc8004: {
      registered: boolean;
      agentId?: string;
      network?: string;
    };
    endpoints: {
      a2a?: string;
      mcp?: string;
    };
    tags: string[];
    category?: string;
    capabilities: {
      streaming: boolean;
      x402: boolean;
    };
    status: {
      active: boolean;
      online: boolean;
    };
  }>;
  total: number;
  hasMore: boolean;
}

/**
 * Marketplace tags result type
 */
export interface MarketplaceTagsResult {
  tags: {
    skills: string[];
    domains: string[];
    mcpCategories: string[];
    capabilities: string[];
  };
  all: string[];
}

/**
 * Discover marketplace items skill
 * Search for agents, MCPs, and services in the ERC-8004 marketplace
 */
export async function executeSkillMarketplaceDiscover(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<MarketplaceDiscoveryResult> {
  const { erc8004MarketplaceService } = await import("@/lib/services/erc8004-marketplace");

  const query = (dataContent.query as string) || textContent || undefined;
  const types = dataContent.types as string[] | undefined;
  const tags = dataContent.tags as string[] | undefined;
  const anyTags = dataContent.anyTags as string[] | undefined;
  const category = dataContent.category as string | undefined;
  const x402Only = dataContent.x402Only as boolean | undefined;
  const activeOnly = (dataContent.activeOnly as boolean) ?? true;
  const registeredOnly = (dataContent.registeredOnly as boolean) ?? true;
  const mcpTools = dataContent.mcpTools as string[] | undefined;
  const a2aSkills = dataContent.a2aSkills as string[] | undefined;
  const sortBy = (dataContent.sortBy as string) || "relevance";
  const limit = Math.min(50, (dataContent.limit as number) || 20);
  const page = (dataContent.page as number) || 1;

  const result = await erc8004MarketplaceService.discover(
    {
      query,
      types: types as ("agent" | "mcp" | "app")[] | undefined,
      tags,
      anyTags,
      category,
      x402Only,
      activeOnly,
      registeredOnly,
      mcpTools,
      a2aSkills,
    },
    {
      sortBy: sortBy as "relevance" | "popularity" | "recent" | "name",
      order: "desc",
    },
    { page, limit }
  );

  return {
    items: result.items.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      description: item.description,
      image: item.image,
      erc8004: {
        registered: item.erc8004.registered,
        agentId: item.erc8004.agentId,
        network: item.erc8004.network,
      },
      endpoints: item.endpoints,
      tags: item.tags,
      category: item.category,
      capabilities: {
        streaming: item.capabilities.streaming,
        x402: item.capabilities.x402,
      },
      status: {
        active: item.status.active,
        online: item.status.online,
      },
    })),
    total: result.pagination.total,
    hasMore: result.pagination.hasMore,
  };
}

/**
 * Get marketplace tags skill
 * Returns available tags for filtering and search context
 */
export async function executeSkillMarketplaceGetTags(): Promise<MarketplaceTagsResult> {
  const {
    AGENT_SKILL_TAGS,
    AGENT_DOMAIN_TAGS,
    MCP_CATEGORY_TAGS,
    CAPABILITY_TAGS,
  } = await import("@/lib/types/erc8004-marketplace");

  return {
    tags: {
      skills: [...AGENT_SKILL_TAGS],
      domains: [...AGENT_DOMAIN_TAGS],
      mcpCategories: [...MCP_CATEGORY_TAGS],
      capabilities: [...CAPABILITY_TAGS],
    },
    all: [
      ...AGENT_SKILL_TAGS,
      ...AGENT_DOMAIN_TAGS,
      ...MCP_CATEGORY_TAGS,
      ...CAPABILITY_TAGS,
    ],
  };
}

/**
 * Find agents by tags skill
 * Quick helper to find agents matching specific tags
 */
export async function executeSkillMarketplaceFindByTags(
  textContent: string,
  dataContent: Record<string, unknown>
): Promise<MarketplaceDiscoveryResult> {
  const { erc8004MarketplaceService } = await import("@/lib/services/erc8004-marketplace");

  const tags = (dataContent.tags as string[]) || textContent.split(",").map((t) => t.trim());
  const limit = Math.min(20, (dataContent.limit as number) || 10);
  const activeOnly = (dataContent.activeOnly as boolean) ?? true;

  const items = await erc8004MarketplaceService.getByTags(tags, { limit, activeOnly });

  return {
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      description: item.description,
      image: item.image,
      erc8004: {
        registered: item.erc8004.registered,
        agentId: item.erc8004.agentId,
        network: item.erc8004.network,
      },
      endpoints: item.endpoints,
      tags: item.tags,
      category: item.category,
      capabilities: {
        streaming: item.capabilities.streaming,
        x402: item.capabilities.x402,
      },
      status: {
        active: item.status.active,
        online: item.status.online,
      },
    })),
    total: items.length,
    hasMore: false,
  };
}

/**
 * Find MCPs by tools skill
 * Quick helper to find MCPs with specific tools
 */
export async function executeSkillMarketplaceFindByMCPTools(
  textContent: string,
  dataContent: Record<string, unknown>
): Promise<MarketplaceDiscoveryResult> {
  const { erc8004MarketplaceService } = await import("@/lib/services/erc8004-marketplace");

  const tools = (dataContent.tools as string[]) || textContent.split(",").map((t) => t.trim());
  const limit = Math.min(20, (dataContent.limit as number) || 10);

  const items = await erc8004MarketplaceService.getByMCPTools(tools, { limit });

  return {
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      description: item.description,
      image: item.image,
      erc8004: {
        registered: item.erc8004.registered,
        agentId: item.erc8004.agentId,
        network: item.erc8004.network,
      },
      endpoints: item.endpoints,
      tags: item.tags,
      category: item.category,
      capabilities: {
        streaming: item.capabilities.streaming,
        x402: item.capabilities.x402,
      },
      status: {
        active: item.status.active,
        online: item.status.online,
      },
    })),
    total: items.length,
    hasMore: false,
  };
}

/**
 * Find x402-enabled services skill
 * Quick helper to find services that accept x402 payments
 */
export async function executeSkillMarketplaceFindPayable(
  textContent: string,
  dataContent: Record<string, unknown>
): Promise<MarketplaceDiscoveryResult> {
  const { erc8004MarketplaceService } = await import("@/lib/services/erc8004-marketplace");

  const type = dataContent.type as "agent" | "mcp" | "app" | undefined;
  const limit = Math.min(20, (dataContent.limit as number) || 10);

  const items = await erc8004MarketplaceService.getPayableServices({ type, limit });

  return {
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      description: item.description,
      image: item.image,
      erc8004: {
        registered: item.erc8004.registered,
        agentId: item.erc8004.agentId,
        network: item.erc8004.network,
      },
      endpoints: item.endpoints,
      tags: item.tags,
      category: item.category,
      capabilities: {
        streaming: item.capabilities.streaming,
        x402: item.capabilities.x402,
      },
      status: {
        active: item.status.active,
        online: item.status.online,
      },
    })),
    total: items.length,
    hasMore: false,
  };
}

// ============ FULL APP BUILDER SKILLS ============

/**
 * Start a full app builder session skill
 * Creates a Vercel sandbox with a Next.js template for building complete multi-file apps
 */
export async function executeSkillFullAppBuilderStart(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<FullAppBuilderSessionResult> {
  const { aiAppBuilderService } = await import("@/lib/services/ai-app-builder");

  const appName = (dataContent.appName as string) || textContent;
  const appDescription = dataContent.appDescription as string | undefined;
  const templateType = (dataContent.templateType as "chat" | "agent-dashboard" | "landing-page" | "analytics" | "blank") || "blank";
  const includeMonetization = (dataContent.includeMonetization as boolean) || false;
  const includeAnalytics = (dataContent.includeAnalytics as boolean) ?? true;

  const session = await aiAppBuilderService.startSession({
    userId: ctx.user.id,
    organizationId: ctx.user.organization_id,
    appName,
    appDescription,
    templateType,
    includeMonetization,
    includeAnalytics,
  });

  return {
    sessionId: session.id,
    sandboxId: session.sandboxId,
    sandboxUrl: session.sandboxUrl,
    status: session.status,
    examplePrompts: session.examplePrompts,
  };
}

/**
 * Send prompt to full app builder skill
 * Sends a prompt to Claude to generate/modify files in the sandbox
 */
export async function executeSkillFullAppBuilderPrompt(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<FullAppBuilderPromptResult> {
  const { aiAppBuilderService } = await import("@/lib/services/ai-app-builder");

  const sessionId = dataContent.sessionId as string;
  const prompt = (dataContent.prompt as string) || textContent;

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  if (!prompt) {
    throw new Error("prompt is required");
  }

  const result = await aiAppBuilderService.sendPrompt(sessionId, prompt, ctx.user.id);

  return {
    success: result.success,
    output: result.output,
    filesAffected: result.filesAffected,
    error: result.error,
  };
}

/**
 * Get full app builder session status skill
 * Returns the current state of the session including messages and generated files
 */
export async function executeSkillFullAppBuilderStatus(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<FullAppBuilderStatusResult> {
  const { aiAppBuilderService } = await import("@/lib/services/ai-app-builder");
  const { db } = await import("@/db/client");
  const { appSandboxSessions } = await import("@/db/schemas/app-sandboxes");
  const { eq } = await import("drizzle-orm");

  const sessionId = (dataContent.sessionId as string) || textContent;

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const session = await aiAppBuilderService.getSession(sessionId, ctx.user.id);

  if (!session) {
    throw new Error("Session not found");
  }

  // Get the full session record for generated files
  const dbSession = await db.query.appSandboxSessions.findFirst({
    where: eq(appSandboxSessions.id, sessionId),
  });

  const generatedFiles = (dbSession?.generated_files as Array<{ path: string }>) || [];

  return {
    sessionId: session.id,
    sandboxId: session.sandboxId,
    sandboxUrl: session.sandboxUrl,
    status: session.status,
    messages: session.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: m.timestamp,
    })),
    generatedFiles: generatedFiles.map((f) => f.path),
  };
}

/**
 * Stop full app builder session skill
 * Stops the sandbox and releases resources
 */
export async function executeSkillFullAppBuilderStop(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ success: boolean; message: string }> {
  const { aiAppBuilderService } = await import("@/lib/services/ai-app-builder");

  const sessionId = (dataContent.sessionId as string) || textContent;

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  await aiAppBuilderService.stopSession(sessionId, ctx.user.id);

  return {
    success: true,
    message: "Session stopped successfully",
  };
}

/**
 * Extend full app builder session skill
 * Extends the session timeout to continue working
 */
export async function executeSkillFullAppBuilderExtend(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{ success: boolean; message: string; expiresIn: number }> {
  const { aiAppBuilderService } = await import("@/lib/services/ai-app-builder");

  const sessionId = (dataContent.sessionId as string) || textContent;
  const durationMinutes = (dataContent.durationMinutes as number) || 15;

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const durationMs = durationMinutes * 60 * 1000;
  await aiAppBuilderService.extendSession(sessionId, ctx.user.id, durationMs);

  return {
    success: true,
    message: `Session extended by ${durationMinutes} minutes`,
    expiresIn: durationMs,
  };
}

/**
 * List full app builder sessions skill
 * Returns user's active and recent sessions
 */
export async function executeSkillFullAppBuilderListSessions(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  sessions: Array<{
    id: string;
    sandboxId: string;
    sandboxUrl: string;
    status: string;
    appName: string | null;
    templateType: string | null;
    createdAt: string;
  }>;
  total: number;
}> {
  const { aiAppBuilderService } = await import("@/lib/services/ai-app-builder");

  const limit = Math.min(20, (dataContent.limit as number) || 10);
  const includeInactive = (dataContent.includeInactive as boolean) || false;

  const sessions = await aiAppBuilderService.listSessions(ctx.user.id, {
    limit,
    includeInactive,
  });

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      sandboxId: s.sandbox_id || "",
      sandboxUrl: s.sandbox_url || "",
      status: s.status,
      appName: s.app_name,
      templateType: s.template_type,
      createdAt: s.created_at.toISOString(),
    })),
    total: sessions.length,
  };
}

// =============================================================================
// N8N WORKFLOW TRIGGER SKILLS
// =============================================================================

/**
 * Execute N8N workflow via A2A/MCP trigger
 * 
 * This skill allows triggering N8N workflows that have been configured
 * with A2A or MCP trigger types.
 */
export async function executeSkillN8nTriggerWorkflow(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  executionId: string;
  status: string;
  workflowId: string;
  triggerId: string;
}> {
  const { n8nWorkflowsService } = await import("@/lib/services/n8n-workflows");

  // Find trigger by key or workflow ID
  const triggerKey = dataContent.triggerKey as string | undefined;
  const workflowId = dataContent.workflowId as string | undefined;
  const inputData = dataContent.inputData as Record<string, unknown> | undefined;

  if (!triggerKey && !workflowId) {
    throw new Error("Either triggerKey or workflowId is required");
  }

  let trigger;
  
  if (triggerKey) {
    trigger = await n8nWorkflowsService.findTriggerByKey(triggerKey);
  } else if (workflowId) {
    // Find an active A2A or MCP trigger for this workflow
    const triggers = await n8nWorkflowsService.listTriggers(workflowId);
    trigger = triggers.find(
      t => t.is_active && (t.trigger_type === "a2a" || t.trigger_type === "mcp")
    );
  }

  if (!trigger) {
    throw new Error("No active A2A/MCP trigger found");
  }

  // Verify the trigger belongs to the user's organization
  if (trigger.organization_id !== ctx.user.organization_id) {
    throw new Error("Unauthorized: Trigger belongs to a different organization");
  }

  // Verify trigger type is A2A or MCP
  if (trigger.trigger_type !== "a2a" && trigger.trigger_type !== "mcp") {
    throw new Error(`Invalid trigger type: ${trigger.trigger_type}. Use webhook endpoint for webhook triggers.`);
  }

  // Merge text content as message if provided
  const finalInputData = {
    ...(inputData || {}),
    ...(textContent && { message: textContent }),
    $a2a: {
      userId: ctx.user.id,
      organizationId: ctx.user.organization_id,
      agentIdentifier: ctx.agentIdentifier,
    },
  };

  const execution = await n8nWorkflowsService.executeWorkflowTrigger(
    trigger.id,
    finalInputData
  );

  return {
    executionId: execution.id,
    status: execution.status,
    workflowId: trigger.workflow_id,
    triggerId: trigger.id,
  };
}

/**
 * List N8N workflow triggers skill
 * Returns triggers available for the user's organization
 */
export async function executeSkillN8nListTriggers(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  triggers: Array<{
    id: string;
    workflowId: string;
    triggerType: string;
    triggerKey: string;
    isActive: boolean;
    executionCount: number;
    lastExecutedAt: string | null;
  }>;
  total: number;
}> {
  const { n8nWorkflowTriggersRepository } = await import("@/db/repositories/n8n-workflows");

  const workflowId = dataContent.workflowId as string | undefined;
  const triggerType = dataContent.triggerType as string | undefined;

  let triggers;
  
  if (workflowId) {
    triggers = await n8nWorkflowTriggersRepository.findByWorkflow(workflowId);
  } else {
    triggers = await n8nWorkflowTriggersRepository.findByOrganization(ctx.user.organization_id);
  }

  // Filter by trigger type if specified
  if (triggerType) {
    triggers = triggers.filter(t => t.trigger_type === triggerType);
  }

  return {
    triggers: triggers.map(t => ({
      id: t.id,
      workflowId: t.workflow_id,
      triggerType: t.trigger_type,
      triggerKey: t.trigger_type === "webhook" 
        ? t.trigger_key.slice(0, 8) + "..." // Redact webhook keys
        : t.trigger_key,
      isActive: t.is_active,
      executionCount: t.execution_count,
      lastExecutedAt: t.last_executed_at?.toISOString() || null,
    })),
    total: triggers.length,
  };
}

/**
 * Create N8N workflow trigger skill
 * Creates a new trigger for a workflow
 */
export async function executeSkillN8nCreateTrigger(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  triggerId: string;
  triggerType: string;
  triggerKey: string;
  webhookUrl?: string;
  webhookSecret?: string;
}> {
  const { n8nWorkflowsService } = await import("@/lib/services/n8n-workflows");

  const workflowId = dataContent.workflowId as string;
  const triggerType = dataContent.triggerType as "cron" | "webhook" | "a2a" | "mcp";
  const triggerKey = dataContent.triggerKey as string | undefined;
  const config = dataContent.config as Record<string, unknown> | undefined;

  if (!workflowId) {
    throw new Error("workflowId is required");
  }

  if (!triggerType) {
    throw new Error("triggerType is required (cron, webhook, a2a, or mcp)");
  }

  // Verify workflow belongs to user's organization
  const workflow = await n8nWorkflowsService.getWorkflow(workflowId);
  if (!workflow || workflow.organization_id !== ctx.user.organization_id) {
    throw new Error("Workflow not found");
  }

  // Validate cron expression for cron triggers
  if (triggerType === "cron" && !config?.cronExpression) {
    throw new Error("cronExpression is required for cron triggers");
  }

  const trigger = await n8nWorkflowsService.createTrigger(
    workflowId,
    triggerType,
    triggerKey,
    config || {}
  );

  const result: {
    triggerId: string;
    triggerType: string;
    triggerKey: string;
    webhookUrl?: string;
    webhookSecret?: string;
  } = {
    triggerId: trigger.id,
    triggerType: trigger.trigger_type,
    triggerKey: trigger.trigger_key,
  };

  // Include webhook URL and secret for webhook triggers (shown once)
  if (triggerType === "webhook") {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
    result.webhookUrl = `${baseUrl}/api/v1/n8n/webhooks/${trigger.trigger_key}`;
    result.webhookSecret = trigger.config.webhookSecret as string;
  }

  return result;
}

// =============================================================================
// APPLICATION TRIGGER SKILLS (Apps, Agents, MCPs)
// =============================================================================

/**
 * Create application trigger skill
 * Creates a trigger for an app, agent, or MCP
 */
export async function executeSkillCreateAppTrigger(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  triggerId: string;
  triggerType: string;
  triggerKey: string;
  webhookUrl?: string;
  webhookSecret?: string;
}> {
  const { applicationTriggersService } = await import("@/lib/services/application-triggers");

  const targetType = dataContent.targetType as "fragment_project" | "container" | "user_mcp";
  const targetId = dataContent.targetId as string;
  const triggerType = dataContent.triggerType as "cron" | "webhook" | "event";
  const name = (dataContent.name as string) || textContent || "Unnamed Trigger";
  const description = dataContent.description as string | undefined;
  const config = dataContent.config as Record<string, unknown> | undefined;
  const actionType = dataContent.actionType as string | undefined;
  const actionConfig = dataContent.actionConfig as Record<string, unknown> | undefined;

  if (!targetType || !targetId) {
    throw new Error("targetType and targetId are required");
  }

  if (!triggerType) {
    throw new Error("triggerType is required (cron, webhook, or event)");
  }

  if (triggerType === "cron" && !config?.cronExpression) {
    throw new Error("cronExpression is required for cron triggers");
  }

  if (triggerType === "event" && (!config?.eventTypes || (config.eventTypes as string[]).length === 0)) {
    throw new Error("eventTypes is required for event triggers");
  }

  const trigger = await applicationTriggersService.createTrigger({
    organizationId: ctx.user.organization_id,
    createdBy: ctx.user.id,
    targetType,
    targetId,
    triggerType,
    name,
    description,
    config,
    actionType,
    actionConfig,
  });

  const result: {
    triggerId: string;
    triggerType: string;
    triggerKey: string;
    webhookUrl?: string;
    webhookSecret?: string;
  } = {
    triggerId: trigger.id,
    triggerType: trigger.trigger_type,
    triggerKey: trigger.trigger_key,
  };

  if (triggerType === "webhook") {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
    result.webhookUrl = `${baseUrl}/api/v1/triggers/webhooks/${trigger.trigger_key}`;
    result.webhookSecret = trigger.config.webhookSecret as string;
  }

  return result;
}

/**
 * List application triggers skill
 * Lists triggers for an organization or specific target
 */
export async function executeSkillListAppTriggers(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  triggers: Array<{
    id: string;
    name: string;
    targetType: string;
    targetId: string;
    triggerType: string;
    isActive: boolean;
    executionCount: number;
    lastExecutedAt: string | null;
  }>;
  total: number;
}> {
  const { applicationTriggersService } = await import("@/lib/services/application-triggers");

  const targetType = dataContent.targetType as "fragment_project" | "container" | "user_mcp" | undefined;
  const targetId = dataContent.targetId as string | undefined;
  const triggerType = dataContent.triggerType as "cron" | "webhook" | "event" | undefined;

  let triggers;
  if (targetId && targetType) {
    triggers = await applicationTriggersService.listTriggersByTarget(targetType, targetId);
    triggers = triggers.filter(t => t.organization_id === ctx.user.organization_id);
  } else {
    triggers = await applicationTriggersService.listTriggersByOrganization(
      ctx.user.organization_id,
      { targetType, triggerType }
    );
  }

  return {
    triggers: triggers.map(t => ({
      id: t.id,
      name: t.name,
      targetType: t.target_type,
      targetId: t.target_id,
      triggerType: t.trigger_type,
      isActive: t.is_active,
      executionCount: t.execution_count,
      lastExecutedAt: t.last_executed_at?.toISOString() || null,
    })),
    total: triggers.length,
  };
}

/**
 * Execute application trigger skill
 * Manually executes a trigger
 */
export async function executeSkillExecuteAppTrigger(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  executionId: string;
  status: string;
  output?: Record<string, unknown>;
  error?: string;
}> {
  const { applicationTriggersService } = await import("@/lib/services/application-triggers");

  const triggerId = dataContent.triggerId as string;
  const inputData = dataContent.inputData as Record<string, unknown> | undefined;

  if (!triggerId) {
    throw new Error("triggerId is required");
  }

  const trigger = await applicationTriggersService.getTrigger(triggerId);
  if (!trigger) {
    throw new Error("Trigger not found");
  }

  if (trigger.organization_id !== ctx.user.organization_id) {
    throw new Error("Unauthorized: Trigger belongs to a different organization");
  }

  const result = await applicationTriggersService.executeTrigger(
    triggerId,
    {
      ...inputData,
      ...(textContent && { message: textContent }),
      $a2a: {
        userId: ctx.user.id,
        organizationId: ctx.user.organization_id,
        agentIdentifier: ctx.agentIdentifier,
      },
    },
    "manual"
  );

  return result;
}

// =============================================================================
// TELEGRAM SKILLS
// =============================================================================

/**
 * Send a Telegram message
 */
export async function executeSkillTelegramSendMessage(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  success: boolean;
  messageId: number;
  chatId: number;
}> {
  const { telegramService } = await import("@/lib/services/telegram");
  const { botsService } = await import("@/lib/services/bots");

  const chatId = dataContent.chatId as string | number;
  const text = (dataContent.text as string) || textContent;
  const connectionId = dataContent.connectionId as string | undefined;

  if (!chatId) throw new Error("chatId is required");
  if (!text) throw new Error("text is required");

  // Get connection ID
  let connId = connectionId;
  if (!connId) {
    const connections = await botsService.getConnections(ctx.user.organization_id);
    const telegramConn = connections.find(c => c.platform === "telegram" && c.status === "active");
    if (!telegramConn) throw new Error("No active Telegram bot connection");
    connId = telegramConn.id;
  }

  const message = await telegramService.sendMessageViaConnection(
    connId,
    ctx.user.organization_id,
    chatId,
    text,
    { parse_mode: dataContent.parseMode as "HTML" | "Markdown" | "MarkdownV2" | undefined }
  );

  return {
    success: true,
    messageId: message.message_id,
    chatId: message.chat.id,
  };
}

/**
 * List Telegram chats the bot is in
 */
export async function executeSkillTelegramListChats(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  chats: Array<{ chatId: string; name: string; enabled: boolean }>;
  count: number;
}> {
  const { telegramService } = await import("@/lib/services/telegram");
  const { botsService } = await import("@/lib/services/bots");

  const connectionId = dataContent.connectionId as string | undefined;

  let connId = connectionId;
  if (!connId) {
    const connections = await botsService.getConnections(ctx.user.organization_id);
    const telegramConn = connections.find(c => c.platform === "telegram" && c.status === "active");
    if (!telegramConn) throw new Error("No active Telegram bot connection");
    connId = telegramConn.id;
  }

  const chats = await telegramService.listChats(connId, ctx.user.organization_id);

  return {
    chats: chats.map(c => ({
      chatId: c.chatId,
      name: c.name,
      enabled: c.enabled,
    })),
    count: chats.length,
  };
}

/**
 * List connected Telegram bots
 */
export async function executeSkillTelegramListBots(
  ctx: A2AContext
): Promise<{
  bots: Array<{
    id: string;
    botId: string | null;
    botUsername: string | null;
    status: string;
  }>;
  count: number;
}> {
  const { botsService } = await import("@/lib/services/bots");

  const connections = await botsService.getConnections(ctx.user.organization_id);
  const telegramBots = connections.filter(c => c.platform === "telegram");

  return {
    bots: telegramBots.map(b => ({
      id: b.id,
      botId: b.platform_bot_id,
      botUsername: b.platform_bot_username,
      status: b.status,
    })),
    count: telegramBots.length,
  };
}

// =============================================================================
// ORG TOOLS SKILLS - Task and Check-in Management
// =============================================================================

/**
 * Create a task
 */
export async function executeSkillCreateTask(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  success: boolean;
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
  };
}> {
  const { tasksService } = await import("@/lib/services/tasks");

  const title = (dataContent.title as string) || textContent;
  if (!title) throw new Error("title is required");

  const task = await tasksService.create({
    organizationId: ctx.user.organization_id,
    title,
    description: dataContent.description as string | undefined,
    priority: dataContent.priority as "low" | "medium" | "high" | "urgent" | undefined,
    dueDate: dataContent.dueDate ? new Date(dataContent.dueDate as string) : undefined,
    assigneePlatformId: dataContent.assigneePlatformId as string | undefined,
    assigneePlatform: dataContent.assigneePlatform as "discord" | "telegram" | undefined,
    assigneeName: dataContent.assigneeName as string | undefined,
    tags: dataContent.tags as string[] | undefined,
    createdByUserId: ctx.user.id,
    sourcePlatform: "web",
  });

  return {
    success: true,
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
    },
  };
}

/**
 * List tasks
 */
export async function executeSkillListTasks(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
  }>;
  total: number;
}> {
  const { tasksService } = await import("@/lib/services/tasks");

  const result = await tasksService.list(ctx.user.organization_id, {
    status: dataContent.status as "pending" | "in_progress" | "completed" | "cancelled" | undefined,
    priority: dataContent.priority as "low" | "medium" | "high" | "urgent" | undefined,
    limit: (dataContent.limit as number) || 20,
  });

  return {
    tasks: result.items.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_date?.toISOString() || null,
    })),
    total: result.total,
  };
}

/**
 * Update a task
 */
export async function executeSkillUpdateTask(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  success: boolean;
  task: {
    id: string;
    title: string;
    status: string;
  };
}> {
  const { tasksService } = await import("@/lib/services/tasks");

  const taskId = dataContent.taskId as string;
  if (!taskId) throw new Error("taskId is required");

  const task = await tasksService.update(taskId, ctx.user.organization_id, {
    title: dataContent.title as string | undefined,
    description: dataContent.description as string | undefined,
    status: dataContent.status as "pending" | "in_progress" | "completed" | "cancelled" | undefined,
    priority: dataContent.priority as "low" | "medium" | "high" | "urgent" | undefined,
  });

  if (!task) throw new Error("Task not found");

  return {
    success: true,
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
    },
  };
}

/**
 * Complete a task
 */
export async function executeSkillCompleteTask(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  success: boolean;
  task: { id: string; status: string };
}> {
  const { tasksService } = await import("@/lib/services/tasks");

  const taskId = dataContent.taskId as string;
  if (!taskId) throw new Error("taskId is required");

  const task = await tasksService.update(taskId, ctx.user.organization_id, {
    status: "completed",
  });

  if (!task) throw new Error("Task not found");

  return {
    success: true,
    task: { id: task.id, status: task.status },
  };
}

/**
 * Get task statistics
 */
export async function executeSkillGetTaskStats(
  ctx: A2AContext
): Promise<{
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
}> {
  const { tasksService } = await import("@/lib/services/tasks");

  const stats = await tasksService.getStats(ctx.user.organization_id);
  return {
    total: stats.total,
    pending: stats.pending,
    inProgress: stats.inProgress,
    completed: stats.completed,
    overdue: stats.overdue,
  };
}

/**
 * Create a check-in schedule
 */
export async function executeSkillCreateCheckinSchedule(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  success: boolean;
  schedule: {
    id: string;
    name: string;
    frequency: string;
    timeUtc: string;
  };
}> {
  const { checkinsService } = await import("@/lib/services/checkins");

  const serverId = dataContent.serverId as string;
  const name = dataContent.name as string;
  const timeUtc = dataContent.timeUtc as string;
  const checkinChannelId = dataContent.checkinChannelId as string;

  if (!serverId) throw new Error("serverId is required");
  if (!name) throw new Error("name is required");
  if (!timeUtc) throw new Error("timeUtc is required (HH:MM format)");
  if (!checkinChannelId) throw new Error("checkinChannelId is required");

  const schedule = await checkinsService.createSchedule({
    organizationId: ctx.user.organization_id,
    serverId,
    name,
    checkinType: dataContent.checkinType as "standup" | "sprint" | "mental_health" | "project_status" | "retrospective" | undefined,
    frequency: dataContent.frequency as "daily" | "weekdays" | "weekly" | "bi_weekly" | "monthly" | undefined,
    timeUtc,
    checkinChannelId,
    questions: dataContent.questions as string[] | undefined,
    createdBy: ctx.user.id,
  });

  return {
    success: true,
    schedule: {
      id: schedule.id,
      name: schedule.name,
      frequency: schedule.frequency,
      timeUtc: schedule.time_utc,
    },
  };
}

/**
 * List check-in schedules
 */
export async function executeSkillListCheckinSchedules(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  schedules: Array<{
    id: string;
    name: string;
    frequency: string;
    timeUtc: string;
    enabled: boolean;
  }>;
  count: number;
}> {
  const { checkinsService } = await import("@/lib/services/checkins");

  const serverId = dataContent.serverId as string | undefined;
  
  const schedules = serverId
    ? await checkinsService.listServerSchedules(serverId)
    : await checkinsService.listSchedules(ctx.user.organization_id);

  return {
    schedules: schedules.map(s => ({
      id: s.id,
      name: s.name,
      frequency: s.frequency,
      timeUtc: s.time_utc,
      enabled: s.enabled,
    })),
    count: schedules.length,
  };
}

/**
 * Record a check-in response
 */
export async function executeSkillRecordCheckinResponse(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  success: boolean;
  responseId: string;
}> {
  const { checkinsService } = await import("@/lib/services/checkins");

  const scheduleId = dataContent.scheduleId as string;
  const responderPlatformId = dataContent.responderPlatformId as string;
  const responderPlatform = dataContent.responderPlatform as "discord" | "telegram";
  const answers = dataContent.answers as Record<string, string>;

  if (!scheduleId) throw new Error("scheduleId is required");
  if (!responderPlatformId) throw new Error("responderPlatformId is required");
  if (!responderPlatform) throw new Error("responderPlatform is required");
  if (!answers) throw new Error("answers is required");

  const response = await checkinsService.recordResponse({
    scheduleId,
    organizationId: ctx.user.organization_id,
    responderPlatformId,
    responderPlatform,
    responderName: dataContent.responderName as string | undefined,
    answers,
  });

  return {
    success: true,
    responseId: response.id,
  };
}

/**
 * Generate a check-in report
 */
export async function executeSkillGenerateCheckinReport(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  report: {
    scheduleId: string;
    scheduleName: string;
    dateRange: { start: string; end: string };
    totalResponses: number;
    participationRate: number;
    summary: string;
  };
}> {
  const { checkinsService } = await import("@/lib/services/checkins");

  const scheduleId = dataContent.scheduleId as string;
  const startDate = dataContent.startDate as string;
  const endDate = dataContent.endDate as string;

  if (!scheduleId) throw new Error("scheduleId is required");
  if (!startDate) throw new Error("startDate is required");
  if (!endDate) throw new Error("endDate is required");

  const report = await checkinsService.generateReport(
    scheduleId,
    ctx.user.organization_id,
    {
      start: new Date(startDate),
      end: new Date(endDate),
    }
  );

  return { report };
}

/**
 * Add a team member
 */
export async function executeSkillAddTeamMember(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  success: boolean;
  member: {
    id: string;
    displayName: string | null;
    platform: string;
  };
}> {
  const { checkinsService } = await import("@/lib/services/checkins");

  const serverId = dataContent.serverId as string;
  const platformUserId = dataContent.platformUserId as string;
  const platform = dataContent.platform as "discord" | "telegram";

  if (!serverId) throw new Error("serverId is required");
  if (!platformUserId) throw new Error("platformUserId is required");
  if (!platform) throw new Error("platform is required");

  const member = await checkinsService.upsertTeamMember({
    organizationId: ctx.user.organization_id,
    serverId,
    platformUserId,
    platform,
    displayName: dataContent.displayName as string | undefined,
    role: dataContent.role as string | undefined,
    isAdmin: dataContent.isAdmin as boolean | undefined,
  });

  return {
    success: true,
    member: {
      id: member.id,
      displayName: member.display_name,
      platform: member.platform,
    },
  };
}

/**
 * List team members
 */
export async function executeSkillListTeamMembers(
  dataContent: Record<string, unknown>,
  ctx: A2AContext
): Promise<{
  members: Array<{
    id: string;
    platformUserId: string;
    displayName: string | null;
    platform: string;
    role: string | null;
  }>;
  count: number;
}> {
  const { checkinsService } = await import("@/lib/services/checkins");

  const serverId = dataContent.serverId as string;
  if (!serverId) throw new Error("serverId is required");

  const members = await checkinsService.getTeamMembers(serverId);

  return {
    members: members.map(m => ({
      id: m.id,
      platformUserId: m.platform_user_id,
      displayName: m.display_name,
      platform: m.platform,
      role: m.role,
    })),
    count: members.length,
  };
}

/**
 * Get platform connection status
 */
export async function executeSkillGetPlatformStatus(
  ctx: A2AContext
): Promise<{
  platforms: Array<{
    platform: string;
    status: string;
    botUsername: string | null;
    serverCount: number;
  }>;
}> {
  const { botsService } = await import("@/lib/services/bots");

  const connections = await botsService.getConnections(ctx.user.organization_id);

  return {
    platforms: connections.map(c => ({
      platform: c.platform,
      status: c.status,
      botUsername: c.platform_bot_username,
      serverCount: ((c.profile_data as Record<string, unknown>)?.servers as unknown[] || []).length,
    })),
  };
}

