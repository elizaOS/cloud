import {
  bigint,
  boolean,
  check,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    credit_balance: integer("credit_balance").notNull().default(10000),
    webhook_url: text("webhook_url"),
    webhook_secret: text("webhook_secret"),
    stripe_customer_id: text("stripe_customer_id"),
    stripe_subscription_id: text("stripe_subscription_id"),
    stripe_product_id: text("stripe_product_id"),
    stripe_price_id: text("stripe_price_id"),
    subscription_status: text("subscription_status"),
    billing_email: text("billing_email"),
    tax_id_type: text("tax_id_type"),
    tax_id_value: text("tax_id_value"),
    billing_address: jsonb("billing_address").$type<Record<string, unknown>>(),
    subscription_tier: text("subscription_tier").default("free"),
    max_api_requests: integer("max_api_requests").default(1000),
    max_tokens_per_request: integer("max_tokens_per_request"),
    allowed_models: jsonb("allowed_models")
      .$type<string[]>()
      .notNull()
      .default([]),
    allowed_providers: jsonb("allowed_providers")
      .$type<string[]>()
      .notNull()
      .default([]),
    is_active: boolean("is_active").default(true).notNull(),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    slug_idx: index("organizations_slug_idx").on(table.slug),
    stripe_customer_idx: index("organizations_stripe_customer_idx").on(
      table.stripe_customer_id,
    ),
  }),
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workos_user_id: text("workos_user_id").unique(),
    email: text("email").notNull().unique(),
    password_hash: text("password_hash"),
    email_verified: boolean("email_verified").notNull().default(false),
    name: text("name"),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    avatar: text("avatar"),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    email_idx: index("users_email_idx").on(table.email),
    organization_idx: index("users_organization_idx").on(table.organization_id),
    is_active_idx: index("users_is_active_idx").on(table.is_active),
    workos_user_id_idx: index("users_workos_user_id_idx").on(
      table.workos_user_id,
    ),
  }),
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    key: text("key").notNull().unique(),
    key_hash: text("key_hash").notNull().unique(),
    key_prefix: text("key_prefix").notNull(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissions: jsonb("permissions").$type<string[]>().default([]).notNull(),
    rate_limit: integer("rate_limit").notNull().default(1000),
    is_active: boolean("is_active").notNull().default(true),
    usage_count: integer("usage_count").default(0).notNull(),
    expires_at: timestamp("expires_at"),
    last_used_at: timestamp("last_used_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    key_idx: index("api_keys_key_idx").on(table.key),
    key_hash_idx: uniqueIndex("api_keys_key_hash_idx").on(table.key_hash),
    key_prefix_idx: index("api_keys_key_prefix_idx").on(table.key_prefix),
    organization_idx: index("api_keys_organization_idx").on(
      table.organization_id,
    ),
    user_idx: index("api_keys_user_idx").on(table.user_id),
  }),
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    api_key_id: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    model: text("model"),
    provider: text("provider").notNull(),
    input_tokens: integer("input_tokens").notNull().default(0),
    output_tokens: integer("output_tokens").notNull().default(0),
    input_cost: integer("input_cost").default(0),
    output_cost: integer("output_cost").default(0),
    markup: integer("markup").default(0),
    request_id: text("request_id"),
    duration_ms: integer("duration_ms"),
    is_successful: boolean("is_successful").notNull().default(true),
    error_message: text("error_message"),
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    organization_idx: index("usage_records_organization_idx").on(
      table.organization_id,
    ),
    user_idx: index("usage_records_user_idx").on(table.user_id),
    api_key_idx: index("usage_records_api_key_idx").on(table.api_key_id),
    type_idx: index("usage_records_type_idx").on(table.type),
    provider_idx: index("usage_records_provider_idx").on(table.provider),
    created_at_idx: index("usage_records_created_at_idx").on(table.created_at),
    org_created_idx: index("usage_records_org_created_idx").on(
      table.organization_id,
      table.created_at,
    ),
  }),
);

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    amount: integer("amount").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    stripe_payment_intent_id: text("stripe_payment_intent_id"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    organization_idx: index("credit_transactions_organization_idx").on(
      table.organization_id,
    ),
    user_idx: index("credit_transactions_user_idx").on(table.user_id),
    type_idx: index("credit_transactions_type_idx").on(table.type),
    created_at_idx: index("credit_transactions_created_at_idx").on(
      table.created_at,
    ),
  }),
);

