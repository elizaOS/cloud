// Re-export all types from schemas for convenience
// Schemas are the single source of truth for type inference using InferSelectModel and InferInsertModel
export type { Organization, NewOrganization } from "@/db/schemas/organizations";

export type { User, NewUser } from "@/db/schemas/users";

export type { ApiKey, NewApiKey } from "@/db/schemas/api-keys";

export type { UsageRecord, NewUsageRecord } from "@/db/schemas/usage-records";

export type {
  CreditTransaction,
  NewCreditTransaction,
} from "@/db/schemas/credit-transactions";

export type { CreditPack, NewCreditPack } from "@/db/schemas/credit-packs";

export type { Generation, NewGeneration } from "@/db/schemas/generations";

export type {
  Conversation,
  NewConversation,
  ConversationMessage,
  NewConversationMessage,
} from "@/db/schemas/conversations";

export type {
  UserCharacter,
  NewUserCharacter,
} from "@/db/schemas/user-characters";

export type { Job, NewJob } from "@/db/schemas/jobs";

export type { ModelPricing, NewModelPricing } from "@/db/schemas/model-pricing";

export type {
  ProviderHealth,
  NewProviderHealth,
} from "@/db/schemas/provider-health";

// Repository-specific composite types
export type { UserWithOrganization } from "@/db/repositories/users";
export type { ConversationWithMessages } from "@/db/repositories/conversations";
export type { UsageStats } from "@/db/repositories/usage-records";

// Additional utility types
export interface ConversationSettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
}

export interface UsageMetadata {
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  [key: string]: unknown;
}

export type TemplateType =
  | string
  | ((options: { state: Record<string, unknown> }) => string);

export interface ElizaCharacter {
  id?: string;
  name: string;
  username?: string;
  system?: string;
  templates?: {
    [key: string]: TemplateType;
  };
  bio: string | string[];
  messageExamples?: Array<
    Array<{
      name: string;
      content: {
        text: string;
        action?: string;
        [key: string]: unknown;
      };
    }>
  >;
  postExamples?: string[];
  topics?: string[];
  adjectives?: string[];
  knowledge?: (string | { path: string; shared?: boolean })[];
  plugins?: string[];
  avatarUrl?: string;
  settings?: Record<
    string,
    string | boolean | number | Record<string, unknown>
  >;
  secrets?: Record<string, string | boolean | number>;
  style?: {
    all?: string[];
    chat?: string[];
    post?: string[];
  };
  avatar_url?: string;
}
