/**
 * Cloud API Client
 *
 * Wrapper for interacting with the Eliza Cloud API through the proxy.
 * Automatically includes auth token from localStorage.
 * 
 * IMPORTANT: This file imports types from ./types.ts to ensure complete
 * separation from the main app. Never import types from the parent app.
 */

import type {
  Agent,
  AgentDetails,
  AppBilling,
  Billing,
  Chat,
  CreditPack,
  ImageGenerationSettings,
  Message,
  MessageAttachment,
  MessageExampleConversation,
  Organization,
  Pagination,
  ReferralInfo,
  RewardsStatus,
  StreamCallbacks,
  Transaction,
  UsageSummary,
  User,
} from "./types";
import { getAuthToken } from "./use-auth";

const API_BASE = "/api/proxy";

/**
 * Safely convert a timestamp/date to ISO string
 * Handles undefined, null, invalid dates, and various formats
 */
function safeToISOString(value: unknown): string {
  if (!value) {
    return new Date().toISOString();
  }

  try {
    const date = new Date(value as string | number);
    if (isNaN(date.getTime())) {
      return new Date().toISOString();
    }
    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
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

export async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
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
  imageSettings?: ImageGenerationSettings;
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
    imageSettings: ImageGenerationSettings;
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
              createdAt: safeToISOString(data.createdAt),
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
              createdAt: safeToISOString(data.createdAt),
              attachments: attachments.length > 0 ? attachments : undefined,
            };
            
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
// Re-export types for convenience
// ============================================

export type {
  Agent,
  AgentDetails,
  AppBilling,
  Billing,
  Chat,
  CreditPack,
  ImageGenerationSettings,
  ImageGenerationVibe,
  Message,
  MessageAttachment,
  Organization,
  Pagination,
  ReferralInfo,
  RewardsStatus,
  StreamCallbacks,
  Transaction,
  UsageSummary,
  User,
} from "./types";
