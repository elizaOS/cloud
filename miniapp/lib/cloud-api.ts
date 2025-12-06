/**
 * Cloud API Client
 *
 * Wrapper for interacting with the Eliza Cloud API through the proxy.
 * Automatically includes auth token from localStorage.
 */

import { getAuthToken } from "./use-auth";

const API_BASE = "/api/proxy";

interface Agent {
  id: string;
  name: string;
  bio: string | string[];
  avatarUrl: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  stats?: {
    views: number;
    chats: number;
    messages: number;
  };
}

/**
 * A single message in a conversation example
 */
interface MessageExampleMessage {
  name: string;
  content: {
    text: string;
    action?: string;
  };
}

/**
 * A conversation example (array of messages)
 */
type MessageExampleConversation = MessageExampleMessage[];

interface AgentDetails extends Agent {
  topics: string[];
  adjectives: string[];
  style: {
    all?: string[];
    chat?: string[];
    post?: string[];
  };
  settings: Record<string, string | number | boolean | Record<string, string | number | boolean>>;
  knowledge: string[];
  messageExamples: MessageExampleConversation[];
  postExamples: string[];
  plugins: string[];
  isTemplate: boolean;
  characterData: Record<string, string | number | boolean | string[] | Record<string, string | number | boolean>>;
}

interface Chat {
  id: string;
  agentId: string;
  name: string | null; // Room title (generated after 2 rounds of conversation)
  createdAt: string;
  updatedAt: string;
  lastMessage?: {
    content: string;
    role: "user" | "assistant";
    createdAt: string;
  };
  messageCount: number;
}

interface MessageAttachment {
  id: string;
  url: string;
  title?: string;
  contentType?: string;
}

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  createdAt: string;
  metadata?: Record<string, unknown>;
  attachments?: MessageAttachment[];
}

interface User {
  id: string;
  email: string | null;
  name: string | null;
  nickname: string | null;
  avatar: string | null;
  walletAddress: string | null;
  walletChainType: string | null;
  createdAt: string;
}

interface Organization {
  id: string;
  name: string;
  creditBalance: string;
}

interface Billing {
  creditBalance: string;
  autoTopUpEnabled: boolean;
  autoTopUpThreshold: string | null;
  autoTopUpAmount: string | null;
  billingEmail: string | null;
  hasPaymentMethod: boolean;
}

export interface AppBilling {
  appId: string;
  appName: string;
  monetizationEnabled: boolean;
  creditBalance?: number;
  totalPurchased?: number;
  totalSpent?: number;
  inferenceMarkupPercentage?: number;
  useOrgBalance?: boolean;
  createdBy?: {
    organizationId: string;
  };
}

interface UsageSummary {
  totalRequests: number;
  totalCost: string;
  totalTokens: number;
  breakdown: Array<{
    model: string;
    provider: string;
    count: number;
    totalCost: number;
  }>;
}

interface Transaction {
  id: string;
  type: string;
  amount: string;
  description: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  totalPages: number;
  totalCount: number;
  hasMore: boolean;
}

/**
 * Get auth headers for API requests
 */
function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// ============================================
// User API
// ============================================

export async function getCurrentUser(): Promise<{
  user: User;
  organization: Organization;
}> {
  const response = await fetchApi<{
    success: boolean;
    user: User;
    organization: Organization;
  }>("/user");

  return { user: response.user, organization: response.organization };
}

// ============================================
// Agents API
// ============================================

export async function listAgents(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<{
  agents: Agent[];
  pagination: Pagination;
}> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.search) searchParams.set("search", params.search);

  const query = searchParams.toString();
  const path = query ? `/agents?${query}` : "/agents";

  const response = await fetchApi<{
    success: boolean;
    agents: Agent[];
    pagination: Pagination;
  }>(path);

  return { agents: response.agents, pagination: response.pagination };
}

export async function getAgent(id: string): Promise<AgentDetails> {
  const response = await fetchApi<{
    success: boolean;
    agent: AgentDetails;
  }>(`/agents/${id}`);

  return response.agent;
}

export async function createAgent(data: {
  name: string;
  bio: string | string[];
  avatarUrl?: string | null;
  topics?: string[];
  adjectives?: string[];
  style?: {
    all?: string[];
    chat?: string[];
    post?: string[];
  };
  settings?: Record<string, string | number | boolean | Record<string, string | number | boolean>>;
  isPublic?: boolean;
}): Promise<Agent> {
  const response = await fetchApi<{
    success: boolean;
    agent: Agent;
  }>("/agents", {
    method: "POST",
    body: JSON.stringify(data),
  });

  return response.agent;
}