export const generations = pgTable(
  "generations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    api_key_id: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    prompt: text("prompt").notNull(),
    negative_prompt: text("negative_prompt"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    storage_url: text("storage_url"),
    thumbnail_url: text("thumbnail_url"),
    content: text("content"),
    file_size: bigint("file_size", { mode: "bigint" }),
    mime_type: text("mime_type"),
    parameters: jsonb("parameters").$type<Record<string, unknown>>(),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    dimensions: jsonb("dimensions").$type<{
      width?: number;
      height?: number;
      duration?: number;
    }>(),
    tokens: integer("tokens"),
    cost: integer("cost").notNull().default(0),
    credits: integer("credits").notNull().default(0),
    usage_record_id: uuid("usage_record_id").references(() => usageRecords.id, {
      onDelete: "set null",
    }),
    job_id: text("job_id"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
    completed_at: timestamp("completed_at"),
  },
  (table) => ({
    organization_idx: index("generations_organization_idx").on(
      table.organization_id,
    ),
    user_idx: index("generations_user_idx").on(table.user_id),
    api_key_idx: index("generations_api_key_idx").on(table.api_key_id),
    type_idx: index("generations_type_idx").on(table.type),
    status_idx: index("generations_status_idx").on(table.status),
    created_at_idx: index("generations_created_at_idx").on(table.created_at),
    org_type_status_idx: index("generations_org_type_status_idx").on(
      table.organization_id,
      table.type,
      table.status,
    ),
  }),
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    max_attempts: integer("max_attempts").notNull().default(3),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id),
    api_key_id: uuid("api_key_id").references(() => apiKeys.id),
    generation_id: uuid("generation_id").references(() => generations.id),
    webhook_url: text("webhook_url"),
    webhook_status: text("webhook_status"),
    estimated_completion_at: timestamp("estimated_completion_at"),
    scheduled_for: timestamp("scheduled_for").notNull().defaultNow(),
    started_at: timestamp("started_at"),
    completed_at: timestamp("completed_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    type_idx: index("jobs_type_idx").on(table.type),
    status_idx: index("jobs_status_idx").on(table.status),
    scheduled_for_idx: index("jobs_scheduled_for_idx").on(table.scheduled_for),
    organization_idx: index("jobs_organization_idx").on(table.organization_id),
  }),
);

export const modelPricing = pgTable(
  "model_pricing",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    input_cost_per_1k: decimal("input_cost_per_1k", {
      precision: 10,
      scale: 6,
    }).notNull(),
    output_cost_per_1k: decimal("output_cost_per_1k", {
      precision: 10,
      scale: 6,
    }).notNull(),
    input_cost_per_token: decimal("input_cost_per_token", {
      precision: 10,
      scale: 6,
    }),
    output_cost_per_token: decimal("output_cost_per_token", {
      precision: 10,
      scale: 6,
    }),
    is_active: boolean("is_active").notNull().default(true),
    effective_from: timestamp("effective_from").notNull().defaultNow(),
    effective_until: timestamp("effective_until"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    provider_model_idx: index("model_pricing_provider_model_idx").on(
      table.provider,
      table.model,
    ),
    active_idx: index("model_pricing_active_idx").on(table.is_active),
  }),
);

export const providerHealth = pgTable(
  "provider_health",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("healthy"),
    last_checked: timestamp("last_checked").notNull().defaultNow(),
    response_time: integer("response_time"),
    error_rate: decimal("error_rate", { precision: 5, scale: 4 }).default("0"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    provider_idx: index("provider_health_provider_idx").on(table.provider),
    status_idx: index("provider_health_status_idx").on(table.status),
  }),
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    model: text("model").notNull(),
    settings: jsonb("settings")
      .$type<{
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        frequencyPenalty?: number;
        presencePenalty?: number;
        systemPrompt?: string;
      }>()
      .notNull()
      .default({
        temperature: 0.7,
        maxTokens: 2000,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        systemPrompt: "You are a helpful AI assistant.",
      }),
    status: text("status").notNull().default("active"),
    message_count: integer("message_count").notNull().default(0),
    total_cost: integer("total_cost").notNull().default(0),
    last_message_at: timestamp("last_message_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    organization_idx: index("conversations_organization_idx").on(
      table.organization_id,
    ),
    user_idx: index("conversations_user_idx").on(table.user_id),
    updated_idx: index("conversations_updated_idx").on(table.updated_at),
    status_idx: index("conversations_status_idx").on(table.status),
  }),
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    sequence_number: integer("sequence_number").notNull(),
    model: text("model"),
    tokens: integer("tokens"),
    cost: integer("cost").default(0),
    usage_record_id: uuid("usage_record_id").references(() => usageRecords.id, {
      onDelete: "set null",
    }),
    api_request: jsonb("api_request").$type<Record<string, unknown>>(),
    api_response: jsonb("api_response").$type<Record<string, unknown>>(),
    processing_time: integer("processing_time"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    conversation_idx: index("conv_messages_conversation_idx").on(
      table.conversation_id,
    ),
    sequence_idx: index("conv_messages_sequence_idx").on(
      table.conversation_id,
      table.sequence_number,
    ),
    created_idx: index("conv_messages_created_idx").on(table.created_at),
  }),
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organization_id],
    references: [organizations.id],
  }),
  conversations: many(conversations),
}));

export const conversationsRelations = relations(
  conversations,
  ({ many, one }) => ({
    messages: many(conversationMessages),
    user: one(users, {
      fields: [conversations.user_id],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [conversations.organization_id],
      references: [organizations.id],
    }),
  }),
);

export const conversationMessagesRelations = relations(
  conversationMessages,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationMessages.conversation_id],
      references: [conversations.id],
    }),
  }),
);
