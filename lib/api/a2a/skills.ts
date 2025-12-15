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
import { agentsService } from "@/lib/services/agents/agents";
import {
  storageService,
  calculateUploadCost,
  formatPrice,
} from "@/lib/services/storage";
import { ipfsService } from "@/lib/services/ipfs";
import {
  calculateCost,
  getProviderFromModel,
  estimateRequestCost,
  IMAGE_GENERATION_COST,
} from "@/lib/pricing";
import { stripProviderPrefix } from "@/lib/utils/model-names";
import { seoRequestTypeEnum } from "@/db/schemas/seo";
// Base URL for internal API calls
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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

export type { N8nWorkflowResult, N8nWorkflowListResult };

/**
 * Chat completion skill - Generate text with LLMs
 */
export async function executeSkillChatCompletion(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
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
      `Insufficient credits: need $${estimatedCost.toFixed(4)}, have $${Number(ctx.user.organization.credit_balance).toFixed(4)}`,
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
    usage?.outputTokens || 0,
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
  ctx: A2AContext,
): Promise<ImageGenerationResult> {
  const prompt = (dataContent.prompt as string) || textContent;
  const aspectRatio = (dataContent.aspectRatio as string) || "1:1";

  if (!prompt) throw new Error("Image prompt required");

  if (Number(ctx.user.organization.credit_balance) < IMAGE_GENERATION_COST) {
    throw new Error(
      `Insufficient credits: need $${IMAGE_GENERATION_COST.toFixed(4)}`,
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
 * Get x402 topup requirements skill
 * Permissionless - no authentication required
 */
export async function executeSkillGetX402TopupRequirements(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
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
  const baseUrl = BASE_URL;

  return {
    x402: {
      enabled: X402_ENABLED,
      topupEndpoint: `${baseUrl}/api/v1/credits/topup`,
      network,
      asset: USDC_ADDRESSES[network],
      payTo: X402_RECIPIENT_ADDRESS,
      price: TOPUP_PRICE,
      creditsPerDollar: CREDITS_PER_DOLLAR,
      creditsPerTopup: Math.floor(
        parseFloat(TOPUP_PRICE.replace("$", "")) * CREDITS_PER_DOLLAR,
      ),
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
export async function executeSkillCheckBalance(
  ctx: A2AContext,
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
  ctx: A2AContext,
): Promise<UsageResult> {
  const limit = Math.min(50, (dataContent.limit as number) || 10);
  const records = await usageService.listByOrganization(
    ctx.user.organization_id,
    limit,
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
  ctx: A2AContext,
): Promise<ListAgentsResult> {
  const limit = (dataContent.limit as number) || 20;
  const chars = await charactersService.listByOrganization(
    ctx.user.organization_id,
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
  ctx: A2AContext,
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
    (await agentsService.getOrCreateRoom(entityId || ctx.user.id, agentId!));

  const response = await agentsService.sendMessage({
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
  ctx: A2AContext,
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
  ctx: A2AContext,
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
 * Create conversation skill
 */
export async function executeSkillCreateConversation(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
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

  return {
    conversationId: conv.id,
    title: conv.title,
    model: conv.model,
    cost: COST,
  };
}

/**
 * List containers skill
 */
export async function executeSkillListContainers(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<ListContainersResult> {
  const status = dataContent.status as string | undefined;
  let containers = await containersService.listByOrganization(
    ctx.user.organization_id,
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
  ctx: A2AContext,
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
  ctx: A2AContext,
): Promise<{ context: Record<string, unknown> }> {
  const conversationId = dataContent.conversationId as string;
  if (!conversationId) throw new Error("conversationId required");

  const conversation = await conversationsService.getById(conversationId);
  if (
    !conversation ||
    conversation.organization_id !== ctx.user.organization_id
  ) {
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
  ctx: A2AContext,
): Promise<VideoGenerationResult> {
  const prompt = (dataContent.prompt as string) || textContent;
  const model = (dataContent.model as string) || "google/veo3";

  if (!prompt) throw new Error("Video prompt required");

  const VIDEO_COST = 5; // $5 per video
  // Use the model as-is (should already be in user-friendly format like "veo3")
  const displayModel = stripProviderPrefix(model);

  if (Number(ctx.user.organization.credit_balance) < VIDEO_COST) {
    throw new Error(`Insufficient credits: need $${VIDEO_COST.toFixed(2)}`);
  }

  const deduction = await creditsService.deductCredits({
    organizationId: ctx.user.organization_id,
    amount: VIDEO_COST,
    description: "A2A video generation",
    metadata: { user_id: ctx.user.id, model: displayModel },
  });
  if (!deduction.success) throw new Error("Credit deduction failed");

  const generation = await generationsService.create({
    organization_id: ctx.user.organization_id,
    user_id: ctx.user.id,
    api_key_id: ctx.apiKeyId,
    type: "video",
    model: displayModel,
    provider: "video",
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
  ctx: A2AContext,
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
  ctx: A2AContext,
): Promise<StorageUploadResult> {
  const content = dataContent.content as string;
  const filename = (dataContent.filename as string) || "file.bin";
  const contentType =
    (dataContent.contentType as string) || "application/octet-stream";
  const pinToIPFS = (dataContent.pinToIPFS as boolean) ?? true;

  if (!content) {
    throw new Error("Content required (base64 encoded)");
  }

  // Decode base64 content
  const buffer = Buffer.from(content, "base64");
  const cost = calculateUploadCost(buffer.length);

  // Check balance
  if (Number(ctx.user.organization.credit_balance) < cost) {
    throw new Error(
      `Insufficient credits: need ${formatPrice(cost)}, have ${formatPrice(Number(ctx.user.organization.credit_balance))}`,
    );
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
  ctx: A2AContext,
): Promise<StorageListResult> {
  const limit = Math.min(100, (dataContent.limit as number) || 50);
  const cursor = dataContent.cursor as string | undefined;

  const result = await storageService.list({
    ownerAddress: ctx.user.id,
    limit,
    cursor,
  });

  return {
    items: result.items.map((item) => ({
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
  ctx: A2AContext,
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
  dataContent: Record<string, unknown>,
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
  ctx: A2AContext,
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
  ctx: A2AContext,
): Promise<N8nWorkflowResult> {
  const { n8nWorkflowsService } = await import("@/lib/services/n8n-workflows");
  const { appsService } = await import("@/lib/services/apps");

  const name = (dataContent.name as string) || textContent;
  const description = dataContent.description as string | undefined;
  const workflowData = dataContent.workflowData as
    | Record<string, unknown>
    | undefined;
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
  ctx: A2AContext,
): Promise<N8nWorkflowListResult> {
  const { n8nWorkflowsService } = await import("@/lib/services/n8n-workflows");

  const status = dataContent.status as
    | "draft"
    | "active"
    | "archived"
    | undefined;
  const limit = Math.min(50, (dataContent.limit as number) || 20);

  const workflows = await n8nWorkflowsService.listWorkflows(
    ctx.user.organization_id,
    {
      status,
      limit,
    },
  );

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
  ctx: A2AContext,
): Promise<{
  workflow: Record<string, unknown>;
  cost: number;
  savedWorkflow?: { id: string; name: string };
  validation?: { valid: boolean; errors: string[]; warnings: string[] };
}> {
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
  const { endpointDiscoveryService } =
    await import("@/lib/services/endpoint-discovery");

  // Discover endpoints and get context
  const availableEndpoints =
    await endpointDiscoveryService.discoverAllEndpoints();
  const endpointNodes = availableEndpoints.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    type: e.type,
    category: e.category,
    endpoint: e.endpoint,
    method: e.method,
  }));

  const existingWorkflows = await n8nWorkflowsService.listWorkflows(
    ctx.user.organization_id,
    { limit: 10 },
  );
  const workflowContext = existingWorkflows.map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    tags: w.tags,
  }));

  const globalVariables = await n8nWorkflowsService.getGlobalVariables(
    ctx.user.organization_id,
  );
  const variablesContext = Object.fromEntries(
    globalVariables.map((v) => [v.name, v.is_secret ? "***" : v.value]),
  );

  const baseUrl = BASE_URL;
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
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Failed to generate workflow: ${error.error || response.statusText}`,
    );
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
  ctx: A2AContext,
): Promise<FragmentGenerationResult> {
  const prompt = (dataContent.prompt as string) || textContent;
  const template = (dataContent.template as string) || "auto";
  const model = (dataContent.model as string) || "gpt-4o";

  if (!prompt) {
    throw new Error("Prompt required");
  }

  const baseUrl = BASE_URL;
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
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Failed to generate fragment: ${error.error || response.statusText}`,
    );
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
  ctx: A2AContext,
): Promise<FragmentExecutionResult> {
  const fragment = dataContent.fragment as Record<string, unknown>;

  if (!fragment) {
    throw new Error("Fragment required");
  }

  const baseUrl = BASE_URL;
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
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Failed to execute fragment: ${error.error || response.statusText}`,
    );
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
  ctx: A2AContext,
): Promise<FragmentProjectListResult> {
  const baseUrl = BASE_URL;
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const status = dataContent.status as string | undefined;
  const userId = dataContent.userId as string | undefined;

  const searchParams = new URLSearchParams();
  if (status) searchParams.set("status", status);
  if (userId) searchParams.set("userId", userId);

  const response = await fetch(
    `${baseUrl}/api/v1/fragments/projects?${searchParams.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Failed to list projects: ${error.error || response.statusText}`,
    );
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
  ctx: A2AContext,
): Promise<FragmentProjectResult> {
  const baseUrl = BASE_URL;
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
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Failed to create project: ${error.error || response.statusText}`,
    );
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
  ctx: A2AContext,
): Promise<FragmentProjectResult> {
  const baseUrl = BASE_URL;
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const projectId = (dataContent.projectId as string) || textContent;

  if (!projectId) {
    throw new Error("Project ID is required");
  }

  const response = await fetch(
    `${baseUrl}/api/v1/fragments/projects/${projectId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Failed to get project: ${error.error || response.statusText}`,
    );
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
  ctx: A2AContext,
): Promise<FragmentProjectResult> {
  const baseUrl = BASE_URL;
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const projectId = dataContent.projectId as string;
  const name = dataContent.name as string | undefined;
  const description = dataContent.description as string | undefined;
  const fragment = dataContent.fragment as Record<string, unknown> | undefined;
  const status = dataContent.status as
    | "draft"
    | "deployed"
    | "archived"
    | undefined;

  if (!projectId) {
    throw new Error("Project ID is required");
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (fragment !== undefined) updateData.fragment = fragment;
  if (status !== undefined) updateData.status = status;

  const response = await fetch(
    `${baseUrl}/api/v1/fragments/projects/${projectId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(updateData),
    },
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Failed to update project: ${error.error || response.statusText}`,
    );
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
  ctx: A2AContext,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = BASE_URL;
  const apiKey = process.env.ELIZA_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error("Cloud API key not configured");
  }

  const projectId = (dataContent.projectId as string) || textContent;

  if (!projectId) {
    throw new Error("Project ID is required");
  }

  const response = await fetch(
    `${baseUrl}/api/v1/fragments/projects/${projectId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Failed to delete project: ${error.error || response.statusText}`,
    );
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
  ctx: A2AContext,
): Promise<FragmentDeploymentResult> {
  const baseUrl = BASE_URL;
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

  const response = await fetch(
    `${baseUrl}/api/v1/fragments/projects/${projectId}/deploy`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(deployData),
    },
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Failed to deploy project: ${error.error || response.statusText}`,
    );
  }

  const data = await response.json();

  return {
    deployment: data.deployment,
  };
}

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
  ctx: A2AContext,
): Promise<MarketplaceDiscoveryResult> {
  const { erc8004MarketplaceService } =
    await import("@/lib/services/erc8004-marketplace");

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
    { page, limit },
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
  dataContent: Record<string, unknown>,
): Promise<MarketplaceDiscoveryResult> {
  const { erc8004MarketplaceService } =
    await import("@/lib/services/erc8004-marketplace");

  const tags =
    (dataContent.tags as string[]) ||
    textContent.split(",").map((t) => t.trim());
  const limit = Math.min(20, (dataContent.limit as number) || 10);
  const activeOnly = (dataContent.activeOnly as boolean) ?? true;

  const items = await erc8004MarketplaceService.getByTags(tags, {
    limit,
    activeOnly,
  });

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
  dataContent: Record<string, unknown>,
): Promise<MarketplaceDiscoveryResult> {
  const { erc8004MarketplaceService } =
    await import("@/lib/services/erc8004-marketplace");

  const tools =
    (dataContent.tools as string[]) ||
    textContent.split(",").map((t) => t.trim());
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
  dataContent: Record<string, unknown>,
): Promise<MarketplaceDiscoveryResult> {
  const { erc8004MarketplaceService } =
    await import("@/lib/services/erc8004-marketplace");

  const type = dataContent.type as "agent" | "mcp" | "app" | undefined;
  const limit = Math.min(20, (dataContent.limit as number) || 10);

  const items = await erc8004MarketplaceService.getPayableServices({
    type,
    limit,
  });

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
 * Start a full app builder session skill
 * Creates a Vercel sandbox with a Next.js template for building complete multi-file apps
 */
export async function executeSkillFullAppBuilderStart(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<FullAppBuilderSessionResult> {
  const { aiAppBuilderService } = await import("@/lib/services/ai-app-builder");

  const appName = (dataContent.appName as string) || textContent;
  const appDescription = dataContent.appDescription as string | undefined;
  const templateType =
    (dataContent.templateType as
      | "chat"
      | "agent-dashboard"
      | "landing-page"
      | "analytics"
      | "blank") || "blank";
  const includeMonetization =
    (dataContent.includeMonetization as boolean) || false;
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
  ctx: A2AContext,
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

  const result = await aiAppBuilderService.sendPrompt(
    sessionId,
    prompt,
    ctx.user.id,
  );

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
  ctx: A2AContext,
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

  const generatedFiles =
    (dbSession?.generated_files as Array<{ path: string }>) || [];

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
  ctx: A2AContext,
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
  ctx: A2AContext,
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
  ctx: A2AContext,
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

// N8N WORKFLOW TRIGGER SKILLS

/**
 * Execute N8N workflow via A2A/MCP trigger
 *
 * This skill allows triggering N8N workflows that have been configured
 * with A2A or MCP trigger types.
 */
export async function executeSkillN8nTriggerWorkflow(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
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
  const inputData = dataContent.inputData as
    | Record<string, unknown>
    | undefined;

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
      (t) =>
        t.is_active && (t.trigger_type === "a2a" || t.trigger_type === "mcp"),
    );
  }

  if (!trigger) {
    throw new Error("No active A2A/MCP trigger found");
  }

  // Verify the trigger belongs to the user's organization
  if (trigger.organization_id !== ctx.user.organization_id) {
    throw new Error(
      "Unauthorized: Trigger belongs to a different organization",
    );
  }

  // Verify trigger type is A2A or MCP
  if (trigger.trigger_type !== "a2a" && trigger.trigger_type !== "mcp") {
    throw new Error(
      `Invalid trigger type: ${trigger.trigger_type}. Use webhook endpoint for webhook triggers.`,
    );
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
    finalInputData,
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
  ctx: A2AContext,
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
  const { n8nWorkflowTriggersRepository } =
    await import("@/db/repositories/n8n-workflows");

  const workflowId = dataContent.workflowId as string | undefined;
  const triggerType = dataContent.triggerType as string | undefined;

  let triggers;

  if (workflowId) {
    triggers = await n8nWorkflowTriggersRepository.findByWorkflow(workflowId);
  } else {
    triggers = await n8nWorkflowTriggersRepository.findByOrganization(
      ctx.user.organization_id,
    );
  }

  // Filter by trigger type if specified
  if (triggerType) {
    triggers = triggers.filter((t) => t.trigger_type === triggerType);
  }

  return {
    triggers: triggers.map((t) => ({
      id: t.id,
      workflowId: t.workflow_id,
      triggerType: t.trigger_type,
      triggerKey:
        t.trigger_type === "webhook"
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
  ctx: A2AContext,
): Promise<{
  triggerId: string;
  triggerType: string;
  triggerKey: string;
  webhookUrl?: string;
  webhookSecret?: string;
}> {
  const { n8nWorkflowsService } = await import("@/lib/services/n8n-workflows");

  const workflowId = dataContent.workflowId as string;
  const triggerType = dataContent.triggerType as
    | "cron"
    | "webhook"
    | "a2a"
    | "mcp";
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
    config || {},
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
    const baseUrl = BASE_URL;
    result.webhookUrl = `${baseUrl}/api/v1/n8n/webhooks/${trigger.trigger_key}`;
    result.webhookSecret = trigger.config.webhookSecret as string;
  }

  return result;
}

// APPLICATION TRIGGER SKILLS (Apps, Agents, MCPs)

/**
 * Create application trigger skill
 * Creates a trigger for an app, agent, or MCP
 */
export async function executeSkillCreateAppTrigger(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  triggerId: string;
  triggerType: string;
  triggerKey: string;
  webhookUrl?: string;
  webhookSecret?: string;
}> {
  const { applicationTriggersService } =
    await import("@/lib/services/application-triggers");

  const targetType = dataContent.targetType as
    | "fragment_project"
    | "container"
    | "user_mcp";
  const targetId = dataContent.targetId as string;
  const triggerType = dataContent.triggerType as "cron" | "webhook" | "event";
  const name = (dataContent.name as string) || textContent || "Unnamed Trigger";
  const description = dataContent.description as string | undefined;
  const config = dataContent.config as Record<string, unknown> | undefined;
  const actionType = dataContent.actionType as string | undefined;
  const actionConfig = dataContent.actionConfig as
    | Record<string, unknown>
    | undefined;

  if (!targetType || !targetId) {
    throw new Error("targetType and targetId are required");
  }

  if (!triggerType) {
    throw new Error("triggerType is required (cron, webhook, or event)");
  }

  if (triggerType === "cron" && !config?.cronExpression) {
    throw new Error("cronExpression is required for cron triggers");
  }

  if (
    triggerType === "event" &&
    (!config?.eventTypes || (config.eventTypes as string[]).length === 0)
  ) {
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
    const baseUrl = BASE_URL;
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
  ctx: A2AContext,
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
  const { applicationTriggersService } =
    await import("@/lib/services/application-triggers");

  const targetType = dataContent.targetType as
    | "fragment_project"
    | "container"
    | "user_mcp"
    | undefined;
  const targetId = dataContent.targetId as string | undefined;
  const triggerType = dataContent.triggerType as
    | "cron"
    | "webhook"
    | "event"
    | undefined;

  let triggers;
  if (targetId && targetType) {
    triggers = await applicationTriggersService.listTriggersByTarget(
      targetType,
      targetId,
    );
    triggers = triggers.filter(
      (t) => t.organization_id === ctx.user.organization_id,
    );
  } else {
    triggers = await applicationTriggersService.listTriggersByOrganization(
      ctx.user.organization_id,
      { targetType, triggerType },
    );
  }

  return {
    triggers: triggers.map((t) => ({
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
  ctx: A2AContext,
): Promise<{
  executionId: string;
  status: string;
  output?: Record<string, unknown>;
  error?: string;
}> {
  const { applicationTriggersService } =
    await import("@/lib/services/application-triggers");

  const triggerId = dataContent.triggerId as string;
  const inputData = dataContent.inputData as
    | Record<string, unknown>
    | undefined;

  if (!triggerId) {
    throw new Error("triggerId is required");
  }

  const trigger = await applicationTriggersService.getTrigger(triggerId);
  if (!trigger) {
    throw new Error("Trigger not found");
  }

  if (trigger.organization_id !== ctx.user.organization_id) {
    throw new Error(
      "Unauthorized: Trigger belongs to a different organization",
    );
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
    "manual",
  );

  return result;
}

// TELEGRAM SKILLS

/**
 * Send a Telegram message
 */
export async function executeSkillTelegramSendMessage(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
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
    const connections = await botsService.getConnections(
      ctx.user.organization_id,
    );
    const telegramConn = connections.find(
      (c) => c.platform === "telegram" && c.status === "active",
    );
    if (!telegramConn) throw new Error("No active Telegram bot connection");
    connId = telegramConn.id;
  }

  const message = await telegramService.sendMessageViaConnection(
    connId,
    ctx.user.organization_id,
    chatId,
    text,
    {
      parse_mode: dataContent.parseMode as
        | "HTML"
        | "Markdown"
        | "MarkdownV2"
        | undefined,
    },
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
  ctx: A2AContext,
): Promise<{
  chats: Array<{ chatId: string; name: string; enabled: boolean }>;
  count: number;
}> {
  const { telegramService } = await import("@/lib/services/telegram");
  const { botsService } = await import("@/lib/services/bots");

  const connectionId = dataContent.connectionId as string | undefined;

  let connId = connectionId;
  if (!connId) {
    const connections = await botsService.getConnections(
      ctx.user.organization_id,
    );
    const telegramConn = connections.find(
      (c) => c.platform === "telegram" && c.status === "active",
    );
    if (!telegramConn) throw new Error("No active Telegram bot connection");
    connId = telegramConn.id;
  }

  const chats = await telegramService.listChats(
    connId,
    ctx.user.organization_id,
  );

  return {
    chats: chats.map((c) => ({
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
export async function executeSkillTelegramListBots(ctx: A2AContext): Promise<{
  bots: Array<{
    id: string;
    botId: string | null;
    botUsername: string | null;
    status: string;
  }>;
  count: number;
}> {
  const { botsService } = await import("@/lib/services/bots");

  const connections = await botsService.getConnections(
    ctx.user.organization_id,
  );
  const telegramBots = connections.filter((c) => c.platform === "telegram");

  return {
    bots: telegramBots.map((b) => ({
      id: b.id,
      botId: b.platform_bot_id,
      botUsername: b.platform_bot_username,
      status: b.status,
    })),
    count: telegramBots.length,
  };
}

// ORG TOOLS SKILLS - Task and Check-in Management

/**
 * Create a task
 */
export async function executeSkillCreateTask(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
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
    priority: dataContent.priority as
      | "low"
      | "medium"
      | "high"
      | "urgent"
      | undefined,
    dueDate: dataContent.dueDate
      ? new Date(dataContent.dueDate as string)
      : undefined,
    assigneePlatformId: dataContent.assigneePlatformId as string | undefined,
    assigneePlatform: dataContent.assigneePlatform as
      | "discord"
      | "telegram"
      | undefined,
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
  ctx: A2AContext,
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
    status: dataContent.status as
      | "pending"
      | "in_progress"
      | "completed"
      | "cancelled"
      | undefined,
    priority: dataContent.priority as
      | "low"
      | "medium"
      | "high"
      | "urgent"
      | undefined,
    limit: (dataContent.limit as number) || 20,
  });

  return {
    tasks: result.items.map((t) => ({
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
  ctx: A2AContext,
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
    status: dataContent.status as
      | "pending"
      | "in_progress"
      | "completed"
      | "cancelled"
      | undefined,
    priority: dataContent.priority as
      | "low"
      | "medium"
      | "high"
      | "urgent"
      | undefined,
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
  ctx: A2AContext,
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
export async function executeSkillGetTaskStats(ctx: A2AContext): Promise<{
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
  ctx: A2AContext,
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
    checkinType: dataContent.checkinType as
      | "standup"
      | "sprint"
      | "mental_health"
      | "project_status"
      | "retrospective"
      | undefined,
    frequency: dataContent.frequency as
      | "daily"
      | "weekdays"
      | "weekly"
      | "bi_weekly"
      | "monthly"
      | undefined,
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
  ctx: A2AContext,
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
    schedules: schedules.map((s) => ({
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
  ctx: A2AContext,
): Promise<{
  success: boolean;
  responseId: string;
}> {
  const { checkinsService } = await import("@/lib/services/checkins");

  const scheduleId = dataContent.scheduleId as string;
  const responderPlatformId = dataContent.responderPlatformId as string;
  const responderPlatform = dataContent.responderPlatform as
    | "discord"
    | "telegram";
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
  ctx: A2AContext,
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
    },
  );

  return { report };
}

/**
 * Add a team member
 */
export async function executeSkillAddTeamMember(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
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
  ctx: A2AContext,
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
    members: members.map((m) => ({
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
export async function executeSkillGetPlatformStatus(ctx: A2AContext): Promise<{
  platforms: Array<{
    platform: string;
    status: string;
    botUsername: string | null;
    serverCount: number;
  }>;
}> {
  const { botsService } = await import("@/lib/services/bots");

  const connections = await botsService.getConnections(
    ctx.user.organization_id,
  );

  return {
    platforms: connections.map((c) => ({
      platform: c.platform,
      status: c.status,
      botUsername: c.platform_bot_username,
      serverCount: (
        ((c.profile_data as Record<string, unknown>)?.servers as unknown[]) ||
        []
      ).length,
    })),
  };
}

// SOCIAL MEDIA SKILLS

/**
 * Social media post result type
 */
export interface SocialMediaPostResult {
  success: boolean;
  results: Array<{
    platform: string;
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
  }>;
  summary: {
    totalPlatforms: number;
    successCount: number;
    failureCount: number;
  };
}

/**
 * Social media analytics result type
 */
export interface SocialMediaAnalyticsResult {
  analytics: {
    platform: string;
    postId?: string;
    accountId?: string;
    metrics: Record<string, number | undefined>;
    fetchedAt: string;
  } | null;
}

/**
 * Create social media post across multiple platforms
 */
export async function executeSkillSocialMediaPost(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<SocialMediaPostResult> {
  const { socialMediaService } = await import("@/lib/services/social-media");

  const text = (dataContent.text as string) || textContent;
  const platforms = dataContent.platforms as string[];
  const media = dataContent.media as
    | Array<{
        type: "image" | "video" | "gif";
        url?: string;
        mimeType: string;
        altText?: string;
      }>
    | undefined;
  const link = dataContent.link as string | undefined;
  const platformOptions = dataContent.platformOptions as
    | Record<string, unknown>
    | undefined;
  const credentialIds = dataContent.credentialIds as
    | Record<string, string>
    | undefined;

  if (!text) throw new Error("Text content required");
  if (!platforms?.length) throw new Error("At least one platform required");

  const result = await socialMediaService.createPost({
    organizationId: ctx.user.organization_id,
    userId: ctx.user.id,
    content: { text, media, link },
    platforms: platforms as Array<
      | "twitter"
      | "bluesky"
      | "discord"
      | "telegram"
      | "reddit"
      | "facebook"
      | "instagram"
      | "tiktok"
      | "linkedin"
    >,
    platformOptions,
    credentialIds: credentialIds as Partial<
      Record<
        | "twitter"
        | "bluesky"
        | "discord"
        | "telegram"
        | "reddit"
        | "facebook"
        | "instagram"
        | "tiktok"
        | "linkedin",
        string
      >
    >,
  });

  return {
    success: result.successCount > 0,
    results: result.results.map((r) => ({
      platform: r.platform,
      success: r.success,
      postId: r.postId,
      postUrl: r.postUrl,
      error: r.error,
    })),
    summary: {
      totalPlatforms: result.totalPlatforms,
      successCount: result.successCount,
      failureCount: result.failureCount,
    },
  };
}

/**
 * Post to a single social media platform
 */
export async function executeSkillSocialMediaPostToPlatform(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}> {
  const { socialMediaService } = await import("@/lib/services/social-media");

  const text = (dataContent.text as string) || textContent;
  const platform = dataContent.platform as string;
  const media = dataContent.media as
    | Array<{
        type: "image" | "video" | "gif";
        url?: string;
        mimeType: string;
        altText?: string;
      }>
    | undefined;
  const link = dataContent.link as string | undefined;
  const platformOptions = dataContent.platformOptions as
    | Record<string, unknown>
    | undefined;
  const credentialId = dataContent.credentialId as string | undefined;

  if (!text) throw new Error("Text content required");
  if (!platform) throw new Error("Platform required");

  const result = await socialMediaService.createPost({
    organizationId: ctx.user.organization_id,
    userId: ctx.user.id,
    content: { text, media, link },
    platforms: [
      platform as
        | "twitter"
        | "bluesky"
        | "discord"
        | "telegram"
        | "reddit"
        | "facebook"
        | "instagram"
        | "tiktok"
        | "linkedin",
    ],
    platformOptions,
    credentialIds: credentialId ? { [platform]: credentialId } : undefined,
  });

  return result.results[0];
}

/**
 * Delete a social media post
 */
export async function executeSkillSocialMediaDeletePost(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean; error?: string }> {
  const { socialMediaService } = await import("@/lib/services/social-media");

  const platform = dataContent.platform as string;
  const postId = dataContent.postId as string;
  const credentialId = dataContent.credentialId as string | undefined;

  if (!platform) throw new Error("Platform required");
  if (!postId) throw new Error("Post ID required");

  return socialMediaService.deletePost(
    ctx.user.organization_id,
    platform as
      | "twitter"
      | "bluesky"
      | "discord"
      | "telegram"
      | "reddit"
      | "facebook"
      | "instagram"
      | "tiktok"
      | "linkedin",
    postId,
    credentialId,
  );
}

/**
 * Reply to a social media post
 */
export async function executeSkillSocialMediaReply(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}> {
  const { socialMediaService } = await import("@/lib/services/social-media");

  const text = (dataContent.text as string) || textContent;
  const platform = dataContent.platform as string;
  const postId = dataContent.postId as string;
  const platformOptions = dataContent.platformOptions as
    | Record<string, unknown>
    | undefined;
  const credentialId = dataContent.credentialId as string | undefined;

  if (!text) throw new Error("Reply text required");
  if (!platform) throw new Error("Platform required");
  if (!postId) throw new Error("Post ID required");

  return socialMediaService.replyToPost(
    ctx.user.organization_id,
    platform as
      | "twitter"
      | "bluesky"
      | "discord"
      | "telegram"
      | "reddit"
      | "facebook"
      | "instagram"
      | "tiktok"
      | "linkedin",
    postId,
    { text },
    platformOptions,
    credentialId,
  );
}

/**
 * Like a social media post
 */
export async function executeSkillSocialMediaLike(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean; error?: string }> {
  const { socialMediaService } = await import("@/lib/services/social-media");

  const platform = dataContent.platform as string;
  const postId = dataContent.postId as string;
  const credentialId = dataContent.credentialId as string | undefined;

  if (!platform) throw new Error("Platform required");
  if (!postId) throw new Error("Post ID required");

  return socialMediaService.likePost(
    ctx.user.organization_id,
    platform as
      | "twitter"
      | "bluesky"
      | "discord"
      | "telegram"
      | "reddit"
      | "facebook"
      | "instagram"
      | "tiktok"
      | "linkedin",
    postId,
    credentialId,
  );
}

/**
 * Repost/retweet a social media post
 */
export async function executeSkillSocialMediaRepost(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  platform: string;
  success: boolean;
  postId?: string;
  error?: string;
}> {
  const { socialMediaService } = await import("@/lib/services/social-media");

  const platform = dataContent.platform as string;
  const postId = dataContent.postId as string;
  const credentialId = dataContent.credentialId as string | undefined;

  if (!platform) throw new Error("Platform required");
  if (!postId) throw new Error("Post ID required");

  return socialMediaService.repost(
    ctx.user.organization_id,
    platform as
      | "twitter"
      | "bluesky"
      | "discord"
      | "telegram"
      | "reddit"
      | "facebook"
      | "instagram"
      | "tiktok"
      | "linkedin",
    postId,
    credentialId,
  );
}

/**
 * Get analytics for a social media post
 */
export async function executeSkillSocialMediaGetPostAnalytics(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<SocialMediaAnalyticsResult> {
  const { socialMediaService } = await import("@/lib/services/social-media");

  const platform = dataContent.platform as string;
  const postId = dataContent.postId as string;
  const credentialId = dataContent.credentialId as string | undefined;

  if (!platform) throw new Error("Platform required");
  if (!postId) throw new Error("Post ID required");

  const analytics = await socialMediaService.getPostAnalytics({
    organizationId: ctx.user.organization_id,
    platform: platform as
      | "twitter"
      | "bluesky"
      | "discord"
      | "telegram"
      | "reddit"
      | "facebook"
      | "instagram"
      | "tiktok"
      | "linkedin",
    postId,
    credentialId,
  });

  return {
    analytics: analytics
      ? {
          platform: analytics.platform,
          postId: analytics.postId,
          metrics: analytics.metrics as Record<string, number | undefined>,
          fetchedAt: analytics.fetchedAt.toISOString(),
        }
      : null,
  };
}

/**
 * Get account-level analytics for a social media platform
 */
export async function executeSkillSocialMediaGetAccountAnalytics(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<SocialMediaAnalyticsResult> {
  const { socialMediaService } = await import("@/lib/services/social-media");

  const platform = dataContent.platform as string;
  const credentialId = dataContent.credentialId as string | undefined;

  if (!platform) throw new Error("Platform required");

  const analytics = await socialMediaService.getAccountAnalytics({
    organizationId: ctx.user.organization_id,
    platform: platform as
      | "twitter"
      | "bluesky"
      | "discord"
      | "telegram"
      | "reddit"
      | "facebook"
      | "instagram"
      | "tiktok"
      | "linkedin",
    credentialId,
  });

  return {
    analytics: analytics
      ? {
          platform: analytics.platform,
          accountId: analytics.accountId,
          metrics: analytics.metrics as Record<string, number | undefined>,
          fetchedAt: analytics.fetchedAt.toISOString(),
        }
      : null,
  };
}

/**
 * Get supported social media platforms
 */
export async function executeSkillSocialMediaGetPlatforms(): Promise<{
  platforms: string[];
  count: number;
}> {
  const { socialMediaService } = await import("@/lib/services/social-media");

  const platforms = socialMediaService.getSupportedPlatforms();

  return {
    platforms,
    count: platforms.length,
  };
}

/**
 * Store social media credentials
 */
export async function executeSkillSocialMediaStoreCredentials(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean; platform: string }> {
  const { socialMediaService } = await import("@/lib/services/social-media");

  const platform = dataContent.platform as string;
  const credentials = dataContent.credentials as Record<string, string>;

  if (!platform) throw new Error("Platform required");
  if (!credentials || Object.keys(credentials).length === 0) {
    throw new Error("Credentials required");
  }

  await socialMediaService.storeCredentials(
    ctx.user.organization_id,
    ctx.user.id,
    platform as
      | "twitter"
      | "bluesky"
      | "discord"
      | "telegram"
      | "reddit"
      | "facebook"
      | "instagram"
      | "tiktok"
      | "linkedin",
    credentials,
  );

  return { success: true, platform };
}

/**
 * Validate social media credentials
 */
export async function executeSkillSocialMediaValidateCredentials(
  _textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  valid: boolean;
  accountId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  error?: string;
}> {
  const { socialMediaService } = await import("@/lib/services/social-media");

  const platform = dataContent.platform as string;
  const credentialId = dataContent.credentialId as string | undefined;

  if (!platform) throw new Error("Platform required");

  return socialMediaService.validateCredentials(
    ctx.user.organization_id,
    platform as
      | "twitter"
      | "bluesky"
      | "discord"
      | "telegram"
      | "reddit"
      | "facebook"
      | "instagram"
      | "tiktok"
      | "linkedin",
    credentialId,
  );
}

// ADVERTISING SKILLS

/**
 * List advertising accounts
 */
export async function executeSkillAdsListAccounts(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  accounts: Array<{
    id: string;
    platform: string;
    accountName: string;
    status: string;
  }>;
  count: number;
}> {
  const { advertisingService } = await import("@/lib/services/advertising");

  const platform = dataContent.platform as string | undefined;
  const accounts = await advertisingService.listAccounts(
    ctx.user.organization_id,
    platform
      ? { platform: platform as "meta" | "google" | "tiktok" }
      : undefined,
  );

  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      accountName: a.account_name,
      status: a.status,
    })),
    count: accounts.length,
  };
}

/**
 * List advertising campaigns
 */
export async function executeSkillAdsListCampaigns(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  campaigns: Array<{
    id: string;
    name: string;
    platform: string;
    status: string;
    budgetAmount: string;
    totalSpend: string;
    totalImpressions: number;
    totalClicks: number;
  }>;
  count: number;
}> {
  const { advertisingService } = await import("@/lib/services/advertising");

  const campaigns = await advertisingService.listCampaigns(
    ctx.user.organization_id,
    {
      adAccountId: dataContent.adAccountId as string | undefined,
      platform: dataContent.platform as
        | "meta"
        | "google"
        | "tiktok"
        | undefined,
      status: dataContent.status as string | undefined,
      appId: dataContent.appId as string | undefined,
    },
  );

  return {
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      status: c.status,
      budgetAmount: c.budget_amount,
      totalSpend: c.total_spend,
      totalImpressions: c.total_impressions,
      totalClicks: c.total_clicks,
    })),
    count: campaigns.length,
  };
}

/**
 * Create advertising campaign
 */
export async function executeSkillAdsCreateCampaign(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  success: boolean;
  campaign: {
    id: string;
    name: string;
    status: string;
    creditsAllocated: string;
  };
}> {
  const { advertisingService } = await import("@/lib/services/advertising");

  const name = (dataContent.name as string) || textContent;
  if (!name) throw new Error("Campaign name required");

  const adAccountId = dataContent.adAccountId as string;
  if (!adAccountId) throw new Error("Ad account ID required");

  const objective = dataContent.objective as string;
  if (!objective) throw new Error("Objective required");

  const budgetType = dataContent.budgetType as "daily" | "lifetime";
  if (!budgetType) throw new Error("Budget type required");

  const budgetAmount = dataContent.budgetAmount as number;
  if (!budgetAmount) throw new Error("Budget amount required");

  const campaign = await advertisingService.createCampaign({
    organizationId: ctx.user.organization_id,
    adAccountId,
    name,
    objective: objective as
      | "awareness"
      | "traffic"
      | "engagement"
      | "leads"
      | "app_promotion"
      | "sales"
      | "conversions",
    budgetType,
    budgetAmount,
    budgetCurrency: dataContent.budgetCurrency as string | undefined,
    startDate: dataContent.startDate
      ? new Date(dataContent.startDate as string)
      : undefined,
    endDate: dataContent.endDate
      ? new Date(dataContent.endDate as string)
      : undefined,
    targeting: dataContent.targeting as Record<string, unknown> | undefined,
    appId: dataContent.appId as string | undefined,
  });

  return {
    success: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      creditsAllocated: campaign.credits_allocated,
    },
  };
}

/**
 * Start advertising campaign
 */
export async function executeSkillAdsStartCampaign(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean; campaignId: string; status: string }> {
  const { advertisingService } = await import("@/lib/services/advertising");

  const campaignId = dataContent.campaignId as string;
  if (!campaignId) throw new Error("Campaign ID required");

  const campaign = await advertisingService.startCampaign(
    campaignId,
    ctx.user.organization_id,
  );

  return {
    success: true,
    campaignId: campaign.id,
    status: campaign.status,
  };
}

/**
 * Pause advertising campaign
 */
export async function executeSkillAdsPauseCampaign(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean; campaignId: string; status: string }> {
  const { advertisingService } = await import("@/lib/services/advertising");

  const campaignId = dataContent.campaignId as string;
  if (!campaignId) throw new Error("Campaign ID required");

  const campaign = await advertisingService.pauseCampaign(
    campaignId,
    ctx.user.organization_id,
  );

  return {
    success: true,
    campaignId: campaign.id,
    status: campaign.status,
  };
}

/**
 * Delete advertising campaign
 */
export async function executeSkillAdsDeleteCampaign(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean }> {
  const { advertisingService } = await import("@/lib/services/advertising");

  const campaignId = dataContent.campaignId as string;
  if (!campaignId) throw new Error("Campaign ID required");

  await advertisingService.deleteCampaign(campaignId, ctx.user.organization_id);

  return { success: true };
}

/**
 * Get advertising campaign analytics
 */
export async function executeSkillAdsGetCampaignAnalytics(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  campaignId: string;
  metrics: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr?: number;
    cpc?: number;
    cpm?: number;
  };
}> {
  const { advertisingService } = await import("@/lib/services/advertising");

  const campaignId = dataContent.campaignId as string;
  if (!campaignId) throw new Error("Campaign ID required");

  const dateRange =
    dataContent.startDate && dataContent.endDate
      ? {
          start: new Date(dataContent.startDate as string),
          end: new Date(dataContent.endDate as string),
        }
      : undefined;

  const metrics = await advertisingService.getCampaignMetrics(
    campaignId,
    ctx.user.organization_id,
    dateRange,
  );

  return { campaignId, metrics };
}

/**
 * Get advertising statistics
 */
export async function executeSkillAdsGetStats(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  totalCampaigns: number;
  activeCampaigns: number;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
}> {
  const { advertisingService } = await import("@/lib/services/advertising");

  return advertisingService.getStats(ctx.user.organization_id, {
    platform: dataContent.platform as "meta" | "google" | "tiktok" | undefined,
  });
}

/**
 * Create ad creative
 */
export async function executeSkillAdsCreateCreative(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  success: boolean;
  creative: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
}> {
  const { advertisingService } = await import("@/lib/services/advertising");

  const campaignId = dataContent.campaignId as string;
  if (!campaignId) throw new Error("Campaign ID required");

  const name = (dataContent.name as string) || textContent;
  if (!name) throw new Error("Creative name required");

  const type = dataContent.type as "image" | "video" | "carousel";
  if (!type) throw new Error("Creative type required");

  const media = dataContent.media as Array<{
    id: string;
    source: "generation" | "upload";
    url: string;
    type: "image" | "video";
    order: number;
  }>;
  if (!media?.length) throw new Error("Media required");

  const creative = await advertisingService.createCreative(
    ctx.user.organization_id,
    {
      campaignId,
      name,
      type,
      headline: dataContent.headline as string | undefined,
      primaryText: dataContent.primaryText as string | undefined,
      description: dataContent.description as string | undefined,
      callToAction: dataContent.callToAction as
        | "learn_more"
        | "shop_now"
        | "sign_up"
        | "download"
        | "contact_us"
        | "get_offer"
        | "book_now"
        | "watch_more"
        | "apply_now"
        | "subscribe"
        | undefined,
      destinationUrl: dataContent.destinationUrl as string | undefined,
      media,
    },
  );

  return {
    success: true,
    creative: {
      id: creative.id,
      name: creative.name,
      type: creative.type,
      status: creative.status,
    },
  };
}

// SEO SKILLS

/**
 * Create an SEO request (DataForSEO / SerpApi / Claude / IndexNow)
 */
export async function executeSkillSeoCreateRequest(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  id: string;
  status: string;
  artifacts: Array<{ id: string; type: string }>;
}> {
  const { seoService } = await import("@/lib/services/seo");

  const type = dataContent.type as string;
  if (
    !type ||
    !seoRequestTypeEnum.enumValues.includes(
      type as (typeof seoRequestTypeEnum.enumValues)[number],
    )
  ) {
    throw new Error("Valid SEO request type is required");
  }

  const keywords =
    (dataContent.keywords as string[] | undefined) ||
    (textContent ? [textContent] : undefined);

  const result = await seoService.createRequest({
    organizationId: ctx.user.organization_id,
    userId: ctx.user.id,
    apiKeyId: ctx.apiKeyId || undefined,
    appId: dataContent.appId as string | undefined,
    type: type as (typeof seoRequestTypeEnum.enumValues)[number],
    pageUrl: dataContent.pageUrl as string | undefined,
    keywords,
    locale: (dataContent.locale as string | undefined) || "en-US",
    searchEngine: (dataContent.searchEngine as string | undefined) || "google",
    device: (dataContent.device as string | undefined) || "desktop",
    environment:
      (dataContent.environment as string | undefined) || "production",
    agentIdentifier: dataContent.agentIdentifier as string | undefined,
    promptContext: dataContent.promptContext as string | undefined,
    idempotencyKey: dataContent.idempotencyKey as string | undefined,
    locationCode: dataContent.locationCode as number | undefined,
    query: dataContent.query as string | undefined,
  });

  return {
    id: result.request.id,
    status: result.request.status,
    artifacts: result.artifacts.map((a) => ({ id: a.id, type: a.type })),
  };
}

/**
 * Get SEO request status and artifacts
 */
export async function executeSkillSeoGetRequest(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  request: {
    id: string;
    status: string;
    type: string;
    pageUrl: string | null;
  };
  artifacts: Array<{ id: string; type: string; provider: string }>;
  providerCalls: Array<{
    id: string;
    provider: string;
    status: string;
    operation: string;
  }>;
}> {
  const {
    seoRequestsRepository,
    seoArtifactsRepository,
    seoProviderCallsRepository,
  } = await import("@/db/repositories");

  const requestId = dataContent.requestId as string;
  if (!requestId) throw new Error("requestId required");

  const request = await seoRequestsRepository.findById(requestId);
  if (!request || request.organization_id !== ctx.user.organization_id) {
    throw new Error("SEO request not found");
  }

  const [artifacts, providerCalls] = await Promise.all([
    seoArtifactsRepository.listByRequest(request.id),
    seoProviderCallsRepository.listByRequest(request.id),
  ]);

  return {
    request: {
      id: request.id,
      status: request.status,
      type: request.type,
      pageUrl: request.page_url,
    },
    artifacts: artifacts.map((a) => ({
      id: a.id,
      type: a.type,
      provider: a.provider,
    })),
    providerCalls: providerCalls.map((call) => ({
      id: call.id,
      provider: call.provider,
      status: call.status,
      operation: call.operation,
    })),
  };
}

// MEDIA COLLECTIONS SKILLS

/**
 * List media collections
 */
export async function executeSkillCollectionsList(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  collections: Array<{
    id: string;
    name: string;
    description: string | null;
    itemCount: number;
  }>;
  count: number;
}> {
  const { mediaCollectionsService } =
    await import("@/lib/services/media-collections");

  const collections = await mediaCollectionsService.listByOrganization(
    ctx.user.organization_id,
    {
      userId: ctx.user.id,
      limit: (dataContent.limit as number) || 50,
      offset: dataContent.offset as number | undefined,
    },
  );

  return {
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      itemCount: c.item_count,
    })),
    count: collections.length,
  };
}

/**
 * Create media collection
 */
export async function executeSkillCollectionsCreate(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  success: boolean;
  collection: { id: string; name: string };
}> {
  const { mediaCollectionsService } =
    await import("@/lib/services/media-collections");

  const name = (dataContent.name as string) || textContent;
  if (!name) throw new Error("Collection name required");

  const collection = await mediaCollectionsService.create({
    organizationId: ctx.user.organization_id,
    userId: ctx.user.id,
    name,
    description: dataContent.description as string | undefined,
    purpose: dataContent.purpose as
      | "advertising"
      | "app_assets"
      | "general"
      | undefined,
    tags: dataContent.tags as string[] | undefined,
  });

  return {
    success: true,
    collection: { id: collection.id, name: collection.name },
  };
}

/**
 * Get media collection with items
 */
export async function executeSkillCollectionsGet(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  items: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    url: string;
    type: string;
  }>;
} | null> {
  const { mediaCollectionsService } =
    await import("@/lib/services/media-collections");

  const collectionId = dataContent.collectionId as string;
  if (!collectionId) throw new Error("Collection ID required");

  const isOwner = await mediaCollectionsService.validateOwnership(
    collectionId,
    ctx.user.organization_id,
  );
  if (!isOwner) return null;

  const collection =
    await mediaCollectionsService.getByIdWithItems(collectionId);
  if (!collection) return null;

  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    itemCount: collection.item_count,
    items: collection.items.map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      url: item.url,
      type: item.type,
    })),
  };
}

/**
 * Add items to collection
 */
export async function executeSkillCollectionsAddItems(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean; added: number }> {
  const { mediaCollectionsService } =
    await import("@/lib/services/media-collections");

  const collectionId = dataContent.collectionId as string;
  if (!collectionId) throw new Error("Collection ID required");

  const items = dataContent.items as Array<{
    sourceType: "generation" | "upload";
    sourceId: string;
  }>;
  if (!items?.length) throw new Error("Items required");

  const isOwner = await mediaCollectionsService.validateOwnership(
    collectionId,
    ctx.user.organization_id,
  );
  if (!isOwner) throw new Error("Collection not found");

  const added = await mediaCollectionsService.addItems(collectionId, items);

  return { success: true, added };
}

/**
 * Remove items from collection
 */
export async function executeSkillCollectionsRemoveItems(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean }> {
  const { mediaCollectionsService } =
    await import("@/lib/services/media-collections");

  const collectionId = dataContent.collectionId as string;
  if (!collectionId) throw new Error("Collection ID required");

  const itemIds = dataContent.itemIds as string[];
  if (!itemIds?.length) throw new Error("Item IDs required");

  const isOwner = await mediaCollectionsService.validateOwnership(
    collectionId,
    ctx.user.organization_id,
  );
  if (!isOwner) throw new Error("Collection not found");

  await mediaCollectionsService.removeItems(collectionId, itemIds);

  return { success: true };
}

// Discord Gateway Skills

/**
 * List Discord bot connections
 */
export async function executeSkillDiscordGatewayListConnections(
  _dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  connections: Array<{
    id: string;
    botUsername: string | null;
    status: string;
    guildCount: number;
  }>;
}> {
  const { discordGatewayService } =
    await import("@/lib/services/discord-gateway");

  const botStatuses = await discordGatewayService.getBotStatus(
    ctx.user.organization_id,
  );

  return {
    connections: botStatuses.map((s) => ({
      id: s.connectionId,
      botUsername: s.botUsername,
      status: s.status,
      guildCount: s.guildCount,
    })),
  };
}

/**
 * List Discord event routes
 */
export async function executeSkillDiscordGatewayListRoutes(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  routes: Array<{
    id: string;
    guildId: string;
    eventType: string;
    routeType: string;
    routeTarget: string;
    enabled: boolean;
  }>;
}> {
  const { discordEventRouter } = await import("@/lib/services/discord-gateway");

  let routes = await discordEventRouter.getRoutes(ctx.user.organization_id);

  const guildId = dataContent.guildId as string | undefined;
  if (guildId) {
    routes = routes.filter((r) => r.guild_id === guildId);
  }

  return {
    routes: routes.map((r) => ({
      id: r.id,
      guildId: r.guild_id,
      eventType: r.event_type,
      routeType: r.route_type,
      routeTarget: r.route_target,
      enabled: r.enabled,
    })),
  };
}

/**
 * Create Discord event route
 */
export async function executeSkillDiscordGatewayCreateRoute(
  _taskId: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  id: string;
  guildId: string;
  eventType: string;
  routeType: string;
  enabled: boolean;
}> {
  const { discordEventRouter } = await import("@/lib/services/discord-gateway");

  const platformConnectionId = dataContent.platformConnectionId as string;
  if (!platformConnectionId) throw new Error("Platform connection ID required");

  const guildId = dataContent.guildId as string;
  if (!guildId) throw new Error("Guild ID required");

  const eventType = dataContent.eventType as string;
  if (!eventType) throw new Error("Event type required");

  const routeType = dataContent.routeType as string;
  if (!routeType) throw new Error("Route type required");

  const routeTarget = dataContent.routeTarget as string;
  if (!routeTarget) throw new Error("Route target required");

  const route = await discordEventRouter.createRoute({
    organization_id: ctx.user.organization_id,
    platform_connection_id: platformConnectionId,
    guild_id: guildId,
    channel_id: dataContent.channelId as string | undefined,
    event_type: eventType as "MESSAGE_CREATE",
    route_type: routeType as "a2a",
    route_target: routeTarget,
    mention_only: (dataContent.mentionOnly as boolean) ?? false,
    command_prefix: dataContent.commandPrefix as string | undefined,
  });

  return {
    id: route.id,
    guildId: route.guild_id,
    eventType: route.event_type,
    routeType: route.route_type,
    enabled: route.enabled,
  };
}

/**
 * Update Discord event route
 */
export async function executeSkillDiscordGatewayUpdateRoute(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ id: string; enabled: boolean; updatedAt: string }> {
  const { discordEventRouter } = await import("@/lib/services/discord-gateway");

  const routeId = dataContent.routeId as string;
  if (!routeId) throw new Error("Route ID required");

  // Verify ownership
  const routes = await discordEventRouter.getRoutes(ctx.user.organization_id);
  const route = routes.find((r) => r.id === routeId);
  if (!route) throw new Error("Route not found");

  const updated = await discordEventRouter.updateRoute(routeId, {
    enabled: dataContent.enabled as boolean | undefined,
    mention_only: dataContent.mentionOnly as boolean | undefined,
    command_prefix: dataContent.commandPrefix as string | undefined,
    priority: dataContent.priority as number | undefined,
  });

  if (!updated) throw new Error("Failed to update route");

  return {
    id: updated.id,
    enabled: updated.enabled,
    updatedAt: updated.updated_at.toISOString(),
  };
}

/**
 * Delete Discord event route
 */
export async function executeSkillDiscordGatewayDeleteRoute(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean }> {
  const { discordEventRouter } = await import("@/lib/services/discord-gateway");

  const routeId = dataContent.routeId as string;
  if (!routeId) throw new Error("Route ID required");

  // Verify ownership
  const routes = await discordEventRouter.getRoutes(ctx.user.organization_id);
  const route = routes.find((r) => r.id === routeId);
  if (!route) throw new Error("Route not found");

  const deleted = await discordEventRouter.deleteRoute(routeId);
  if (!deleted) throw new Error("Failed to delete route");

  return { success: true };
}

/**
 * Get Discord gateway stats
 */
export async function executeSkillDiscordGatewayGetStats(
  _dataContent: Record<string, unknown>,
  _ctx: A2AContext,
): Promise<{
  connections: {
    totalBots: number;
    connectedBots: number;
    disconnectedBots: number;
    totalGuilds: number;
  };
  queue: {
    pending: number;
    processing: number;
    deadLetter: number;
  };
}> {
  const { discordGatewayService } =
    await import("@/lib/services/discord-gateway");

  const health = await discordGatewayService.getHealth();

  return {
    connections: {
      totalBots: health.totalBots,
      connectedBots: health.connectedBots,
      disconnectedBots: health.disconnectedBots,
      totalGuilds: health.totalGuilds,
    },
    queue: {
      pending: health.queueStats.pending,
      processing: health.queueStats.processing,
      deadLetter: health.queueStats.deadLetter,
    },
  };
}

/**
 * Create a feed configuration to monitor social accounts
 */
export async function executeSkillCreateFeedConfig(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  success: boolean;
  configId: string;
  sourcePlatform: string;
  sourceAccountId: string;
}> {
  const { feedConfigService } = await import("@/lib/services/social-feed");

  const sourcePlatform = dataContent.sourcePlatform as string;
  const sourceAccountId = dataContent.sourceAccountId as string;

  if (!sourcePlatform) throw new Error("sourcePlatform is required");
  if (!sourceAccountId) throw new Error("sourceAccountId is required");

  const notificationChannels =
    (dataContent.notificationChannels as Array<{
      platform: string;
      channelId: string;
      serverId?: string;
    }>) || [];

  const config = await feedConfigService.create({
    organizationId: ctx.user.organization_id,
    sourcePlatform,
    sourceAccountId,
    sourceUsername: dataContent.sourceUsername as string | undefined,
    monitorMentions: dataContent.monitorMentions as boolean | undefined,
    monitorReplies: dataContent.monitorReplies as boolean | undefined,
    monitorQuoteTweets: dataContent.monitorQuoteTweets as boolean | undefined,
    notificationChannels: notificationChannels.map((c) => ({
      platform: c.platform as "discord" | "telegram" | "slack",
      channelId: c.channelId,
      serverId: c.serverId,
    })),
    pollingIntervalSeconds: dataContent.pollingIntervalSeconds as
      | number
      | undefined,
    minFollowerCount: dataContent.minFollowerCount as number | undefined,
    createdBy: ctx.user.id,
  });

  return {
    success: true,
    configId: config.id,
    sourcePlatform: config.source_platform,
    sourceAccountId: config.source_account_id,
  };
}

/**
 * List feed configurations
 */
export async function executeSkillListFeedConfigs(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  configs: Array<{
    id: string;
    sourcePlatform: string;
    sourceAccountId: string;
    enabled: boolean;
    lastPolledAt: string | null;
  }>;
  total: number;
}> {
  const { feedConfigService } = await import("@/lib/services/social-feed");

  const { configs, total } = await feedConfigService.list({
    organizationId: ctx.user.organization_id,
    sourcePlatform: dataContent.sourcePlatform as string | undefined,
    enabled: dataContent.enabled as boolean | undefined,
    limit: (dataContent.limit as number) || 50,
  });

  return {
    configs: configs.map((c) => ({
      id: c.id,
      sourcePlatform: c.source_platform,
      sourceAccountId: c.source_account_id,
      enabled: c.enabled,
      lastPolledAt: c.last_polled_at?.toISOString() ?? null,
    })),
    total,
  };
}

/**
 * List engagement events from monitored feeds
 */
export async function executeSkillListEngagements(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  engagements: Array<{
    id: string;
    eventType: string;
    sourcePlatform: string;
    authorUsername: string | null;
    content: string | null;
    sourcePostUrl: string | null;
    createdAt: string;
  }>;
  total: number;
}> {
  const { engagementEventService } = await import("@/lib/services/social-feed");

  const { events, total } = await engagementEventService.list({
    organizationId: ctx.user.organization_id,
    feedConfigId: dataContent.feedConfigId as string | undefined,
    eventType: dataContent.eventType as
      | "mention"
      | "reply"
      | "quote_tweet"
      | undefined,
    since: dataContent.since
      ? new Date(dataContent.since as string)
      : undefined,
    limit: (dataContent.limit as number) || 50,
  });

  return {
    engagements: events.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      sourcePlatform: e.source_platform,
      authorUsername: e.author_username,
      content: e.content?.slice(0, 500) ?? null,
      sourcePostUrl: e.source_post_url,
      createdAt: e.created_at.toISOString(),
    })),
    total,
  };
}

/**
 * List pending reply confirmations
 */
export async function executeSkillListPendingReplies(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  pendingReplies: Array<{
    id: string;
    targetPlatform: string;
    replyContent: string;
    sourceUsername: string | null;
    status: string;
    expiresAt: string;
  }>;
  total: number;
}> {
  const { replyConfirmationService } =
    await import("@/lib/services/social-feed");

  const status = dataContent.status as
    | "pending"
    | "confirmed"
    | "rejected"
    | undefined;
  const { confirmations, total } = await replyConfirmationService.list({
    organizationId: ctx.user.organization_id,
    status: status || "pending",
    limit: (dataContent.limit as number) || 20,
  });

  return {
    pendingReplies: confirmations.map((c) => ({
      id: c.id,
      targetPlatform: c.target_platform,
      replyContent: c.reply_content,
      sourceUsername: c.source_username,
      status: c.status,
      expiresAt: c.expires_at.toISOString(),
    })),
    total,
  };
}

/**
 * Confirm and send a pending reply
 */
export async function executeSkillConfirmReply(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}> {
  const { replyRouterService } =
    await import("@/lib/services/social-feed/reply-router");

  const confirmationId = dataContent.confirmationId as string;
  if (!confirmationId) throw new Error("confirmationId is required");

  const result = await replyRouterService.handleConfirmation(
    confirmationId,
    ctx.user.organization_id,
    ctx.user.id,
    ctx.user.email || "Agent",
  );

  return {
    success: result.success,
    postId: result.postId,
    postUrl: result.postUrl,
    error: result.error,
  };
}

/**
 * Reject a pending reply
 */
export async function executeSkillRejectReply(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean }> {
  const { replyRouterService } =
    await import("@/lib/services/social-feed/reply-router");

  const confirmationId = dataContent.confirmationId as string;
  if (!confirmationId) throw new Error("confirmationId is required");

  await replyRouterService.handleRejection(
    confirmationId,
    ctx.user.organization_id,
    ctx.user.id,
    dataContent.reason as string | undefined,
  );

  return { success: true };
}

/**
 * Poll feeds for new engagements
 */
export async function executeSkillPollFeeds(
  _dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  feedsPolled: number;
  newEngagements: number;
  errors: string[];
}> {
  const { feedConfigService } = await import("@/lib/services/social-feed");
  const { feedPollingService } =
    await import("@/lib/services/social-feed/polling");

  const { configs } = await feedConfigService.list({
    organizationId: ctx.user.organization_id,
    enabled: true,
    limit: 10,
  });

  let totalNew = 0;
  const errors: string[] = [];

  for (const config of configs) {
    const result = await feedPollingService.pollFeed(config);
    totalNew += result.newEngagements;
    errors.push(...result.errors);
  }

  return {
    feedsPolled: configs.length,
    newEngagements: totalNew,
    errors,
  };
}

/**
 * Process unnotified engagement events
 */
export async function executeSkillProcessNotifications(
  _dataContent: Record<string, unknown>,
  _ctx: A2AContext,
): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  const { socialNotificationService } =
    await import("@/lib/services/social-feed/notifications");

  return socialNotificationService.processUnnotifiedEvents();
}

// ============================================================================
// SECRETS SKILLS
// ============================================================================

export interface SecretMetadataResult {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  projectId: string | null;
  projectType: string | null;
  environment: string | null;
  provider: string | null;
  version: number;
  createdAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
}

export interface SecretsListResult {
  secrets: SecretMetadataResult[];
  total: number;
}

export interface SecretValueResult {
  name: string;
  value: string;
}

export interface SecretCreateResult {
  id: string;
  name: string;
}

const a2aAudit = (ctx: A2AContext) => ({
  actorType: "api_key" as const,
  actorId: ctx.apiKeyId || ctx.user.id,
  source: "a2a",
});

/**
 * List secrets (metadata only, no values)
 */
export async function executeSkillSecretsList(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<SecretsListResult> {
  const { secretsService } = await import("@/lib/services/secrets");
  const { SecretProvider, SecretProjectType, SecretEnvironment } =
    await import("@/db/schemas/secrets");

  const result = await secretsService.listFiltered({
    organizationId: ctx.user.organization_id,
    projectId: dataContent.projectId as string | undefined,
    projectType: dataContent.projectType as
      | typeof SecretProjectType.$type
      | undefined,
    environment: dataContent.environment as
      | typeof SecretEnvironment.$type
      | undefined,
    provider: dataContent.provider as typeof SecretProvider.$type | undefined,
    limit: Math.min((dataContent.limit as number) || 100, 500),
    offset: (dataContent.offset as number) || 0,
  });

  return {
    secrets: result.secrets.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      scope: s.scope,
      projectId: s.projectId,
      projectType: s.projectType,
      environment: s.environment,
      provider: s.provider,
      version: s.version,
      createdAt: s.createdAt.toISOString(),
      lastAccessedAt: s.lastAccessedAt?.toISOString() ?? null,
      accessCount: s.accessCount,
    })),
    total: result.total,
  };
}

/**
 * Get a secret value by name
 */
export async function executeSkillSecretsGet(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<SecretValueResult | null> {
  const { secretsService } = await import("@/lib/services/secrets");
  const { SecretEnvironment } = await import("@/db/schemas/secrets");

  const name = dataContent.name as string;
  if (!name) throw new Error("name is required");

  const value = await secretsService.get(
    ctx.user.organization_id,
    name,
    dataContent.projectId as string | undefined,
    dataContent.environment as typeof SecretEnvironment.$type | undefined,
    a2aAudit(ctx),
  );

  return value ? { name, value } : null;
}

/**
 * Get multiple secrets by names
 */
export async function executeSkillSecretsGetBulk(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<Record<string, string>> {
  const { secretsService } = await import("@/lib/services/secrets");
  const { SecretEnvironment, SecretProjectType } =
    await import("@/db/schemas/secrets");

  const names = dataContent.names as string[];
  if (!names || !Array.isArray(names) || names.length === 0) {
    throw new Error("names array is required");
  }

  return secretsService.getDecrypted(
    {
      organizationId: ctx.user.organization_id,
      projectId: dataContent.projectId as string | undefined,
      projectType: dataContent.projectType as
        | typeof SecretProjectType.$type
        | undefined,
      environment: dataContent.environment as
        | typeof SecretEnvironment.$type
        | undefined,
      names,
      includeBindings: (dataContent.includeBindings as boolean) ?? true,
    },
    a2aAudit(ctx),
  );
}

/**
 * Create a new secret
 */
export async function executeSkillSecretsCreate(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<SecretCreateResult> {
  const { secretsService } = await import("@/lib/services/secrets");
  const { SecretProvider, SecretProjectType, SecretEnvironment } =
    await import("@/db/schemas/secrets");

  const name = dataContent.name as string;
  const value = dataContent.value as string;
  if (!name) throw new Error("name is required");
  if (!value) throw new Error("value is required");

  const secret = await secretsService.create(
    {
      organizationId: ctx.user.organization_id,
      name,
      value,
      description: dataContent.description as string | undefined,
      provider: dataContent.provider as typeof SecretProvider.$type | undefined,
      projectId: dataContent.projectId as string | undefined,
      projectType: dataContent.projectType as
        | typeof SecretProjectType.$type
        | undefined,
      environment: dataContent.environment as
        | typeof SecretEnvironment.$type
        | undefined,
      createdBy: ctx.user.id,
    },
    a2aAudit(ctx),
  );

  return { id: secret.id, name: secret.name };
}

/**
 * Update an existing secret
 */
export async function executeSkillSecretsUpdate(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<SecretMetadataResult> {
  const { secretsService } = await import("@/lib/services/secrets");

  const secretId = dataContent.secretId as string;
  if (!secretId) throw new Error("secretId is required");

  const updated = await secretsService.update(
    secretId,
    ctx.user.organization_id,
    {
      value: dataContent.value as string | undefined,
      description: dataContent.description as string | undefined,
    },
    a2aAudit(ctx),
  );

  return {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    scope: updated.scope,
    projectId: updated.projectId,
    projectType: updated.projectType,
    environment: updated.environment,
    provider: updated.provider,
    version: updated.version,
    createdAt: updated.createdAt.toISOString(),
    lastAccessedAt: updated.lastAccessedAt?.toISOString() ?? null,
    accessCount: updated.accessCount,
  };
}

/**
 * Delete a secret
 */
export async function executeSkillSecretsDelete(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean }> {
  const { secretsService } = await import("@/lib/services/secrets");

  const secretId = dataContent.secretId as string;
  if (!secretId) throw new Error("secretId is required");

  await secretsService.delete(
    secretId,
    ctx.user.organization_id,
    a2aAudit(ctx),
  );

  return { success: true };
}

/**
 * Bind a secret to a project
 */
export async function executeSkillSecretsBind(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ bindingId: string }> {
  const { secretsService } = await import("@/lib/services/secrets");
  const { SecretProjectType } = await import("@/db/schemas/secrets");

  const secretId = dataContent.secretId as string;
  const projectId = dataContent.projectId as string;
  const projectType = dataContent.projectType as typeof SecretProjectType.$type;

  if (!secretId) throw new Error("secretId is required");
  if (!projectId) throw new Error("projectId is required");
  if (!projectType) throw new Error("projectType is required");

  const binding = await secretsService.bindSecret(
    {
      secretId,
      projectId,
      projectType,
      createdBy: ctx.user.id,
    },
    a2aAudit(ctx),
  );

  return { bindingId: binding.id };
}

/**
 * Unbind a secret from a project
 */
export async function executeSkillSecretsUnbind(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean }> {
  const { secretsService } = await import("@/lib/services/secrets");

  const bindingId = dataContent.bindingId as string;
  if (!bindingId) throw new Error("bindingId is required");

  await secretsService.unbindSecret(
    bindingId,
    ctx.user.organization_id,
    a2aAudit(ctx),
  );

  return { success: true };
}

// ============================================
// Domain Management Skills
// ============================================

import type {
  DomainSearchResult,
  DomainCheckResult,
  DomainListResult,
  DomainRegisterResult,
  DomainVerifyResult,
  DomainAssignResult,
} from "./types";

/**
 * Search for available domains
 */
export async function executeSkillDomainsSearch(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<DomainSearchResult> {
  const { domainManagementService } =
    await import("@/lib/services/domain-management");

  const query = dataContent.query as string;
  if (!query) throw new Error("query is required");

  const tlds = dataContent.tlds as string[] | undefined;

  const results = await domainManagementService.searchDomains(query, tlds);

  return {
    query,
    results: results.map((r) => ({
      domain: r.domain,
      available: r.available,
      price: r.price
        ? {
            amount: r.price.price / 100,
            currency: r.price.currency,
            period: r.price.period,
          }
        : null,
    })),
    availableCount: results.filter((r) => r.available).length,
  };
}

/**
 * Check if a specific domain is available
 */
export async function executeSkillDomainsCheck(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<DomainCheckResult> {
  const { domainManagementService } =
    await import("@/lib/services/domain-management");
  const { domainModerationService } =
    await import("@/lib/services/domain-moderation");

  const domain = dataContent.domain as string;
  if (!domain) throw new Error("domain is required");

  const moderation = await domainModerationService.validateDomainName(domain);
  if (!moderation.allowed) {
    return {
      domain,
      available: false,
      price: null,
      moderationFlags: moderation.flags.map((f) => ({
        type: f.type,
        severity: f.severity,
        reason: f.reason,
      })),
      requiresReview: moderation.requiresReview,
    };
  }

  const result = await domainManagementService.checkAvailability(domain);

  return {
    domain: result.domain,
    available: result.available,
    price: result.price
      ? {
          amount: result.price.price / 100,
          currency: result.price.currency,
          period: result.price.period,
          renewalAmount: result.price.renewalPrice / 100,
        }
      : null,
    moderationFlags: moderation.flags.map((f) => ({
      type: f.type,
      severity: f.severity,
      reason: f.reason,
    })),
    requiresReview: moderation.requiresReview,
  };
}

/**
 * List domains for the organization
 */
export async function executeSkillDomainsList(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<DomainListResult> {
  const { domainManagementService } =
    await import("@/lib/services/domain-management");

  const filter =
    (dataContent.filter as "all" | "unassigned" | "assigned") || "all";

  let domains;
  if (filter === "unassigned") {
    domains = await domainManagementService.listUnassignedDomains(
      ctx.user.organization_id,
    );
  } else {
    domains = await domainManagementService.listDomains(
      ctx.user.organization_id,
    );
    if (filter === "assigned") {
      domains = domains.filter((d) => d.resourceType !== null);
    }
  }

  const stats = await domainManagementService.getStats(
    ctx.user.organization_id,
  );

  return {
    domains: domains.map((d) => ({
      id: d.id,
      domain: d.domain,
      status: d.status,
      verified: d.verified,
      resourceType: d.resourceType,
      resourceId: d.appId || d.containerId || d.agentId || d.mcpId || null,
      expiresAt: d.expiresAt?.toISOString() || null,
      sslStatus: d.sslStatus,
      isLive: d.isLive,
    })),
    stats,
  };
}

/**
 * Register an external domain
 */
export async function executeSkillDomainsRegister(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<DomainRegisterResult> {
  const { domainManagementService } =
    await import("@/lib/services/domain-management");

  const domain = dataContent.domain as string;
  if (!domain) throw new Error("domain is required");

  const nameserverMode =
    (dataContent.nameserverMode as "vercel" | "external") || "external";

  const deduction = await creditsService.deductCredits({
    organizationId: ctx.user.organization_id,
    amount: 1,
    description: `A2A: Register external domain ${domain}`,
    metadata: { skill: "domains_register", domain },
  });

  if (!deduction.success) throw new Error("Insufficient credits");

  const result = await domainManagementService.registerExternalDomain(
    domain,
    ctx.user.organization_id,
    nameserverMode,
  );

  if (!result.success) {
    throw new Error(result.error || "Failed to register domain");
  }

  return {
    success: true,
    domain: {
      id: result.domain!.id,
      domain: result.domain!.domain,
      status: result.domain!.status,
      verificationToken: result.domain!.verificationToken || undefined,
    },
    dnsInstructions: result.dnsInstructions,
    message: "Add the DNS records to verify ownership",
  };
}

/**
 * Verify domain ownership
 */
export async function executeSkillDomainsVerify(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<DomainVerifyResult> {
  const { domainManagementService } =
    await import("@/lib/services/domain-management");

  const domainId = dataContent.domainId as string;
  if (!domainId) throw new Error("domainId is required");

  const domain = await domainManagementService.getDomain(
    domainId,
    ctx.user.organization_id,
  );
  if (!domain) {
    throw new Error("Domain not found");
  }

  const result = await domainManagementService.verifyDomain(domainId);

  if (result.verified) {
    return {
      verified: true,
      domain: domain.domain,
      message: "Domain verified successfully",
    };
  }

  const dnsInstructions = domainManagementService.generateDnsInstructions(
    domain.domain,
    domain.verificationToken || "",
    domain.nameserverMode,
  );

  return {
    verified: false,
    domain: domain.domain,
    error: result.error,
    dnsInstructions,
    message: "Verification failed. Check DNS configuration.",
  };
}

/**
 * Assign domain to a resource
 */
export async function executeSkillDomainsAssign(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<DomainAssignResult> {
  const { domainManagementService } =
    await import("@/lib/services/domain-management");

  const domainId = dataContent.domainId as string;
  const resourceType = dataContent.resourceType as
    | "app"
    | "container"
    | "agent"
    | "mcp";
  const resourceId = dataContent.resourceId as string;

  if (!domainId) throw new Error("domainId is required");
  if (!resourceType) throw new Error("resourceType is required");
  if (!resourceId) throw new Error("resourceId is required");

  const deduction = await creditsService.deductCredits({
    organizationId: ctx.user.organization_id,
    amount: 1,
    description: `A2A: Assign domain to ${resourceType}`,
    metadata: { skill: "domains_assign", domainId, resourceType, resourceId },
  });

  if (!deduction.success) throw new Error("Insufficient credits");

  const updated = await domainManagementService.assignToResource(
    domainId,
    resourceType,
    resourceId,
    ctx.user.organization_id,
  );
  if (!updated)
    throw new Error(
      "Failed to assign domain. Ensure domain is verified and resource exists.",
    );

  return {
    success: true,
    domain: {
      id: updated.id,
      domain: updated.domain,
      resourceType: updated.resourceType!,
      resourceId: (updated.appId ||
        updated.containerId ||
        updated.agentId ||
        updated.mcpId)!,
    },
    message: `Domain assigned to ${resourceType}`,
  };
}

/**
 * Unassign domain from resource
 */
export async function executeSkillDomainsUnassign(
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean; message: string }> {
  const { domainManagementService } =
    await import("@/lib/services/domain-management");

  const domainId = dataContent.domainId as string;
  if (!domainId) throw new Error("domainId is required");

  const updated = await domainManagementService.unassignDomain(
    domainId,
    ctx.user.organization_id,
  );

  if (!updated) {
    throw new Error("Domain not found or already unassigned");
  }

  return {
    success: true,
    message: "Domain unassigned successfully",
  };
}

// ============================================
// CODE AGENT SKILLS
// ============================================

import type {
  CodeAgentSessionResult,
  CodeExecutionResult,
  CodeInterpreterResult,
  FileOperationResult,
  GitOperationResult,
} from "./types";

/**
 * Create code agent session
 */
export async function executeSkillCodeAgentCreateSession(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<CodeAgentSessionResult> {
  const { codeAgentService } = await import("@/lib/services/code-agent");

  const name = dataContent.name as string | undefined;
  const description = dataContent.description as string | undefined;
  const templateUrl = dataContent.templateUrl as string | undefined;
  const loadOrgSecrets = (dataContent.loadOrgSecrets as boolean) ?? true;
  const expiresInSeconds = (dataContent.expiresInSeconds as number) ?? 1800;

  const session = await codeAgentService.createSession({
    organizationId: ctx.user.organization_id,
    userId: ctx.user.id,
    name,
    description,
    templateUrl,
    loadOrgSecrets,
    expiresInSeconds,
  });

  return {
    sessionId: session.id,
    name: session.name,
    status: session.status,
    runtimeUrl: session.runtimeUrl,
    expiresAt: session.expiresAt?.toISOString() ?? null,
  };
}

/**
 * Execute code in session
 */
export async function executeSkillCodeAgentExecute(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<CodeExecutionResult> {
  const { codeAgentService } = await import("@/lib/services/code-agent");

  const sessionId = dataContent.sessionId as string;
  const type = dataContent.type as "code" | "command";
  const language = dataContent.language as
    | "python"
    | "javascript"
    | "typescript"
    | "shell"
    | undefined;
  const code = dataContent.code as string | undefined;
  const command = dataContent.command as string | undefined;
  const args = dataContent.args as string[] | undefined;
  const workingDirectory = dataContent.workingDirectory as string | undefined;
  const timeout = dataContent.timeout as number | undefined;

  if (!sessionId) throw new Error("sessionId is required");
  if (!type) throw new Error("type is required");

  // Verify session belongs to org
  const session = await codeAgentService.getSession(
    sessionId,
    ctx.user.organization_id,
  );
  if (!session) throw new Error("Session not found");

  let result;
  if (type === "code") {
    if (!code || !language)
      throw new Error("code and language required for type=code");
    result = await codeAgentService.executeCode({
      sessionId,
      language,
      code,
      options: { workingDirectory, timeout },
    });
  } else {
    if (!command) throw new Error("command required for type=command");
    result = await codeAgentService.runCommand({
      sessionId,
      command,
      args,
      options: { workingDirectory, timeout },
    });
  }

  return {
    success: result.success,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    filesAffected: result.filesAffected,
  };
}

/**
 * Read file from session
 */
export async function executeSkillCodeAgentReadFile(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<FileOperationResult> {
  const { codeAgentService } = await import("@/lib/services/code-agent");

  const sessionId = dataContent.sessionId as string;
  const path = (dataContent.path as string) || textContent;

  if (!sessionId) throw new Error("sessionId is required");
  if (!path) throw new Error("path is required");

  const session = await codeAgentService.getSession(
    sessionId,
    ctx.user.organization_id,
  );
  if (!session) throw new Error("Session not found");

  const result = await codeAgentService.readFile({ sessionId, path });

  return {
    success: result.success,
    path: result.path,
    content: result.content,
    size: result.size,
    error: result.error,
  };
}

/**
 * Write file to session
 */
export async function executeSkillCodeAgentWriteFile(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<FileOperationResult> {
  const { codeAgentService } = await import("@/lib/services/code-agent");

  const sessionId = dataContent.sessionId as string;
  const path = dataContent.path as string;
  const content = (dataContent.content as string) || textContent;

  if (!sessionId) throw new Error("sessionId is required");
  if (!path) throw new Error("path is required");
  if (!content) throw new Error("content is required");

  const session = await codeAgentService.getSession(
    sessionId,
    ctx.user.organization_id,
  );
  if (!session) throw new Error("Session not found");

  const result = await codeAgentService.writeFile({ sessionId, path, content });

  return {
    success: result.success,
    path: result.path,
    error: result.error,
  };
}

/**
 * List files in session
 */
export async function executeSkillCodeAgentListFiles(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  success: boolean;
  path: string;
  entries: Array<{ path: string; type: string; size?: number }>;
  count: number;
}> {
  const { codeAgentService } = await import("@/lib/services/code-agent");

  const sessionId = dataContent.sessionId as string;
  const path = (dataContent.path as string) || textContent || "/app";
  const recursive = (dataContent.recursive as boolean) ?? true;
  const maxDepth = (dataContent.maxDepth as number) ?? 3;

  if (!sessionId) throw new Error("sessionId is required");

  const session = await codeAgentService.getSession(
    sessionId,
    ctx.user.organization_id,
  );
  if (!session) throw new Error("Session not found");

  const result = await codeAgentService.listFiles({
    sessionId,
    path,
    recursive,
    maxDepth,
  });

  return {
    success: result.success,
    path: result.path,
    entries: result.entries.map((e) => ({
      path: e.path,
      type: e.type,
      size: e.size,
    })),
    count: result.entries.length,
  };
}

/**
 * Git clone in session
 */
export async function executeSkillCodeAgentGitClone(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<GitOperationResult> {
  const { codeAgentService } = await import("@/lib/services/code-agent");

  const sessionId = dataContent.sessionId as string;
  const url = (dataContent.url as string) || textContent;
  const branch = dataContent.branch as string | undefined;
  const depth = dataContent.depth as number | undefined;
  const directory = dataContent.directory as string | undefined;

  if (!sessionId) throw new Error("sessionId is required");
  if (!url) throw new Error("url is required");

  const session = await codeAgentService.getSession(
    sessionId,
    ctx.user.organization_id,
  );
  if (!session) throw new Error("Session not found");

  const result = await codeAgentService.gitClone({
    sessionId,
    url,
    branch,
    depth,
    directory,
  });

  return {
    success: result.success,
    message: result.message,
    gitState: result.gitState,
    error: result.error,
  };
}

/**
 * Install packages in session
 */
export async function executeSkillCodeAgentInstallPackages(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  success: boolean;
  packages: string[];
  installedCount: number;
  output: string;
  error?: string;
}> {
  const { codeAgentService } = await import("@/lib/services/code-agent");

  const sessionId = dataContent.sessionId as string;
  const packages = dataContent.packages as string[];
  const manager =
    (dataContent.manager as "npm" | "pip" | "bun" | "cargo") || "npm";
  const dev = (dataContent.dev as boolean) ?? false;

  if (!sessionId) throw new Error("sessionId is required");
  if (!packages || packages.length === 0)
    throw new Error("packages is required");

  const session = await codeAgentService.getSession(
    sessionId,
    ctx.user.organization_id,
  );
  if (!session) throw new Error("Session not found");

  const result = await codeAgentService.installPackages({
    sessionId,
    packages,
    manager,
    dev,
  });

  return {
    success: result.success,
    packages: result.packages,
    installedCount: result.installedCount,
    output: result.output,
    error: result.error,
  };
}

/**
 * Create session snapshot
 */
export async function executeSkillCodeAgentSnapshot(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{
  success: boolean;
  snapshotId?: string;
  name?: string;
  fileCount?: number;
  error?: string;
}> {
  const { codeAgentService } = await import("@/lib/services/code-agent");

  const sessionId = dataContent.sessionId as string;
  const name = dataContent.name as string | undefined;
  const description = dataContent.description as string | undefined;

  if (!sessionId) throw new Error("sessionId is required");

  const session = await codeAgentService.getSession(
    sessionId,
    ctx.user.organization_id,
  );
  if (!session) throw new Error("Session not found");

  const result = await codeAgentService.createSnapshot({
    sessionId,
    name,
    description,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    snapshotId: result.snapshot!.id,
    name: result.snapshot!.name ?? undefined,
    fileCount: result.snapshot!.fileCount,
  };
}

/**
 * Terminate session
 */
export async function executeSkillCodeAgentTerminate(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<{ success: boolean; message: string }> {
  const { codeAgentService } = await import("@/lib/services/code-agent");

  const sessionId = (dataContent.sessionId as string) || textContent;

  if (!sessionId) throw new Error("sessionId is required");

  await codeAgentService.terminateSession(sessionId, ctx.user.organization_id);

  return {
    success: true,
    message: "Session terminated",
  };
}

/**
 * Quick code interpreter (stateless execution)
 */
export async function executeSkillCodeInterpreter(
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext,
): Promise<CodeInterpreterResult> {
  const { interpreterService } = await import("@/lib/services/code-agent");

  const language = dataContent.language as
    | "python"
    | "javascript"
    | "typescript"
    | "shell";
  const code = (dataContent.code as string) || textContent;
  const packages = dataContent.packages as string[] | undefined;
  const timeout = dataContent.timeout as number | undefined;

  if (!language) throw new Error("language is required");
  if (!code) throw new Error("code is required");

  const result = await interpreterService.execute({
    organizationId: ctx.user.organization_id,
    userId: ctx.user.id,
    language,
    code,
    packages,
    timeout,
  });

  return {
    success: result.success,
    executionId: result.executionId,
    output: result.output,
    error: result.error,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    costCents: result.costCents,
  };
}