export async function updateAgent(
  id: string,
  data: Partial<{
    name: string;
    bio: string | string[];
    avatarUrl: string | null;
    topics: string[];
    adjectives: string[];
    style: {
      all?: string[];
      chat?: string[];
      post?: string[];
    };
    settings: Record<string, string | number | boolean | Record<string, string | number | boolean>>;
    knowledge: string[];
    messageExamples: MessageExampleConversation[];
    postExamples: string[];
    plugins: string[];
    isPublic: boolean;
    characterData: Record<string, string | number | boolean | string[] | Record<string, string | number | boolean>>;
  }>
): Promise<Agent> {
  const response = await fetchApi<{
    success: boolean;
    agent: Agent;
  }>(`/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  return response.agent;
}

export async function deleteAgent(id: string): Promise<void> {
  await fetchApi<{ success: boolean }>(`/agents/${id}`, {
    method: "DELETE",
  });
}

// ============================================
// Chats API
// ============================================

export async function listChats(
  agentId: string,
  params?: { page?: number; limit?: number }
): Promise<{
  chats: Chat[];
  pagination: Pagination;
}> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  const path = query
    ? `/agents/${agentId}/chats?${query}`
    : `/agents/${agentId}/chats`;

  const response = await fetchApi<{
    success: boolean;
    chats: Chat[];
    pagination: Pagination;
  }>(path);

  return { chats: response.chats, pagination: response.pagination };
}

export async function createChat(agentId: string): Promise<Chat> {
  const response = await fetchApi<{
    success: boolean;
    chat: Chat;
  }>(`/agents/${agentId}/chats`, {
    method: "POST",
  });

  return response.chat;
}

export async function getChat(
  agentId: string,
  chatId: string
): Promise<{
  messages: Message[];
  chat: { id: string; agentId: string; name: string | null };
}> {
  const response = await fetchApi<{
    success: boolean;
    messages: Message[];
    chat: { id: string; agentId: string; name: string | null };
  }>(`/agents/${agentId}/chats/${chatId}`);

  return { messages: response.messages, chat: response.chat };
}

export async function deleteChat(
  agentId: string,
  chatId: string
): Promise<void> {
  await fetchApi<{ success: boolean }>(`/agents/${agentId}/chats/${chatId}`, {
    method: "DELETE",
  });
}

// ============================================
// Messages API (Streaming)
// ============================================

export interface StreamCallbacks {
  onStart?: () => void;
  onUserMessage?: (message: Message) => void;
  onThinking?: () => void;
  onChunk?: (chunk: string) => void;
  onComplete?: (
    message: Message,
    usage: { tokens: number; cost: number }
  ) => void;
  onError?: (error: string) => void;
}

export async function sendMessage(
  roomId: string,
  text: string,
  callbacks: StreamCallbacks,
  model?: string,
  attachments?: MessageAttachment[]
): Promise<void> {
  const response = await fetch(`${API_BASE}/stream/${roomId}`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({ text, model, attachments }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE messages (format: event: <name>\ndata: <json>\n\n)
    const messages = buffer.split("\n\n");
    buffer = messages.pop() || ""; // Keep incomplete message in buffer

    for (const message of messages) {
      if (!message.trim()) continue;

      const lines = message.split("\n");
      let eventType = "";
      let eventData = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          eventData = line.slice(6);
        }
      }

      if (!eventData) continue;

      const data = JSON.parse(eventData);

        // Handle ElizaOS stream format
        if (eventType === "connected") {
          callbacks.onStart?.();
        } else if (eventType === "message") {
          if (data.type === "user") {
            // User message confirmation
            // Extract attachments if present (user may have uploaded images)
            const userAttachments: MessageAttachment[] = [];
            if (data.content?.attachments && Array.isArray(data.content.attachments)) {
              for (const att of data.content.attachments) {
                if (att.url && typeof att.url === "string") {
                  userAttachments.push({
                    id: att.id || `att-${Date.now()}`,
                    url: att.url,
                    title: att.title,
                    contentType: att.contentType || "image",
                  });
                }
              }
            }
            
            const userMsg: Message = {
              id: data.id,
              content: data.content?.text || "",
              role: "user",
              createdAt: new Date(data.createdAt).toISOString(),
              attachments: userAttachments.length > 0 ? userAttachments : undefined,
            };
            callbacks.onUserMessage?.(userMsg);
          } else if (data.type === "thinking") {
            // Thinking indicator
            callbacks.onThinking?.();
          } else if (data.isAgent || data.type === "agent") {
            // Agent response
            const responseText = data.content?.text || "";
            
            // Extract attachments (images) from the response
            const attachments: MessageAttachment[] = [];
            if (data.content?.attachments && Array.isArray(data.content.attachments)) {
              for (const att of data.content.attachments) {
                if (att.url && typeof att.url === "string") {
                  attachments.push({
                    id: att.id || `att-${Date.now()}`,
                    url: att.url,
                    title: att.title,
                    contentType: att.contentType || "image",
                  });
                }
              }
            }

            const agentMsg: Message = {
              id: data.id,
              content: responseText,
              role: "assistant",
              createdAt: new Date(data.createdAt || Date.now()).toISOString(),
              attachments: attachments.length > 0 ? attachments : undefined,
            };
              attachmentCount: agentMsg.attachments?.length || 0,
              contentPreview: agentMsg.content.substring(0, 50),
            });
            
            callbacks.onComplete?.(agentMsg, { tokens: 0, cost: 0 });
          }
        } else if (eventType === "error") {
          callbacks.onError?.(data.message || data.error || "Unknown error");
        } else if (eventType === "done") {
          // Stream complete
        }
    }
  }
}

// ============================================
// Billing API
// ============================================

export async function getBilling(): Promise<{
  billing: Billing;
  usage: { currentMonth: UsageSummary };
  recentTransactions: Transaction[];
  appBilling?: AppBilling;
}> {
  const response = await fetchApi<{
    success: boolean;
    billing: Billing;
    usage: { currentMonth: UsageSummary };
    recentTransactions: Transaction[];
    appBilling?: AppBilling;
  }>("/billing");

  return {
    billing: response.billing,
    usage: response.usage,
    recentTransactions: response.recentTransactions,
    appBilling: response.appBilling,
  };
}

interface CreditPack {
  id: string;
  name: string;
  description: string | null;
  credits: string;
  price: string;
  bonusCredits: string | null;
  isPopular: boolean;
}

export async function getCreditPacks(): Promise<CreditPack[]> {
  const response = await fetchApi<{
    success: boolean;
    creditPacks: CreditPack[];
  }>("/billing/credit-packs");

  return response.creditPacks;
}

export async function createCheckoutSession(params: {
  creditPackId?: string;
  amount?: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ sessionId: string; url: string }> {
  const response = await fetchApi<{
    success: boolean;
    sessionId: string;
    url: string;
  }>("/billing/checkout", {
    method: "POST",
    body: JSON.stringify(params),
  });

  return { sessionId: response.sessionId, url: response.url };
}

// ============================================
// Referrals & Rewards
// ============================================

interface ReferralInfo {
  code: string;
  shareUrl: string;
  stats: {
    totalReferrals: number;
    totalEarnings: number;
    signupEarnings: number;
    qualifiedEarnings: number;
    commissionEarnings: number;
  };
  rewards: {
    signupBonus: number;
    referredBonus: number;
    qualifiedBonus: number;
    commissionRate: number;
  };
}

interface ShareStatus {
  x: { claimed: boolean; amount: number };
  farcaster: { claimed: boolean; amount: number };
  telegram: { claimed: boolean; amount: number };
  discord: { claimed: boolean; amount: number };
}

interface RewardsStatus {
  sharing: {
    status: ShareStatus;
    totalEarnings: number;
    availableToday: number;
  };
  referrals: {
    code: string | null;
    totalReferrals: number;
    totalEarnings: number;
    signupEarnings: number;
    qualifiedEarnings: number;
    commissionEarnings: number;
  };
  rewardRates: {
    shareX: number;
    shareFarcaster: number;
    shareTelegram: number;
    shareDiscord: number;
    signupBonus: number;
    referredBonus: number;
    qualifiedBonus: number;
    commissionRate: number;
  };
}

export async function getReferralInfo(): Promise<ReferralInfo> {
  const response = await fetchApi<{ success: boolean; referral: ReferralInfo }>("/referral");
  return response.referral;
}

export async function applyReferralCode(code: string): Promise<{ success: boolean; message: string; bonusAmount?: number }> {
  return fetchApi<{ success: boolean; message: string; bonusAmount?: number }>("/referral/apply", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function getRewardsStatus(): Promise<RewardsStatus> {
  const response = await fetchApi<{ success: boolean; rewards: RewardsStatus }>("/rewards");
  return response.rewards;
}

export async function claimShareReward(
  platform: "x" | "farcaster" | "telegram" | "discord",
  shareType: "app_share" | "character_share" | "invite_share",
  shareUrl?: string
): Promise<{ success: boolean; message: string; amount?: number; alreadyAwarded?: boolean }> {
  return fetchApi<{ success: boolean; message: string; amount?: number; alreadyAwarded?: boolean }>("/rewards/share", {
    method: "POST",
    body: JSON.stringify({ platform, shareType, shareUrl }),
  });
}

/**
 * Qualify a referral by notifying that the user has linked a social account.
 * Awards the referrer their qualified bonus if this user was referred.
 */
export async function qualifyReferral(): Promise<{ success: boolean; qualified: boolean; bonusAwarded?: number }> {
  return fetchApi<{ success: boolean; qualified: boolean; bonusAwarded?: number }>("/referral/qualify", {
    method: "POST",
  });
}

// ============================================
// Export types
// ============================================

export type {
  Agent,
  AgentDetails,
  Billing,
  Chat,
  CreditPack,
  Message,
  MessageAttachment,
  Organization,
  Pagination,
  Transaction,
  UsageSummary,
  User,
};
