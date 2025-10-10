// Re-export all types from repositories for convenience
export type {
  Organization,
  NewOrganization,
} from "@/db/repositories/organizations";

export type {
  User,
  NewUser,
  UserWithOrganization,
} from "@/db/repositories/users";

export type {
  ApiKey,
  NewApiKey,
} from "@/db/repositories/api-keys";

export type {
  UsageRecord,
  NewUsageRecord,
  UsageStats,
} from "@/db/repositories/usage-records";

export type {
  CreditTransaction,
  NewCreditTransaction,
} from "@/db/repositories/credit-transactions";

export type {
  CreditPack,
  NewCreditPack,
} from "@/db/repositories/credit-packs";

export type {
  Generation,
  NewGeneration,
} from "@/db/repositories/generations";

export type {
  Conversation,
  NewConversation,
  ConversationMessage,
  NewConversationMessage,
  ConversationWithMessages,
} from "@/db/repositories/conversations";

export type {
  UserCharacter,
  NewUserCharacter,
} from "@/db/repositories/user-characters";

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
  settings?: Record<string, string | boolean | number | Record<string, unknown>>;
  secrets?: Record<string, string | boolean | number>;
  style?: {
    all?: string[];
    chat?: string[];
    post?: string[];
  };
}
