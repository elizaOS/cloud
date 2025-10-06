import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import * as schema from "@/db/sass/schema";

export type Organization = InferSelectModel<typeof schema.organizations>;
export type NewOrganization = InferInsertModel<typeof schema.organizations>;

export type User = InferSelectModel<typeof schema.users>;
export type NewUser = InferInsertModel<typeof schema.users>;

export type ApiKey = InferSelectModel<typeof schema.apiKeys>;
export type NewApiKey = InferInsertModel<typeof schema.apiKeys>;

export type UsageRecord = InferSelectModel<typeof schema.usageRecords>;
export type NewUsageRecord = InferInsertModel<typeof schema.usageRecords>;

export type CreditTransaction = InferSelectModel<
  typeof schema.creditTransactions
>;
export type NewCreditTransaction = InferInsertModel<
  typeof schema.creditTransactions
>;

export type CreditPack = InferSelectModel<typeof schema.creditPacks>;
export type NewCreditPack = InferInsertModel<typeof schema.creditPacks>;

export type Generation = InferSelectModel<typeof schema.generations>;
export type NewGeneration = InferInsertModel<typeof schema.generations>;

export type Job = InferSelectModel<typeof schema.jobs>;
export type NewJob = InferInsertModel<typeof schema.jobs>;

export type ModelPricing = InferSelectModel<typeof schema.modelPricing>;
export type NewModelPricing = InferInsertModel<typeof schema.modelPricing>;

export type ProviderHealth = InferSelectModel<typeof schema.providerHealth>;
export type NewProviderHealth = InferInsertModel<typeof schema.providerHealth>;

export type Conversation = InferSelectModel<typeof schema.conversations>;
export type NewConversation = InferInsertModel<typeof schema.conversations>;

export type ConversationMessage = InferSelectModel<
  typeof schema.conversationMessages
>;
export type NewConversationMessage = InferInsertModel<
  typeof schema.conversationMessages
>;

export type UserWithOrganization = User & {
  organization: Organization;
};

export type ConversationWithMessages = Conversation & {
  messages: ConversationMessage[];
};

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
