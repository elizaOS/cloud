/**
 * Miniapp Type Definitions
 * 
 * All types for the miniapp are defined here to ensure complete separation
 * from the main app. The miniapp should NEVER import types from the parent app.
 */

// ============================================
// Image Generation Types
// ============================================

export type ImageGenerationVibe =
  | "flirty"
  | "shy"
  | "bold"
  | "spicy"
  | "romantic"
  | "playful"
  | "mysterious"
  | "intellectual";

export interface ImageGenerationSettings {
  enabled: boolean;
  autoGenerate: boolean;
  referenceImages: string[];
  vibe?: ImageGenerationVibe;
  appearanceDescription?: string;
}

// ============================================
// Agent Types
// ============================================

export interface Agent {
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
  imageSettings?: ImageGenerationSettings;
}

/**
 * A single message in a conversation example
 */
export interface MessageExampleMessage {
  name: string;
  content: {
    text: string;
    action?: string;
  };
}

/**
 * A conversation example (array of messages)
 */
export type MessageExampleConversation = MessageExampleMessage[];

export interface AgentDetails extends Agent {
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
  imageSettings?: ImageGenerationSettings;
}

// ============================================
// Chat & Message Types
// ============================================

export interface Chat {
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

export interface MessageAttachment {
  id: string;
  url: string;
  title?: string;
  contentType?: string;
}

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  createdAt: string;
  metadata?: Record<string, unknown>;
  attachments?: MessageAttachment[];
}

// ============================================
// User & Organization Types
// ============================================

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  nickname: string | null;
  avatar: string | null;
  walletAddress: string | null;
  walletChainType: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  creditBalance: string;
}

// ============================================
// Billing Types
// ============================================

export interface Billing {
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

export interface CreditPack {
  id: string;
  name: string;
  description: string | null;
  credits: string;
  price: string;
  bonusCredits: string | null;
  isPopular: boolean;
}

export interface UsageSummary {
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

export interface Transaction {
  id: string;
  type: string;
  amount: string;
  description: string;
  createdAt: string;
}

// ============================================
// Pagination Types
// ============================================

export interface Pagination {
  page: number;
  limit: number;
  totalPages: number;
  totalCount: number;
  hasMore: boolean;
}

// ============================================
// Streaming Types
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

// ============================================
// Referral & Rewards Types
// ============================================

export interface ReferralInfo {
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

export interface ShareStatus {
  x: { claimed: boolean; amount: number };
  farcaster: { claimed: boolean; amount: number };
  telegram: { claimed: boolean; amount: number };
  discord: { claimed: boolean; amount: number };
}

export interface RewardsStatus {
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

// ============================================
// Auth Types
// ============================================

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
}

export interface AuthState {
  ready: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  userId: string | null;
  organizationId: string | null;
  authToken: string | null;
  login: () => Promise<void>;
  logout: () => void;
}

