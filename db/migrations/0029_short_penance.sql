CREATE TYPE "public"."app_deployment_status" AS ENUM('draft', 'building', 'deploying', 'deployed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_database_status" AS ENUM('none', 'provisioning', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."share_type" AS ENUM('app_share', 'character_share', 'invite_share');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('x', 'farcaster', 'telegram', 'discord');--> statement-breakpoint
CREATE TYPE "public"."mcp_pricing_type" AS ENUM('free', 'credits', 'x402');--> statement-breakpoint
CREATE TYPE "public"."mcp_status" AS ENUM('draft', 'pending_review', 'live', 'suspended', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."redemption_network" AS ENUM('ethereum', 'base', 'bnb', 'solana');--> statement-breakpoint
CREATE TYPE "public"."redemption_status" AS ENUM('pending', 'approved', 'processing', 'completed', 'failed', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."earnings_source" AS ENUM('miniapp', 'agent', 'mcp', 'affiliate', 'app_owner_revenue_share', 'creator_revenue_share');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('earning', 'redemption', 'adjustment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'moderator', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."moderation_action" AS ENUM('refused', 'warned', 'flagged_for_ban', 'banned');--> statement-breakpoint
CREATE TYPE "public"."user_mod_status" AS ENUM('clean', 'warned', 'spammer', 'scammer', 'banned');--> statement-breakpoint
CREATE TYPE "public"."secret_actor_type" AS ENUM('user', 'api_key', 'system', 'deployment', 'workflow');--> statement-breakpoint
CREATE TYPE "public"."secret_audit_action" AS ENUM('created', 'read', 'updated', 'deleted', 'rotated');--> statement-breakpoint
CREATE TYPE "public"."secret_environment" AS ENUM('development', 'preview', 'production');--> statement-breakpoint
CREATE TYPE "public"."secret_project_type" AS ENUM('character', 'app', 'workflow', 'container', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."secret_provider" AS ENUM('openai', 'anthropic', 'google', 'elevenlabs', 'fal', 'stripe', 'discord', 'telegram', 'twitter', 'github', 'slack', 'aws', 'vercel', 'custom');--> statement-breakpoint
CREATE TYPE "public"."secret_scope" AS ENUM('organization', 'project', 'environment');--> statement-breakpoint
CREATE TYPE "public"."reply_confirmation_status" AS ENUM('pending', 'confirmed', 'rejected', 'expired', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."social_engagement_type" AS ENUM('mention', 'reply', 'quote_tweet', 'repost', 'like', 'comment', 'follow');--> statement-breakpoint
CREATE TYPE "public"."domain_moderation_status" AS ENUM('clean', 'pending_review', 'flagged', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."domain_nameserver_mode" AS ENUM('vercel', 'external');--> statement-breakpoint
CREATE TYPE "public"."domain_registrar" AS ENUM('vercel', 'external');--> statement-breakpoint
CREATE TYPE "public"."domain_resource_type" AS ENUM('app', 'container', 'agent', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'active', 'expired', 'suspended', 'transferring');--> statement-breakpoint
CREATE TYPE "public"."domain_event_detected_by" AS ENUM('system', 'admin', 'user_report', 'automated_scan', 'health_monitor');--> statement-breakpoint
CREATE TYPE "public"."domain_event_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."domain_event_type" AS ENUM('name_check', 'auto_flag', 'admin_flag', 'health_check', 'content_scan', 'user_report', 'suspension', 'reinstatement', 'dns_change', 'assignment_change', 'verification', 'renewal', 'expiration_warning');--> statement-breakpoint
CREATE TYPE "public"."platform_credential_status" AS ENUM('pending', 'active', 'expired', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."platform_credential_type" AS ENUM('discord', 'telegram', 'twitter', 'gmail', 'slack', 'github', 'google', 'bluesky', 'reddit', 'facebook', 'instagram', 'tiktok', 'linkedin', 'mastodon', 'twilio', 'google_calendar', 'linear', 'notion', 'hubspot', 'salesforce', 'jira', 'asana', 'airtable', 'dropbox', 'spotify', 'zoom');--> statement-breakpoint
CREATE TYPE "public"."org_agent_type" AS ENUM('community_manager', 'project_manager', 'dev_rel', 'liaison', 'social_media_manager');--> statement-breakpoint
CREATE TYPE "public"."org_checkin_frequency" AS ENUM('daily', 'weekdays', 'weekly', 'bi_weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."org_checkin_type" AS ENUM('standup', 'sprint', 'mental_health', 'project_status', 'retrospective');--> statement-breakpoint
CREATE TYPE "public"."org_platform_status" AS ENUM('active', 'disconnected', 'error', 'pending');--> statement-breakpoint
CREATE TYPE "public"."org_platform_type" AS ENUM('discord', 'telegram', 'slack', 'twitter');--> statement-breakpoint
CREATE TYPE "public"."org_todo_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."org_todo_status" AS ENUM('pending', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."seo_artifact_type" AS ENUM('keywords', 'meta', 'schema', 'serp_snapshot', 'health_report', 'indexnow_submission');--> statement-breakpoint
CREATE TYPE "public"."seo_provider" AS ENUM('dataforseo', 'serpapi', 'claude', 'indexnow', 'bing');--> statement-breakpoint
CREATE TYPE "public"."seo_provider_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."seo_request_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."seo_request_type" AS ENUM('keyword_research', 'serp_snapshot', 'meta_generate', 'schema_generate', 'publish_bundle', 'index_now', 'health_check');--> statement-breakpoint
CREATE TYPE "public"."phone_provider" AS ENUM('twilio', 'blooio', 'vonage', 'other');--> statement-breakpoint
CREATE TYPE "public"."phone_type" AS ENUM('sms', 'voice', 'both', 'imessage');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"credit_balance" numeric(10, 2) DEFAULT '100.00' NOT NULL,
	"webhook_url" text,
	"webhook_secret" text,
	"stripe_customer_id" text,
	"billing_email" text,
	"tax_id_type" text,
	"tax_id_value" text,
	"billing_address" jsonb,
	"stripe_payment_method_id" text,
	"stripe_default_payment_method" text,
	"auto_top_up_enabled" boolean DEFAULT false NOT NULL,
	"auto_top_up_amount" numeric(10, 2),
	"auto_top_up_threshold" numeric(10, 2) DEFAULT '0.00',
	"auto_top_up_subscription_id" text,
	"max_api_requests" integer DEFAULT 1000,
	"max_tokens_per_request" integer,
	"allowed_models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_providers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "credit_balance_non_negative" CHECK ("organizations"."credit_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organization_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"inviter_user_id" uuid NOT NULL,
	"invited_email" text NOT NULL,
	"invited_role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp,
	"accepted_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"privy_user_id" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"anonymous_session_id" text,
	"telegram_id" text,
	"telegram_username" text,
	"telegram_first_name" text,
	"telegram_photo_url" text,
	"phone_number" text,
	"phone_verified" boolean DEFAULT false,
	"discord_id" text,
	"discord_username" text,
	"discord_global_name" text,
	"discord_avatar_url" text,
	"email" text,
	"email_verified" boolean DEFAULT false,
	"wallet_address" text,
	"wallet_chain_type" text,
	"wallet_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"nickname" text,
	"work_function" text,
	"preferences" text,
	"response_notifications" boolean DEFAULT true,
	"email_notifications" boolean DEFAULT true,
	"organization_id" uuid,
	"role" text DEFAULT 'member' NOT NULL,
	"avatar" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "users_privy_user_id_unique" UNIQUE("privy_user_id"),
	CONSTRAINT "users_anonymous_session_id_unique" UNIQUE("anonymous_session_id"),
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number"),
	CONSTRAINT "users_discord_id_unique" UNIQUE("discord_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_token" text NOT NULL,
	"credits_used" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"requests_made" integer DEFAULT 0 NOT NULL,
	"tokens_consumed" bigint DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"ip_address" text,
	"user_agent" text,
	"device_info" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "anonymous_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"messages_limit" integer DEFAULT 10 NOT NULL,
	"total_tokens_used" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp,
	"hourly_message_count" integer DEFAULT 0 NOT NULL,
	"hourly_reset_at" timestamp,
	"ip_address" text,
	"user_agent" text,
	"fingerprint" text,
	"signup_prompted_at" timestamp,
	"signup_prompt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"converted_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "anonymous_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"key" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rate_limit" integer DEFAULT 1000 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_unique" UNIQUE("key"),
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "cli_auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"user_id" uuid,
	"api_key_id" uuid,
	"api_key_plain" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"authenticated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cli_auth_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"api_key_id" uuid,
	"type" text NOT NULL,
	"model" text,
	"provider" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"input_cost" numeric(10, 2) DEFAULT '0.00',
	"output_cost" numeric(10, 2) DEFAULT '0.00',
	"markup" numeric(10, 2) DEFAULT '0.00',
	"request_id" text,
	"duration_ms" integer,
	"is_successful" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"quota_type" text NOT NULL,
	"model_name" text,
	"period_type" text DEFAULT 'weekly' NOT NULL,
	"credits_limit" numeric(10, 2) NOT NULL,
	"current_usage" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stripe_payment_intent_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"credits" numeric(10, 2) NOT NULL,
	"price_cents" integer NOT NULL,
	"stripe_price_id" text NOT NULL,
	"stripe_product_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_packs_stripe_price_id_unique" UNIQUE("stripe_price_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_payment_intent_id" text,
	"amount_due" numeric(10, 2) NOT NULL,
	"amount_paid" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text NOT NULL,
	"invoice_type" text NOT NULL,
	"invoice_number" text,
	"invoice_pdf" text,
	"hosted_invoice_url" text,
	"credits_added" numeric(10, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp,
	"paid_at" timestamp,
	CONSTRAINT "invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"api_key_id" uuid,
	"type" text NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"prompt" text NOT NULL,
	"negative_prompt" text,
	"result" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"storage_url" text,
	"thumbnail_url" text,
	"content" text,
	"file_size" bigint,
	"mime_type" text,
	"parameters" jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dimensions" jsonb,
	"tokens" integer,
	"cost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"credits" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"usage_record_id" uuid,
	"job_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"data" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"api_key_id" uuid,
	"generation_id" uuid,
	"webhook_url" text,
	"webhook_status" text,
	"estimated_completion_at" timestamp,
	"scheduled_for" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_cost_per_1k" numeric(10, 6) NOT NULL,
	"output_cost_per_1k" numeric(10, 6) NOT NULL,
	"input_cost_per_token" numeric(10, 6),
	"output_cost_per_token" numeric(10, 6),
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_until" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'healthy' NOT NULL,
	"last_checked" timestamp DEFAULT now() NOT NULL,
	"response_time" integer,
	"error_rate" numeric(5, 4) DEFAULT '0',
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"model" text,
	"tokens" integer,
	"cost" numeric(10, 2) DEFAULT '0.00',
	"usage_record_id" uuid,
	"api_request" jsonb,
	"api_response" jsonb,
	"processing_time" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"model" text NOT NULL,
	"settings" jsonb DEFAULT '{"temperature":0.7,"maxTokens":2000,"topP":1,"frequencyPenalty":0,"presencePenalty":0,"systemPrompt":"You are a helpful AI assistant."}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"total_cost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"username" text,
	"system" text,
	"bio" jsonb NOT NULL,
	"message_examples" jsonb DEFAULT '[]'::jsonb,
	"post_examples" jsonb DEFAULT '[]'::jsonb,
	"topics" jsonb DEFAULT '[]'::jsonb,
	"adjectives" jsonb DEFAULT '[]'::jsonb,
	"knowledge" jsonb DEFAULT '[]'::jsonb,
	"plugins" jsonb DEFAULT '[]'::jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets" jsonb DEFAULT '{}'::jsonb,
	"style" jsonb DEFAULT '{}'::jsonb,
	"character_data" jsonb NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"category" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"featured" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"interaction_count" integer DEFAULT 0 NOT NULL,
	"popularity_score" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'cloud' NOT NULL,
	"erc8004_registered" boolean DEFAULT false NOT NULL,
	"erc8004_network" text,
	"erc8004_agent_id" integer,
	"erc8004_agent_uri" text,
	"erc8004_tx_hash" text,
	"erc8004_registered_at" timestamp,
	"monetization_enabled" boolean DEFAULT false NOT NULL,
	"inference_markup_percentage" numeric(7, 2) DEFAULT '0.00' NOT NULL,
	"payout_wallet_address" text,
	"total_inference_requests" integer DEFAULT 0 NOT NULL,
	"total_creator_earnings" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"total_platform_revenue" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"a2a_enabled" boolean DEFAULT true NOT NULL,
	"mcp_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_characters_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "user_voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"elevenlabs_voice_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"clone_type" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"total_audio_duration_seconds" integer,
	"audio_quality_score" numeric(3, 2),
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"creation_cost" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_voices_elevenlabs_voice_id_unique" UNIQUE("elevenlabs_voice_id")
);
--> statement-breakpoint
CREATE TABLE "voice_cloning_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"voice_name" text NOT NULL,
	"voice_description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"user_voice_id" uuid,
	"elevenlabs_voice_id" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_voice_id" uuid,
	"job_id" uuid,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_type" text NOT NULL,
	"blob_url" text NOT NULL,
	"duration_seconds" numeric(10, 2),
	"sample_rate" integer,
	"channels" integer,
	"quality_score" numeric(3, 2),
	"is_processed" boolean DEFAULT false NOT NULL,
	"transcription" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "container_billing_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"billing_period_start" timestamp NOT NULL,
	"billing_period_end" timestamp NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"credit_transaction_id" uuid,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "containers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"project_name" text NOT NULL,
	"description" text,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"api_key_id" uuid,
	"character_id" uuid,
	"cloudformation_stack_name" text,
	"ecr_repository_uri" text,
	"ecr_image_tag" text,
	"ecs_cluster_arn" text,
	"ecs_service_arn" text,
	"ecs_task_definition_arn" text,
	"ecs_task_arn" text,
	"load_balancer_url" text,
	"is_update" text DEFAULT 'false' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"image_tag" text,
	"dockerfile_path" text,
	"environment_vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"desired_count" integer DEFAULT 1 NOT NULL,
	"cpu" integer DEFAULT 1792 NOT NULL,
	"memory" integer DEFAULT 1792 NOT NULL,
	"port" integer DEFAULT 3000 NOT NULL,
	"health_check_path" text DEFAULT '/health',
	"architecture" text DEFAULT 'arm64' NOT NULL,
	"last_deployed_at" timestamp,
	"last_health_check" timestamp,
	"deployment_log" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_billed_at" timestamp,
	"next_billing_at" timestamp,
	"billing_status" text DEFAULT 'active' NOT NULL,
	"shutdown_warning_sent_at" timestamp,
	"scheduled_shutdown_at" timestamp,
	"total_billed" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alb_priorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_name" text DEFAULT 'default' NOT NULL,
	"priority" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "alb_priorities_priority_unique" UNIQUE("priority")
);
--> statement-breakpoint
CREATE TABLE "app_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"period_type" text NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"successful_requests" integer DEFAULT 0 NOT NULL,
	"failed_requests" integer DEFAULT 0 NOT NULL,
	"unique_users" integer DEFAULT 0 NOT NULL,
	"new_users" integer DEFAULT 0 NOT NULL,
	"total_input_tokens" integer DEFAULT 0 NOT NULL,
	"total_output_tokens" integer DEFAULT 0 NOT NULL,
	"total_cost" numeric(10, 2) DEFAULT '0.00',
	"total_credits_used" numeric(10, 2) DEFAULT '0.00',
	"chat_requests" integer DEFAULT 0 NOT NULL,
	"image_requests" integer DEFAULT 0 NOT NULL,
	"video_requests" integer DEFAULT 0 NOT NULL,
	"voice_requests" integer DEFAULT 0 NOT NULL,
	"agent_requests" integer DEFAULT 0 NOT NULL,
	"avg_response_time_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"request_type" text NOT NULL,
	"source" text DEFAULT 'api_key' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"country" text,
	"city" text,
	"user_id" uuid,
	"model" text,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"credits_used" numeric(10, 6) DEFAULT '0.00',
	"response_time_ms" integer,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"signup_source" text,
	"referral_code_used" text,
	"ip_address" text,
	"user_agent" text,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"total_credits_used" numeric(10, 2) DEFAULT '0.00',
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"app_url" text NOT NULL,
	"github_repo" text,
	"allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"api_key_id" uuid,
	"affiliate_code" text,
	"referral_bonus_credits" numeric(10, 2) DEFAULT '0.00',
	"total_requests" integer DEFAULT 0 NOT NULL,
	"total_users" integer DEFAULT 0 NOT NULL,
	"total_credits_used" numeric(10, 2) DEFAULT '0.00',
	"custom_pricing_enabled" boolean DEFAULT false NOT NULL,
	"monetization_enabled" boolean DEFAULT false NOT NULL,
	"inference_markup_percentage" numeric(7, 2) DEFAULT '0.00' NOT NULL,
	"purchase_share_percentage" numeric(5, 2) DEFAULT '10.00' NOT NULL,
	"platform_offset_amount" numeric(10, 2) DEFAULT '1.00' NOT NULL,
	"total_creator_earnings" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"total_platform_revenue" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"features_enabled" jsonb DEFAULT '{"chat":true,"image":false,"video":false,"voice":false,"agents":false,"embedding":false}'::jsonb NOT NULL,
	"rate_limit_per_minute" integer DEFAULT 60,
	"rate_limit_per_hour" integer DEFAULT 1000,
	"logo_url" text,
	"website_url" text,
	"contact_email" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"twitter_automation" jsonb DEFAULT '{"enabled":false,"autoPost":false,"autoReply":false,"autoEngage":false,"discovery":false,"postIntervalMin":90,"postIntervalMax":150}'::jsonb,
	"telegram_automation" jsonb DEFAULT '{"enabled":false,"autoReply":true,"autoAnnounce":false,"announceIntervalMin":120,"announceIntervalMax":240}'::jsonb,
	"discord_automation" jsonb DEFAULT '{"enabled":false,"autoAnnounce":false,"announceIntervalMin":120,"announceIntervalMax":240}'::jsonb,
	"promotional_assets" jsonb DEFAULT '[]'::jsonb,
	"linked_character_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deployment_status" "app_deployment_status" DEFAULT 'draft' NOT NULL,
	"production_url" text,
	"last_deployed_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_approved" boolean DEFAULT true NOT NULL,
	"user_database_uri" text,
	"user_database_project_id" text,
	"user_database_branch_id" text,
	"user_database_region" text DEFAULT 'aws-us-east-1',
	"user_database_status" "user_database_status" DEFAULT 'none' NOT NULL,
	"user_database_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "apps_slug_unique" UNIQUE("slug"),
	CONSTRAINT "apps_api_key_id_unique" UNIQUE("api_key_id"),
	CONSTRAINT "apps_affiliate_code_unique" UNIQUE("affiliate_code")
);
--> statement-breakpoint
CREATE TABLE "app_credit_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"credit_balance" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_purchased" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_spent" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"total_lifetime_earnings" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"total_inference_earnings" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"total_purchase_earnings" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"pending_balance" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"withdrawable_balance" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"total_withdrawn" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"last_withdrawal_at" timestamp,
	"payout_threshold" numeric(10, 2) DEFAULT '25.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_earnings_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"amount" numeric(10, 6) NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"parent_referral_id" uuid,
	"total_referrals" integer DEFAULT 0 NOT NULL,
	"total_signup_earnings" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_qualified_earnings" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_commission_earnings" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "referral_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_code_id" uuid NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"app_owner_id" uuid,
	"creator_id" uuid,
	"signup_bonus_credited" boolean DEFAULT false NOT NULL,
	"signup_bonus_amount" numeric(10, 2) DEFAULT '0.00',
	"qualified_at" timestamp,
	"qualified_bonus_credited" boolean DEFAULT false NOT NULL,
	"qualified_bonus_amount" numeric(10, 2) DEFAULT '0.00',
	"total_commission_earned" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_share_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"share_type" "share_type" NOT NULL,
	"share_url" text,
	"share_intent_at" timestamp,
	"verified" boolean DEFAULT false NOT NULL,
	"credits_awarded" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"server_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"username" text,
	"system" text DEFAULT '',
	"bio" jsonb DEFAULT '[]'::jsonb,
	"message_examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"post_examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"adjectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"knowledge" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plugins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache" (
	"key" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "cache_key_agent_id_pk" PRIMARY KEY("key","agent_id")
);
--> statement-breakpoint
CREATE TABLE "channel_participants" (
	"channel_id" text NOT NULL,
	"entity_id" text NOT NULL,
	CONSTRAINT "channel_participants_channel_id_entity_id_pk" PRIMARY KEY("channel_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" text PRIMARY KEY NOT NULL,
	"message_server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"source_type" text,
	"source_id" text,
	"topic" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"world_id" uuid,
	"source_entity_id" uuid,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"dim_384" vector(384),
	"dim_512" vector(512),
	"dim_768" vector(768),
	"dim_1024" vector(1024),
	"dim_1536" vector(1536),
	"dim_3072" vector(3072),
	CONSTRAINT "embedding_source_check" CHECK ("memory_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"names" text[] DEFAULT '{}'::text[] NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "id_agent_id_unique" UNIQUE("id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity_id" uuid NOT NULL,
	"body" jsonb NOT NULL,
	"type" text NOT NULL,
	"room_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "long_term_memories" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"embedding" real[],
	"confidence" real DEFAULT 1,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp,
	"access_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "memory_access_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"memory_id" varchar(36) NOT NULL,
	"memory_type" text NOT NULL,
	"accessed_at" timestamp DEFAULT now() NOT NULL,
	"room_id" varchar(36),
	"relevance_score" real,
	"was_useful" integer
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"content" jsonb NOT NULL,
	"entity_id" uuid,
	"agent_id" uuid NOT NULL,
	"room_id" uuid,
	"world_id" uuid,
	"unique" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "fragment_metadata_check" CHECK (
            CASE 
                WHEN metadata->>'type' = 'fragment' THEN
                    metadata ? 'documentId' AND 
                    metadata ? 'position'
                ELSE true
            END
        ),
	CONSTRAINT "document_metadata_check" CHECK (
            CASE 
                WHEN metadata->>'type' = 'document' THEN
                    metadata ? 'timestamp'
                ELSE true
            END
        )
);
--> statement-breakpoint
CREATE TABLE "message_servers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "central_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"raw_message" jsonb,
	"in_reply_to_root_message_id" text,
	"source_type" text,
	"source_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity_id" uuid,
	"room_id" uuid,
	"agent_id" uuid,
	"room_state" text
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"tags" text[],
	"metadata" jsonb,
	CONSTRAINT "unique_relationship" UNIQUE("source_entity_id","target_entity_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"message_server_id" uuid,
	"world_id" uuid,
	"name" text,
	"metadata" jsonb,
	"channel_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_summaries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"room_id" varchar(36) NOT NULL,
	"entity_id" varchar(36),
	"summary" text NOT NULL,
	"message_count" integer NOT NULL,
	"last_message_offset" integer DEFAULT 0 NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"topics" jsonb,
	"metadata" jsonb,
	"embedding" real[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"room_id" uuid,
	"world_id" uuid,
	"entity_id" uuid,
	"agent_id" uuid NOT NULL,
	"tags" text[] DEFAULT '{}'::text[],
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"metadata" jsonb,
	"message_server_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eliza_room_characters" (
	"room_id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_ms" text,
	"container_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mcp_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"tool_name" text NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"credits_charged" numeric(10, 4) DEFAULT '0.0000',
	"x402_amount_usd" numeric(10, 6) DEFAULT '0.000000',
	"payment_type" text DEFAULT 'credits' NOT NULL,
	"creator_earnings" numeric(10, 4) DEFAULT '0.0000',
	"platform_earnings" numeric(10, 4) DEFAULT '0.0000',
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_mcps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"endpoint_type" text DEFAULT 'container' NOT NULL,
	"container_id" uuid,
	"external_endpoint" text,
	"endpoint_path" text DEFAULT '/mcp',
	"transport_type" text DEFAULT 'streamable-http' NOT NULL,
	"mcp_version" text DEFAULT '2025-06-18',
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" text DEFAULT 'utilities' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"icon" text DEFAULT 'puzzle',
	"color" text DEFAULT '#6366F1',
	"pricing_type" "mcp_pricing_type" DEFAULT 'credits' NOT NULL,
	"credits_per_request" numeric(10, 4) DEFAULT '1.0000',
	"x402_price_usd" numeric(10, 6) DEFAULT '0.000100',
	"x402_enabled" boolean DEFAULT false NOT NULL,
	"creator_share_percentage" numeric(5, 2) DEFAULT '80.00' NOT NULL,
	"platform_share_percentage" numeric(5, 2) DEFAULT '20.00' NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"total_credits_earned" numeric(12, 4) DEFAULT '0.0000',
	"total_x402_earned_usd" numeric(12, 6) DEFAULT '0.000000',
	"unique_users" integer DEFAULT 0 NOT NULL,
	"status" "mcp_status" DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"verified_by" uuid,
	"documentation_url" text,
	"source_code_url" text,
	"support_email" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"erc8004_registered" boolean DEFAULT false NOT NULL,
	"erc8004_network" text,
	"erc8004_agent_id" integer,
	"erc8004_agent_uri" text,
	"erc8004_tx_hash" text,
	"erc8004_registered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"published_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "eliza_token_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"price_usd" numeric(18, 8) NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redemption_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"daily_usd_total" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"redemption_count" numeric(5, 0) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid,
	"points_amount" numeric(12, 2) NOT NULL,
	"usd_value" numeric(12, 4) NOT NULL,
	"eliza_price_usd" numeric(18, 8) NOT NULL,
	"eliza_amount" numeric(24, 8) NOT NULL,
	"price_quote_expires_at" timestamp NOT NULL,
	"network" "redemption_network" NOT NULL,
	"payout_address" text NOT NULL,
	"address_signature" text,
	"status" "redemption_status" DEFAULT 'pending' NOT NULL,
	"processing_started_at" timestamp,
	"processing_worker_id" text,
	"tx_hash" text,
	"completed_at" timestamp,
	"failure_reason" text,
	"retry_count" numeric(3, 0) DEFAULT '0' NOT NULL,
	"requires_review" boolean DEFAULT false NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"review_notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redeemable_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"total_earned" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"total_redeemed" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"total_pending" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"available_balance" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"earned_from_miniapps" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"earned_from_agents" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"earned_from_mcps" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"earned_from_affiliates" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"earned_from_app_owner_shares" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"earned_from_creator_shares" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"last_earning_at" timestamp,
	"last_redemption_at" timestamp,
	"version" numeric(10, 0) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "redeemable_earnings_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "available_balance_non_negative" CHECK ("redeemable_earnings"."available_balance" >= 0),
	CONSTRAINT "totals_consistent" CHECK ("redeemable_earnings"."total_earned" >= "redeemable_earnings"."total_redeemed" + "redeemable_earnings"."total_pending")
);
--> statement-breakpoint
CREATE TABLE "redeemable_earnings_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_type" "ledger_entry_type" NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"balance_after" numeric(18, 4) NOT NULL,
	"earnings_source" "earnings_source",
	"source_id" uuid,
	"redemption_id" uuid,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redeemed_earnings_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"redemption_id" uuid NOT NULL,
	"amount_redeemed" numeric(18, 4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "redeemed_earnings_tracking_ledger_entry_id_unique" UNIQUE("ledger_entry_id")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"wallet_address" text NOT NULL,
	"role" "admin_role" DEFAULT 'moderator' NOT NULL,
	"granted_by" uuid,
	"granted_by_wallet" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "admin_users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "moderation_violations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"room_id" text,
	"message_text" text NOT NULL,
	"categories" jsonb NOT NULL,
	"scores" jsonb NOT NULL,
	"action" "moderation_action" NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_moderation_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "user_mod_status" DEFAULT 'clean' NOT NULL,
	"total_violations" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"risk_score" real DEFAULT 0 NOT NULL,
	"banned_by" uuid,
	"banned_at" timestamp,
	"ban_reason" text,
	"last_violation_at" timestamp,
	"last_warning_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_moderation_status_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "agent_budget_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 4) NOT NULL,
	"balance_after" numeric(12, 4) NOT NULL,
	"daily_spent_after" numeric(10, 4),
	"description" text NOT NULL,
	"operation_type" text,
	"model" text,
	"tokens_used" numeric(12, 0),
	"source_type" text,
	"source_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"allocated_budget" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"spent_budget" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"daily_limit" numeric(10, 4),
	"daily_spent" numeric(10, 4) DEFAULT '0.0000' NOT NULL,
	"daily_reset_at" timestamp,
	"auto_refill_enabled" boolean DEFAULT false NOT NULL,
	"auto_refill_amount" numeric(10, 4),
	"auto_refill_threshold" numeric(10, 4),
	"last_refill_at" timestamp,
	"is_paused" boolean DEFAULT false NOT NULL,
	"pause_on_depleted" boolean DEFAULT true NOT NULL,
	"pause_reason" text,
	"paused_at" timestamp,
	"low_budget_threshold" numeric(10, 4) DEFAULT '5.0000',
	"low_budget_alert_sent" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_budgets_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "crypto_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"payment_address" text NOT NULL,
	"token_address" text,
	"token" text NOT NULL,
	"network" text NOT NULL,
	"expected_amount" text NOT NULL,
	"received_amount" text,
	"credits_to_add" text NOT NULL,
	"transaction_hash" text,
	"block_number" text,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "app_builder_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"files_affected" jsonb DEFAULT '[]'::jsonb,
	"commit_sha" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "app_sandbox_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"sandbox_id" text,
	"sandbox_url" text,
	"git_branch" text DEFAULT 'main' NOT NULL,
	"last_commit_sha" text,
	"status" text DEFAULT 'initializing' NOT NULL,
	"status_message" text,
	"app_name" text,
	"app_description" text,
	"initial_prompt" text,
	"template_type" text DEFAULT 'blank',
	"build_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"claude_session_id" text,
	"claude_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cpu_seconds_used" integer DEFAULT 0 NOT NULL,
	"memory_mb_peak" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"stopped_at" timestamp,
	"expires_at" timestamp,
	CONSTRAINT "app_sandbox_sessions_sandbox_id_unique" UNIQUE("sandbox_id")
);
--> statement-breakpoint
CREATE TABLE "app_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"preview_image_url" text,
	"github_repo" text NOT NULL,
	"github_branch" text DEFAULT 'main',
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"system_prompt" text,
	"example_prompts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sandbox_template_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" text NOT NULL,
	"template_key" text NOT NULL,
	"github_repo" text,
	"github_commit_sha" text,
	"node_modules_size_mb" integer,
	"total_files" integer,
	"status" text DEFAULT 'creating' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_used_at" timestamp,
	"usage_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sandbox_template_snapshots_snapshot_id_unique" UNIQUE("snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "session_file_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_session_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"snapshot_type" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_restore_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_session_id" uuid NOT NULL,
	"old_sandbox_id" text,
	"new_sandbox_id" text,
	"files_restored" integer DEFAULT 0 NOT NULL,
	"restore_duration_ms" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"provider" text NOT NULL,
	"event_type" text,
	"payload_hash" text NOT NULL,
	"source_ip" text,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	"event_timestamp" timestamp,
	CONSTRAINT "webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "app_secret_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"secret_name" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"provider_account_id" text,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"token_type" text DEFAULT 'Bearer',
	"encryption_key_id" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"refresh_encrypted_dek" text,
	"refresh_nonce" text,
	"refresh_auth_tag" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"encrypted_provider_data" text,
	"provider_data_nonce" text,
	"provider_data_auth_tag" text,
	"last_used_at" timestamp,
	"last_refreshed_at" timestamp,
	"refresh_count" integer DEFAULT 0 NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp,
	"revoke_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secret_id" uuid,
	"oauth_session_id" uuid,
	"organization_id" uuid NOT NULL,
	"action" "secret_audit_action" NOT NULL,
	"secret_name" text,
	"actor_type" "secret_actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text,
	"ip_address" text,
	"user_agent" text,
	"source" text,
	"request_id" text,
	"endpoint" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"secret_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_type" "secret_project_type" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" "secret_scope" DEFAULT 'organization' NOT NULL,
	"project_id" uuid,
	"project_type" text,
	"environment" "secret_environment",
	"name" text NOT NULL,
	"description" text,
	"provider" "secret_provider",
	"provider_metadata" jsonb,
	"encrypted_value" text NOT NULL,
	"encryption_key_id" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_rotated_at" timestamp,
	"expires_at" timestamp,
	"created_by" uuid NOT NULL,
	"last_accessed_at" timestamp,
	"access_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"subdomain" text NOT NULL,
	"custom_domain" text,
	"custom_domain_verified" boolean DEFAULT false NOT NULL,
	"verification_records" jsonb DEFAULT '[]'::jsonb,
	"ssl_status" text DEFAULT 'pending' NOT NULL,
	"ssl_error" text,
	"vercel_project_id" text,
	"vercel_domain_id" text,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "org_feed_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_platform" text NOT NULL,
	"source_account_id" text NOT NULL,
	"source_username" text,
	"credential_id" uuid,
	"monitor_mentions" boolean DEFAULT true NOT NULL,
	"monitor_replies" boolean DEFAULT true NOT NULL,
	"monitor_quote_tweets" boolean DEFAULT true NOT NULL,
	"monitor_reposts" boolean DEFAULT false NOT NULL,
	"monitor_likes" boolean DEFAULT false NOT NULL,
	"notification_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"polling_interval_seconds" integer DEFAULT 60 NOT NULL,
	"min_follower_count" integer,
	"filter_keywords" jsonb DEFAULT '[]'::jsonb,
	"filter_mode" text DEFAULT 'include',
	"last_polled_at" timestamp with time zone,
	"last_seen_id" text,
	"poll_error_count" integer DEFAULT 0 NOT NULL,
	"last_poll_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "pending_reply_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_event_id" uuid,
	"target_platform" text NOT NULL,
	"target_post_id" text NOT NULL,
	"target_post_url" text,
	"source_platform" text NOT NULL,
	"source_channel_id" text NOT NULL,
	"source_server_id" text,
	"source_message_id" text NOT NULL,
	"source_user_id" text NOT NULL,
	"source_username" text,
	"source_user_display_name" text,
	"reply_content" text NOT NULL,
	"reply_media_urls" jsonb DEFAULT '[]'::jsonb,
	"status" "reply_confirmation_status" DEFAULT 'pending' NOT NULL,
	"confirmation_message_id" text,
	"confirmation_channel_id" text,
	"confirmed_by_user_id" text,
	"confirmed_by_username" text,
	"confirmed_at" timestamp with time zone,
	"rejection_reason" text,
	"sent_post_id" text,
	"sent_post_url" text,
	"sent_at" timestamp with time zone,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_engagement_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"feed_config_id" uuid NOT NULL,
	"event_type" "social_engagement_type" NOT NULL,
	"source_platform" text NOT NULL,
	"source_post_id" text NOT NULL,
	"source_post_url" text,
	"author_id" text NOT NULL,
	"author_username" text,
	"author_display_name" text,
	"author_avatar_url" text,
	"author_follower_count" integer,
	"author_verified" boolean DEFAULT false,
	"original_post_id" text,
	"original_post_url" text,
	"original_post_content" text,
	"content" text,
	"content_html" text,
	"media_urls" jsonb DEFAULT '[]'::jsonb,
	"processed_at" timestamp with time zone,
	"notification_sent_at" timestamp with time zone,
	"notification_channel_ids" jsonb DEFAULT '[]'::jsonb,
	"notification_message_ids" jsonb DEFAULT '{}'::jsonb,
	"raw_data" jsonb,
	"engagement_metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_notification_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_event_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"channel_id" text NOT NULL,
	"server_id" text,
	"message_id" text NOT NULL,
	"thread_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"registrar" "domain_registrar" DEFAULT 'vercel' NOT NULL,
	"vercel_domain_id" text,
	"registered_at" timestamp,
	"expires_at" timestamp,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"registrant_info" jsonb,
	"resource_type" "domain_resource_type",
	"app_id" uuid,
	"container_id" uuid,
	"agent_id" uuid,
	"mcp_id" uuid,
	"nameserver_mode" "domain_nameserver_mode" DEFAULT 'vercel' NOT NULL,
	"dns_records" jsonb DEFAULT '[]'::jsonb,
	"ssl_status" text DEFAULT 'pending',
	"ssl_expires_at" timestamp,
	"verified" boolean DEFAULT false NOT NULL,
	"verification_token" text,
	"verified_at" timestamp,
	"moderation_status" "domain_moderation_status" DEFAULT 'clean' NOT NULL,
	"moderation_flags" jsonb DEFAULT '[]'::jsonb,
	"last_health_check" timestamp,
	"is_live" boolean DEFAULT false NOT NULL,
	"health_check_error" text,
	"content_hash" text,
	"last_content_scan_at" timestamp,
	"last_ai_scan_at" timestamp,
	"ai_scan_model" text,
	"content_scan_confidence" real,
	"content_scan_cache" jsonb,
	"suspended_at" timestamp,
	"suspension_reason" text,
	"suspension_notification" jsonb,
	"owner_notified_at" timestamp,
	"purchase_price" text,
	"renewal_price" text,
	"payment_method" text,
	"stripe_payment_intent_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "managed_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "domain_moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"event_type" "domain_event_type" NOT NULL,
	"severity" "domain_event_severity" NOT NULL,
	"description" text NOT NULL,
	"detected_by" "domain_event_detected_by" NOT NULL,
	"admin_user_id" uuid,
	"evidence" jsonb,
	"action_taken" text,
	"previous_status" text,
	"new_status" text,
	"resolved_at" timestamp,
	"resolved_by" uuid,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_credential_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"app_id" uuid,
	"requesting_user_id" uuid,
	"platform" "platform_credential_type" NOT NULL,
	"requested_scopes" jsonb DEFAULT '[]'::jsonb,
	"oauth_state" text NOT NULL,
	"callback_url" text,
	"callback_type" text,
	"callback_context" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"credential_id" uuid,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "platform_credential_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "platform_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"app_id" uuid,
	"platform" "platform_credential_type" NOT NULL,
	"platform_user_id" text NOT NULL,
	"platform_username" text,
	"platform_display_name" text,
	"platform_avatar_url" text,
	"platform_email" text,
	"status" "platform_credential_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"access_token_secret_id" uuid,
	"refresh_token_secret_id" uuid,
	"token_expires_at" timestamp,
	"scopes" jsonb DEFAULT '[]'::jsonb,
	"api_key_secret_id" uuid,
	"granted_permissions" jsonb DEFAULT '[]'::jsonb,
	"source_type" text,
	"source_context" jsonb,
	"profile_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"linked_at" timestamp,
	"last_used_at" timestamp,
	"last_refreshed_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_checkin_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"responder_platform_id" text NOT NULL,
	"responder_platform" "org_platform_type" NOT NULL,
	"responder_name" text,
	"responder_avatar" text,
	"answers" jsonb NOT NULL,
	"sentiment_score" text,
	"blockers_detected" boolean DEFAULT false,
	"blockers" jsonb DEFAULT '[]'::jsonb,
	"source_message_id" text,
	"source_channel_id" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"checkin_date" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_checkin_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"checkin_type" "org_checkin_type" DEFAULT 'standup' NOT NULL,
	"frequency" "org_checkin_frequency" DEFAULT 'weekdays' NOT NULL,
	"time_utc" text DEFAULT '09:00' NOT NULL,
	"timezone" text DEFAULT 'UTC',
	"checkin_channel_id" text NOT NULL,
	"report_channel_id" text,
	"questions" jsonb DEFAULT '["What did you accomplish yesterday?","What are you working on today?","Any blockers?"]'::jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_platform_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connected_by" uuid NOT NULL,
	"platform" "org_platform_type" NOT NULL,
	"platform_bot_id" text NOT NULL,
	"platform_bot_username" text,
	"platform_bot_name" text,
	"status" "org_platform_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"last_health_check" timestamp,
	"oauth_access_token_secret_id" uuid,
	"oauth_refresh_token_secret_id" uuid,
	"oauth_expires_at" timestamp,
	"oauth_scopes" jsonb DEFAULT '[]'::jsonb,
	"bot_token_secret_id" uuid,
	"metadata" jsonb,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"disconnected_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_platform_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"server_id" text NOT NULL,
	"server_name" text,
	"server_icon" text,
	"member_count" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"enabled_agents" jsonb DEFAULT '["community_manager","project_manager"]'::jsonb,
	"agent_settings" jsonb,
	"channel_mappings" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"platform_user_id" text NOT NULL,
	"platform" "org_platform_type" NOT NULL,
	"display_name" text,
	"username" text,
	"avatar_url" text,
	"role" text,
	"is_admin" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"availability" jsonb,
	"total_checkins" text DEFAULT '0',
	"last_checkin_at" timestamp,
	"checkin_streak" text DEFAULT '0',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" "org_todo_status" DEFAULT 'pending' NOT NULL,
	"priority" "org_todo_priority" DEFAULT 'medium' NOT NULL,
	"assignee_platform_id" text,
	"assignee_platform" "org_platform_type",
	"assignee_name" text,
	"due_date" timestamp,
	"source_platform" text,
	"source_server_id" text,
	"source_channel_id" text,
	"source_message_id" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"related_checkin_id" uuid,
	"related_project" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ad_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connected_by_user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_account_id" text NOT NULL,
	"account_name" text NOT NULL,
	"access_token_secret_id" uuid,
	"refresh_token_secret_id" uuid,
	"token_expires_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"external_campaign_id" text,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"objective" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"budget_type" text NOT NULL,
	"budget_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"budget_currency" text DEFAULT 'USD' NOT NULL,
	"credits_allocated" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"credits_spent" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"targeting" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_spend" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_impressions" integer DEFAULT 0 NOT NULL,
	"total_clicks" integer DEFAULT 0 NOT NULL,
	"total_conversions" integer DEFAULT 0 NOT NULL,
	"app_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_creatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"external_creative_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"headline" text,
	"primary_text" text,
	"description" text,
	"call_to_action" text,
	"destination_url" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"campaign_id" uuid,
	"credit_transaction_id" uuid,
	"type" text NOT NULL,
	"amount" numeric(12, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"credits_amount" numeric(12, 4) NOT NULL,
	"description" text NOT NULL,
	"external_reference" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"type" "seo_artifact_type" NOT NULL,
	"provider" "seo_provider" NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_provider_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"provider" "seo_provider" NOT NULL,
	"operation" text NOT NULL,
	"status" "seo_provider_status" DEFAULT 'pending' NOT NULL,
	"external_id" text,
	"cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"app_id" uuid,
	"user_id" uuid,
	"api_key_id" uuid,
	"type" "seo_request_type" NOT NULL,
	"status" "seo_request_status" DEFAULT 'pending' NOT NULL,
	"page_url" text,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"search_engine" text DEFAULT 'google' NOT NULL,
	"device" text DEFAULT 'desktop' NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"agent_identifier" text,
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"prompt_context" text,
	"idempotency_key" text,
	"total_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"error" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"chat_id" bigint NOT NULL,
	"chat_type" text NOT NULL,
	"title" text NOT NULL,
	"username" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"can_post_messages" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_guilds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"guild_name" text NOT NULL,
	"icon_hash" text,
	"owner_id" text,
	"bot_permissions" text,
	"bot_joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"channel_type" integer NOT NULL,
	"parent_id" text,
	"position" integer,
	"can_send_messages" boolean DEFAULT true NOT NULL,
	"can_embed_links" boolean DEFAULT true NOT NULL,
	"can_attach_files" boolean DEFAULT true NOT NULL,
	"is_nsfw" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"character_id" uuid,
	"application_id" text NOT NULL,
	"bot_user_id" text,
	"bot_token_encrypted" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"token_nonce" text NOT NULL,
	"token_auth_tag" text NOT NULL,
	"encryption_key_id" text NOT NULL,
	"assigned_pod" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"guild_count" integer DEFAULT 0,
	"events_received" integer DEFAULT 0,
	"events_routed" integer DEFAULT 0,
	"last_heartbeat" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"intents" integer DEFAULT 38401,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"phone_number" text NOT NULL,
	"friendly_name" text,
	"provider" "phone_provider" NOT NULL,
	"phone_type" "phone_type" DEFAULT 'sms' NOT NULL,
	"provider_phone_id" text,
	"webhook_url" text,
	"webhook_configured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"can_send_sms" boolean DEFAULT true NOT NULL,
	"can_receive_sms" boolean DEFAULT true NOT NULL,
	"can_send_mms" boolean DEFAULT false NOT NULL,
	"can_receive_mms" boolean DEFAULT false NOT NULL,
	"can_voice" boolean DEFAULT false NOT NULL,
	"max_messages_per_minute" text DEFAULT '60',
	"max_messages_per_day" text DEFAULT '1000',
	"metadata" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_message_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "phone_message_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"message_body" text,
	"message_type" text DEFAULT 'sms' NOT NULL,
	"media_urls" text,
	"provider_message_id" text,
	"status" text DEFAULT 'received' NOT NULL,
	"error_message" text,
	"agent_response" text,
	"response_time_ms" text,
	"metadata" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "idempotency_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "entity_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid,
	"key" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"encryption_key_id" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"markup_percent" numeric(6, 2) DEFAULT '20.00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "markup_percent_range" CHECK ("affiliate_codes"."markup_percent" >= 0 AND "affiliate_codes"."markup_percent" <= 1000)
);
--> statement-breakpoint
CREATE TABLE "user_affiliates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"affiliate_code_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_server_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" uuid,
	"privy_wallet_id" text NOT NULL,
	"address" text NOT NULL,
	"chain_type" text NOT NULL,
	"client_address" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anonymous_sessions" ADD CONSTRAINT "anonymous_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_auth_sessions" ADD CONSTRAINT "cli_auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_quotas" ADD CONSTRAINT "usage_quotas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_usage_record_id_usage_records_id_fk" FOREIGN KEY ("usage_record_id") REFERENCES "public"."usage_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_usage_record_id_usage_records_id_fk" FOREIGN KEY ("usage_record_id") REFERENCES "public"."usage_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_characters" ADD CONSTRAINT "user_characters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_characters" ADD CONSTRAINT "user_characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_voices" ADD CONSTRAINT "user_voices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_voices" ADD CONSTRAINT "user_voices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cloning_jobs" ADD CONSTRAINT "voice_cloning_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cloning_jobs" ADD CONSTRAINT "voice_cloning_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cloning_jobs" ADD CONSTRAINT "voice_cloning_jobs_user_voice_id_user_voices_id_fk" FOREIGN KEY ("user_voice_id") REFERENCES "public"."user_voices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_user_voice_id_user_voices_id_fk" FOREIGN KEY ("user_voice_id") REFERENCES "public"."user_voices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_job_id_voice_cloning_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."voice_cloning_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_billing_records" ADD CONSTRAINT "container_billing_records_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_billing_records" ADD CONSTRAINT "container_billing_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_billing_records" ADD CONSTRAINT "container_billing_records_credit_transaction_id_credit_transactions_id_fk" FOREIGN KEY ("credit_transaction_id") REFERENCES "public"."credit_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_character_id_user_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."user_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_analytics" ADD CONSTRAINT "app_analytics_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_requests" ADD CONSTRAINT "app_requests_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_requests" ADD CONSTRAINT "app_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_credit_balances" ADD CONSTRAINT "app_credit_balances_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_credit_balances" ADD CONSTRAINT "app_credit_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_credit_balances" ADD CONSTRAINT "app_credit_balances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_earnings" ADD CONSTRAINT "app_earnings_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_earnings_transactions" ADD CONSTRAINT "app_earnings_transactions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_earnings_transactions" ADD CONSTRAINT "app_earnings_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_signups" ADD CONSTRAINT "referral_signups_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_signups" ADD CONSTRAINT "referral_signups_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_signups" ADD CONSTRAINT "referral_signups_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_signups" ADD CONSTRAINT "referral_signups_app_owner_id_users_id_fk" FOREIGN KEY ("app_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_signups" ADD CONSTRAINT "referral_signups_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_share_rewards" ADD CONSTRAINT "social_share_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cache" ADD CONSTRAINT "cache_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_participants" ADD CONSTRAINT "channel_participants_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_message_server_id_message_servers_id_fk" FOREIGN KEY ("message_server_id") REFERENCES "public"."message_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_source_entity_id_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "fk_embedding_memory" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "fk_room" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "fk_user" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "fk_room" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "fk_user" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "fk_agent" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_messages" ADD CONSTRAINT "central_messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_messages" ADD CONSTRAINT "central_messages_in_reply_to_root_message_id_central_messages_id_fk" FOREIGN KEY ("in_reply_to_root_message_id") REFERENCES "public"."central_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "fk_room" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "fk_user" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_entity_id_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "fk_user_a" FOREIGN KEY ("source_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "fk_user_b" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eliza_room_characters" ADD CONSTRAINT "eliza_room_characters_character_id_user_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."user_characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_agent_id_user_characters_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user_characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_usage" ADD CONSTRAINT "mcp_usage_mcp_id_user_mcps_id_fk" FOREIGN KEY ("mcp_id") REFERENCES "public"."user_mcps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_usage" ADD CONSTRAINT "mcp_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_usage" ADD CONSTRAINT "mcp_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mcps" ADD CONSTRAINT "user_mcps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mcps" ADD CONSTRAINT "user_mcps_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mcps" ADD CONSTRAINT "user_mcps_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mcps" ADD CONSTRAINT "user_mcps_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_limits" ADD CONSTRAINT "redemption_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_redemptions" ADD CONSTRAINT "token_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_redemptions" ADD CONSTRAINT "token_redemptions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_redemptions" ADD CONSTRAINT "token_redemptions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redeemable_earnings" ADD CONSTRAINT "redeemable_earnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redeemable_earnings_ledger" ADD CONSTRAINT "redeemable_earnings_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_violations" ADD CONSTRAINT "moderation_violations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_violations" ADD CONSTRAINT "moderation_violations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_moderation_status" ADD CONSTRAINT "user_moderation_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_moderation_status" ADD CONSTRAINT "user_moderation_status_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_budget_transactions" ADD CONSTRAINT "agent_budget_transactions_budget_id_agent_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."agent_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_budget_transactions" ADD CONSTRAINT "agent_budget_transactions_agent_id_user_characters_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user_characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_budgets" ADD CONSTRAINT "agent_budgets_agent_id_user_characters_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user_characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_budgets" ADD CONSTRAINT "agent_budgets_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_payments" ADD CONSTRAINT "crypto_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_payments" ADD CONSTRAINT "crypto_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_builder_prompts" ADD CONSTRAINT "app_builder_prompts_sandbox_session_id_app_sandbox_sessions_id_fk" FOREIGN KEY ("sandbox_session_id") REFERENCES "public"."app_sandbox_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_sandbox_sessions" ADD CONSTRAINT "app_sandbox_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_sandbox_sessions" ADD CONSTRAINT "app_sandbox_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_sandbox_sessions" ADD CONSTRAINT "app_sandbox_sessions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_file_snapshots" ADD CONSTRAINT "session_file_snapshots_sandbox_session_id_app_sandbox_sessions_id_fk" FOREIGN KEY ("sandbox_session_id") REFERENCES "public"."app_sandbox_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_restore_history" ADD CONSTRAINT "session_restore_history_sandbox_session_id_app_sandbox_sessions_id_fk" FOREIGN KEY ("sandbox_session_id") REFERENCES "public"."app_sandbox_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_secret_requirements" ADD CONSTRAINT "app_secret_requirements_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_secret_requirements" ADD CONSTRAINT "app_secret_requirements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_sessions" ADD CONSTRAINT "oauth_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_sessions" ADD CONSTRAINT "oauth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_bindings" ADD CONSTRAINT "secret_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_bindings" ADD CONSTRAINT "secret_bindings_secret_id_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."secrets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_bindings" ADD CONSTRAINT "secret_bindings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_domains" ADD CONSTRAINT "app_domains_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_feed_configs" ADD CONSTRAINT "org_feed_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_feed_configs" ADD CONSTRAINT "org_feed_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_reply_confirmations" ADD CONSTRAINT "pending_reply_confirmations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_reply_confirmations" ADD CONSTRAINT "pending_reply_confirmations_engagement_event_id_social_engagement_events_id_fk" FOREIGN KEY ("engagement_event_id") REFERENCES "public"."social_engagement_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_engagement_events" ADD CONSTRAINT "social_engagement_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_engagement_events" ADD CONSTRAINT "social_engagement_events_feed_config_id_org_feed_configs_id_fk" FOREIGN KEY ("feed_config_id") REFERENCES "public"."org_feed_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_notification_messages" ADD CONSTRAINT "social_notification_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_notification_messages" ADD CONSTRAINT "social_notification_messages_engagement_event_id_social_engagement_events_id_fk" FOREIGN KEY ("engagement_event_id") REFERENCES "public"."social_engagement_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_domains" ADD CONSTRAINT "managed_domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_domains" ADD CONSTRAINT "managed_domains_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_domains" ADD CONSTRAINT "managed_domains_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_domains" ADD CONSTRAINT "managed_domains_agent_id_user_characters_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_domains" ADD CONSTRAINT "managed_domains_mcp_id_user_mcps_id_fk" FOREIGN KEY ("mcp_id") REFERENCES "public"."user_mcps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_moderation_events" ADD CONSTRAINT "domain_moderation_events_domain_id_managed_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."managed_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_moderation_events" ADD CONSTRAINT "domain_moderation_events_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_moderation_events" ADD CONSTRAINT "domain_moderation_events_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credential_sessions" ADD CONSTRAINT "platform_credential_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credential_sessions" ADD CONSTRAINT "platform_credential_sessions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credential_sessions" ADD CONSTRAINT "platform_credential_sessions_requesting_user_id_users_id_fk" FOREIGN KEY ("requesting_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credential_sessions" ADD CONSTRAINT "platform_credential_sessions_credential_id_platform_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."platform_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credentials" ADD CONSTRAINT "platform_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credentials" ADD CONSTRAINT "platform_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credentials" ADD CONSTRAINT "platform_credentials_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_checkin_responses" ADD CONSTRAINT "org_checkin_responses_schedule_id_org_checkin_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."org_checkin_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_checkin_responses" ADD CONSTRAINT "org_checkin_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_checkin_schedules" ADD CONSTRAINT "org_checkin_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_checkin_schedules" ADD CONSTRAINT "org_checkin_schedules_server_id_org_platform_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."org_platform_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_checkin_schedules" ADD CONSTRAINT "org_checkin_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_platform_connections" ADD CONSTRAINT "org_platform_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_platform_connections" ADD CONSTRAINT "org_platform_connections_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_platform_servers" ADD CONSTRAINT "org_platform_servers_connection_id_org_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."org_platform_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_platform_servers" ADD CONSTRAINT "org_platform_servers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_team_members" ADD CONSTRAINT "org_team_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_team_members" ADD CONSTRAINT "org_team_members_server_id_org_platform_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."org_platform_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_todos" ADD CONSTRAINT "org_todos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_todos" ADD CONSTRAINT "org_todos_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_access_token_secret_id_secrets_id_fk" FOREIGN KEY ("access_token_secret_id") REFERENCES "public"."secrets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_refresh_token_secret_id_secrets_id_fk" FOREIGN KEY ("refresh_token_secret_id") REFERENCES "public"."secrets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_transactions" ADD CONSTRAINT "ad_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_transactions" ADD CONSTRAINT "ad_transactions_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_transactions" ADD CONSTRAINT "ad_transactions_credit_transaction_id_credit_transactions_id_fk" FOREIGN KEY ("credit_transaction_id") REFERENCES "public"."credit_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_artifacts" ADD CONSTRAINT "seo_artifacts_request_id_seo_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."seo_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_provider_calls" ADD CONSTRAINT "seo_provider_calls_request_id_seo_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."seo_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_requests" ADD CONSTRAINT "seo_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_requests" ADD CONSTRAINT "seo_requests_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_requests" ADD CONSTRAINT "seo_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_requests" ADD CONSTRAINT "seo_requests_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_guilds" ADD CONSTRAINT "discord_guilds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_channels" ADD CONSTRAINT "discord_channels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_connections" ADD CONSTRAINT "discord_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_connections" ADD CONSTRAINT "discord_connections_character_id_user_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."user_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_phone_numbers" ADD CONSTRAINT "agent_phone_numbers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_message_log" ADD CONSTRAINT "phone_message_log_phone_number_id_agent_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "public"."agent_phone_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_settings" ADD CONSTRAINT "entity_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_codes" ADD CONSTRAINT "affiliate_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_affiliates" ADD CONSTRAINT "user_affiliates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_affiliates" ADD CONSTRAINT "user_affiliates_affiliate_code_id_affiliate_codes_id_fk" FOREIGN KEY ("affiliate_code_id") REFERENCES "public"."affiliate_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_server_wallets" ADD CONSTRAINT "agent_server_wallets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_server_wallets" ADD CONSTRAINT "agent_server_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_server_wallets" ADD CONSTRAINT "agent_server_wallets_character_id_user_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."user_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_stripe_customer_idx" ON "organizations" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "organizations_auto_top_up_enabled_idx" ON "organizations" USING btree ("auto_top_up_enabled");--> statement-breakpoint
CREATE INDEX "organization_invites_org_id_idx" ON "organization_invites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_invites_email_idx" ON "organization_invites" USING btree ("invited_email");--> statement-breakpoint
CREATE INDEX "organization_invites_token_idx" ON "organization_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "organization_invites_status_idx" ON "organization_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_wallet_address_idx" ON "users" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "users_wallet_chain_type_idx" ON "users" USING btree ("wallet_chain_type");--> statement-breakpoint
CREATE INDEX "users_organization_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_is_active_idx" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "users_privy_user_id_idx" ON "users" USING btree ("privy_user_id");--> statement-breakpoint
CREATE INDEX "users_is_anonymous_idx" ON "users" USING btree ("is_anonymous");--> statement-breakpoint
CREATE INDEX "users_anonymous_session_idx" ON "users" USING btree ("anonymous_session_id");--> statement-breakpoint
CREATE INDEX "users_expires_at_idx" ON "users" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_work_function_idx" ON "users" USING btree ("work_function");--> statement-breakpoint
CREATE INDEX "users_telegram_id_idx" ON "users" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "users_phone_number_idx" ON "users" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "users_discord_id_idx" ON "users" USING btree ("discord_id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_org_id_idx" ON "user_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_sessions_token_idx" ON "user_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "user_sessions_started_at_idx" ON "user_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "user_sessions_active_idx" ON "user_sessions" USING btree ("ended_at");--> statement-breakpoint
CREATE INDEX "anon_sessions_token_idx" ON "anonymous_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "anon_sessions_user_id_idx" ON "anonymous_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "anon_sessions_expires_at_idx" ON "anonymous_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "anon_sessions_ip_address_idx" ON "anonymous_sessions" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "anon_sessions_is_active_idx" ON "anonymous_sessions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "api_keys_key_idx" ON "api_keys" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "api_keys_organization_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cli_auth_sessions_session_id_idx" ON "cli_auth_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "cli_auth_sessions_status_idx" ON "cli_auth_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cli_auth_sessions_user_id_idx" ON "cli_auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cli_auth_sessions_expires_at_idx" ON "cli_auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "usage_records_organization_idx" ON "usage_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "usage_records_user_idx" ON "usage_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_records_api_key_idx" ON "usage_records" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "usage_records_type_idx" ON "usage_records" USING btree ("type");--> statement-breakpoint
CREATE INDEX "usage_records_provider_idx" ON "usage_records" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "usage_records_created_at_idx" ON "usage_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_records_org_created_idx" ON "usage_records" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_records_org_type_created_idx" ON "usage_records" USING btree ("organization_id","type","created_at");--> statement-breakpoint
CREATE INDEX "usage_quotas_org_id_idx" ON "usage_quotas" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "usage_quotas_quota_type_idx" ON "usage_quotas" USING btree ("quota_type");--> statement-breakpoint
CREATE INDEX "usage_quotas_period_idx" ON "usage_quotas" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "usage_quotas_active_idx" ON "usage_quotas" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "credit_transactions_organization_idx" ON "credit_transactions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_user_idx" ON "credit_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_type_idx" ON "credit_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "credit_transactions_created_at_idx" ON "credit_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transactions_stripe_payment_intent_idx" ON "credit_transactions" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "credit_packs_stripe_price_idx" ON "credit_packs" USING btree ("stripe_price_id");--> statement-breakpoint
CREATE INDEX "credit_packs_active_idx" ON "credit_packs" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "credit_packs_sort_idx" ON "credit_packs" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "invoices_organization_idx" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoices_stripe_invoice_idx" ON "invoices" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "generations_organization_idx" ON "generations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "generations_user_idx" ON "generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "generations_api_key_idx" ON "generations" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "generations_type_idx" ON "generations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "generations_status_idx" ON "generations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "generations_created_at_idx" ON "generations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "generations_org_type_status_idx" ON "generations" USING btree ("organization_id","type","status");--> statement-breakpoint
CREATE INDEX "generations_org_status_user_created_idx" ON "generations" USING btree ("organization_id","status","user_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_type_idx" ON "jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_scheduled_for_idx" ON "jobs" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "jobs_organization_idx" ON "jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "model_pricing_provider_model_idx" ON "model_pricing" USING btree ("provider","model");--> statement-breakpoint
CREATE INDEX "model_pricing_active_idx" ON "model_pricing" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "provider_health_provider_idx" ON "provider_health" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "provider_health_status_idx" ON "provider_health" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conv_messages_conversation_idx" ON "conversation_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conv_messages_sequence_idx" ON "conversation_messages" USING btree ("conversation_id","sequence_number");--> statement-breakpoint
CREATE INDEX "conv_messages_created_idx" ON "conversation_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversations_organization_idx" ON "conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "conversations_user_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_updated_idx" ON "conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_characters_organization_idx" ON "user_characters" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_characters_user_idx" ON "user_characters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_characters_name_idx" ON "user_characters" USING btree ("name");--> statement-breakpoint
CREATE INDEX "user_characters_username_idx" ON "user_characters" USING btree ("username");--> statement-breakpoint
CREATE INDEX "user_characters_category_idx" ON "user_characters" USING btree ("category");--> statement-breakpoint
CREATE INDEX "user_characters_featured_idx" ON "user_characters" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "user_characters_is_template_idx" ON "user_characters" USING btree ("is_template");--> statement-breakpoint
CREATE INDEX "user_characters_is_public_idx" ON "user_characters" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "user_characters_popularity_idx" ON "user_characters" USING btree ("popularity_score");--> statement-breakpoint
CREATE INDEX "user_characters_source_idx" ON "user_characters" USING btree ("source");--> statement-breakpoint
CREATE INDEX "user_characters_erc8004_idx" ON "user_characters" USING btree ("erc8004_registered");--> statement-breakpoint
CREATE INDEX "user_characters_erc8004_agent_idx" ON "user_characters" USING btree ("erc8004_network","erc8004_agent_id");--> statement-breakpoint
CREATE INDEX "user_characters_monetization_idx" ON "user_characters" USING btree ("monetization_enabled");--> statement-breakpoint
CREATE INDEX "user_voices_organization_idx" ON "user_voices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_voices_user_idx" ON "user_voices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_voices_org_type_idx" ON "user_voices" USING btree ("organization_id","clone_type");--> statement-breakpoint
CREATE INDEX "user_voices_org_usage_idx" ON "user_voices" USING btree ("organization_id","usage_count","last_used_at");--> statement-breakpoint
CREATE INDEX "container_billing_records_container_idx" ON "container_billing_records" USING btree ("container_id");--> statement-breakpoint
CREATE INDEX "container_billing_records_org_idx" ON "container_billing_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "container_billing_records_created_idx" ON "container_billing_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "container_billing_records_status_idx" ON "container_billing_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "containers_organization_idx" ON "containers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "containers_user_idx" ON "containers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "containers_status_idx" ON "containers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "containers_character_idx" ON "containers" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "containers_ecs_service_idx" ON "containers" USING btree ("ecs_service_arn");--> statement-breakpoint
CREATE INDEX "containers_ecr_repository_idx" ON "containers" USING btree ("ecr_repository_uri");--> statement-breakpoint
CREATE INDEX "containers_project_name_idx" ON "containers" USING btree ("project_name");--> statement-breakpoint
CREATE INDEX "containers_user_project_idx" ON "containers" USING btree ("user_id","project_name");--> statement-breakpoint
CREATE INDEX "containers_billing_status_idx" ON "containers" USING btree ("billing_status");--> statement-breakpoint
CREATE INDEX "containers_next_billing_idx" ON "containers" USING btree ("next_billing_at");--> statement-breakpoint
CREATE INDEX "containers_scheduled_shutdown_idx" ON "containers" USING btree ("scheduled_shutdown_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alb_priorities_user_project_idx" ON "alb_priorities" USING btree ("user_id","project_name");--> statement-breakpoint
CREATE INDEX "app_analytics_app_id_idx" ON "app_analytics" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_analytics_period_idx" ON "app_analytics" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "app_analytics_period_type_idx" ON "app_analytics" USING btree ("period_type");--> statement-breakpoint
CREATE INDEX "app_analytics_app_period_idx" ON "app_analytics" USING btree ("app_id","period_start");--> statement-breakpoint
CREATE INDEX "app_requests_app_id_idx" ON "app_requests" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_requests_created_at_idx" ON "app_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "app_requests_type_idx" ON "app_requests" USING btree ("request_type");--> statement-breakpoint
CREATE INDEX "app_requests_source_idx" ON "app_requests" USING btree ("source");--> statement-breakpoint
CREATE INDEX "app_requests_ip_idx" ON "app_requests" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "app_requests_app_created_idx" ON "app_requests" USING btree ("app_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_app_user_idx" ON "app_users" USING btree ("app_id","user_id");--> statement-breakpoint
CREATE INDEX "app_users_app_id_idx" ON "app_users" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_users_user_id_idx" ON "app_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_users_first_seen_idx" ON "app_users" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "apps_slug_idx" ON "apps" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "apps_organization_idx" ON "apps" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "apps_created_by_idx" ON "apps" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "apps_affiliate_code_idx" ON "apps" USING btree ("affiliate_code");--> statement-breakpoint
CREATE INDEX "apps_is_active_idx" ON "apps" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "apps_created_at_idx" ON "apps" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "apps_user_database_status_idx" ON "apps" USING btree ("user_database_status");--> statement-breakpoint
CREATE UNIQUE INDEX "app_credit_balances_app_user_idx" ON "app_credit_balances" USING btree ("app_id","user_id");--> statement-breakpoint
CREATE INDEX "app_credit_balances_app_idx" ON "app_credit_balances" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_credit_balances_user_idx" ON "app_credit_balances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_credit_balances_org_idx" ON "app_credit_balances" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_earnings_app_idx" ON "app_earnings" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_earnings_transactions_app_idx" ON "app_earnings_transactions" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_earnings_transactions_app_created_idx" ON "app_earnings_transactions" USING btree ("app_id","created_at");--> statement-breakpoint
CREATE INDEX "app_earnings_transactions_user_idx" ON "app_earnings_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_earnings_transactions_type_idx" ON "app_earnings_transactions" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_user_idx" ON "referral_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "referral_codes_code_idx" ON "referral_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_signups_referred_user_idx" ON "referral_signups" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX "referral_signups_referrer_idx" ON "referral_signups" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX "referral_signups_code_idx" ON "referral_signups" USING btree ("referral_code_id");--> statement-breakpoint
CREATE INDEX "social_share_rewards_user_idx" ON "social_share_rewards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_share_rewards_platform_idx" ON "social_share_rewards" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "social_share_rewards_user_platform_date_idx" ON "social_share_rewards" USING btree ("user_id","platform","created_at");--> statement-breakpoint
CREATE INDEX "idx_embedding_memory" ON "embeddings" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "long_term_memories_agent_entity_idx" ON "long_term_memories" USING btree ("agent_id","entity_id");--> statement-breakpoint
CREATE INDEX "long_term_memories_category_idx" ON "long_term_memories" USING btree ("category");--> statement-breakpoint
CREATE INDEX "long_term_memories_confidence_idx" ON "long_term_memories" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "long_term_memories_created_at_idx" ON "long_term_memories" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memory_access_logs_memory_idx" ON "memory_access_logs" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_access_logs_agent_idx" ON "memory_access_logs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "memory_access_logs_accessed_at_idx" ON "memory_access_logs" USING btree ("accessed_at");--> statement-breakpoint
CREATE INDEX "idx_memories_type_room" ON "memories" USING btree ("type","room_id");--> statement-breakpoint
CREATE INDEX "idx_memories_world_id" ON "memories" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "idx_memories_metadata_type" ON "memories" USING btree (((metadata->>'type')));--> statement-breakpoint
CREATE INDEX "idx_memories_document_id" ON "memories" USING btree (((metadata->>'documentId')));--> statement-breakpoint
CREATE INDEX "idx_fragments_order" ON "memories" USING btree (((metadata->>'documentId')),((metadata->>'position')));--> statement-breakpoint
CREATE INDEX "idx_participants_user" ON "participants" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_participants_room" ON "participants" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "idx_relationships_users" ON "relationships" USING btree ("source_entity_id","target_entity_id");--> statement-breakpoint
CREATE INDEX "session_summaries_agent_room_idx" ON "session_summaries" USING btree ("agent_id","room_id");--> statement-breakpoint
CREATE INDEX "session_summaries_entity_idx" ON "session_summaries" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "session_summaries_start_time_idx" ON "session_summaries" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "agent_events_agent_idx" ON "agent_events" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_events_organization_idx" ON "agent_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_events_event_type_idx" ON "agent_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "agent_events_level_idx" ON "agent_events" USING btree ("level");--> statement-breakpoint
CREATE INDEX "agent_events_created_at_idx" ON "agent_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_events_agent_created_idx" ON "agent_events" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "mcp_usage_mcp_id_idx" ON "mcp_usage" USING btree ("mcp_id");--> statement-breakpoint
CREATE INDEX "mcp_usage_organization_idx" ON "mcp_usage" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "mcp_usage_user_idx" ON "mcp_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_usage_created_at_idx" ON "mcp_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mcp_usage_mcp_org_idx" ON "mcp_usage" USING btree ("mcp_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_mcps_slug_org_idx" ON "user_mcps" USING btree ("slug","organization_id");--> statement-breakpoint
CREATE INDEX "user_mcps_organization_idx" ON "user_mcps" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_mcps_created_by_idx" ON "user_mcps" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "user_mcps_container_idx" ON "user_mcps" USING btree ("container_id");--> statement-breakpoint
CREATE INDEX "user_mcps_category_idx" ON "user_mcps" USING btree ("category");--> statement-breakpoint
CREATE INDEX "user_mcps_status_idx" ON "user_mcps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_mcps_is_public_idx" ON "user_mcps" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "user_mcps_created_at_idx" ON "user_mcps" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_mcps_erc8004_registered_idx" ON "user_mcps" USING btree ("erc8004_registered");--> statement-breakpoint
CREATE INDEX "eliza_token_prices_network_source_idx" ON "eliza_token_prices" USING btree ("network","source");--> statement-breakpoint
CREATE INDEX "eliza_token_prices_expires_idx" ON "eliza_token_prices" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "redemption_limits_user_date_idx" ON "redemption_limits" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "token_redemptions_user_idx" ON "token_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "token_redemptions_app_idx" ON "token_redemptions" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "token_redemptions_status_idx" ON "token_redemptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "token_redemptions_status_created_idx" ON "token_redemptions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "token_redemptions_network_idx" ON "token_redemptions" USING btree ("network");--> statement-breakpoint
CREATE INDEX "token_redemptions_payout_idx" ON "token_redemptions" USING btree ("payout_address");--> statement-breakpoint
CREATE UNIQUE INDEX "token_redemptions_pending_user_idx" ON "token_redemptions" USING btree ("user_id","status") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "redeemable_earnings_user_idx" ON "redeemable_earnings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "redeemable_earnings_ledger_user_idx" ON "redeemable_earnings_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "redeemable_earnings_ledger_user_created_idx" ON "redeemable_earnings_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "redeemable_earnings_ledger_type_idx" ON "redeemable_earnings_ledger" USING btree ("entry_type");--> statement-breakpoint
CREATE INDEX "redeemable_earnings_ledger_redemption_idx" ON "redeemable_earnings_ledger" USING btree ("redemption_id");--> statement-breakpoint
CREATE INDEX "redeemable_earnings_ledger_source_idx" ON "redeemable_earnings_ledger" USING btree ("earnings_source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "redeemed_tracking_ledger_idx" ON "redeemed_earnings_tracking" USING btree ("ledger_entry_id");--> statement-breakpoint
CREATE INDEX "redeemed_tracking_redemption_idx" ON "redeemed_earnings_tracking" USING btree ("redemption_id");--> statement-breakpoint
CREATE INDEX "admin_users_wallet_address_idx" ON "admin_users" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "admin_users_user_id_idx" ON "admin_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_users_role_idx" ON "admin_users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "admin_users_is_active_idx" ON "admin_users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "moderation_violations_user_id_idx" ON "moderation_violations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "moderation_violations_action_idx" ON "moderation_violations" USING btree ("action");--> statement-breakpoint
CREATE INDEX "moderation_violations_created_at_idx" ON "moderation_violations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "moderation_violations_room_id_idx" ON "moderation_violations" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "user_moderation_status_user_id_idx" ON "user_moderation_status" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_moderation_status_status_idx" ON "user_moderation_status" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_moderation_status_risk_score_idx" ON "user_moderation_status" USING btree ("risk_score");--> statement-breakpoint
CREATE INDEX "user_moderation_status_total_violations_idx" ON "user_moderation_status" USING btree ("total_violations");--> statement-breakpoint
CREATE INDEX "agent_budget_txns_budget_idx" ON "agent_budget_transactions" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "agent_budget_txns_agent_idx" ON "agent_budget_transactions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_budget_txns_type_idx" ON "agent_budget_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "agent_budget_txns_created_at_idx" ON "agent_budget_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_budgets_agent_idx" ON "agent_budgets" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_budgets_owner_org_idx" ON "agent_budgets" USING btree ("owner_org_id");--> statement-breakpoint
CREATE INDEX "agent_budgets_paused_idx" ON "agent_budgets" USING btree ("is_paused");--> statement-breakpoint
CREATE INDEX "crypto_payments_organization_id_idx" ON "crypto_payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "crypto_payments_user_id_idx" ON "crypto_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crypto_payments_payment_address_idx" ON "crypto_payments" USING btree ("payment_address");--> statement-breakpoint
CREATE INDEX "crypto_payments_status_idx" ON "crypto_payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "crypto_payments_transaction_hash_unique_idx" ON "crypto_payments" USING btree ("transaction_hash");--> statement-breakpoint
CREATE INDEX "crypto_payments_network_idx" ON "crypto_payments" USING btree ("network");--> statement-breakpoint
CREATE INDEX "crypto_payments_created_at_idx" ON "crypto_payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crypto_payments_expires_at_idx" ON "crypto_payments" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "crypto_payments_metadata_gin_idx" ON "crypto_payments" USING gin ("metadata");--> statement-breakpoint
CREATE INDEX "app_builder_prompts_session_idx" ON "app_builder_prompts" USING btree ("sandbox_session_id");--> statement-breakpoint
CREATE INDEX "app_builder_prompts_created_at_idx" ON "app_builder_prompts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "app_sandbox_sessions_user_id_idx" ON "app_sandbox_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_sandbox_sessions_org_id_idx" ON "app_sandbox_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "app_sandbox_sessions_app_id_idx" ON "app_sandbox_sessions" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_sandbox_sessions_sandbox_id_idx" ON "app_sandbox_sessions" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "app_sandbox_sessions_status_idx" ON "app_sandbox_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "app_sandbox_sessions_created_at_idx" ON "app_sandbox_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "app_templates_slug_idx" ON "app_templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "app_templates_category_idx" ON "app_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "app_templates_is_active_idx" ON "app_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "app_templates_is_featured_idx" ON "app_templates" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "sandbox_snapshots_template_key_idx" ON "sandbox_template_snapshots" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "sandbox_snapshots_status_idx" ON "sandbox_template_snapshots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sandbox_snapshots_expires_at_idx" ON "sandbox_template_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sandbox_snapshots_snapshot_id_idx" ON "sandbox_template_snapshots" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "session_file_snapshots_session_idx" ON "session_file_snapshots" USING btree ("sandbox_session_id");--> statement-breakpoint
CREATE INDEX "session_file_snapshots_session_path_idx" ON "session_file_snapshots" USING btree ("sandbox_session_id","file_path");--> statement-breakpoint
CREATE INDEX "session_file_snapshots_created_at_idx" ON "session_file_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "session_restore_history_session_idx" ON "session_restore_history" USING btree ("sandbox_session_id");--> statement-breakpoint
CREATE INDEX "webhook_events_event_id_idx" ON "webhook_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_provider_idx" ON "webhook_events" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "webhook_events_processed_at_idx" ON "webhook_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "webhook_events_provider_processed_idx" ON "webhook_events" USING btree ("provider","processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "app_secret_requirements_app_secret_idx" ON "app_secret_requirements" USING btree ("app_id","secret_name");--> statement-breakpoint
CREATE INDEX "app_secret_requirements_app_idx" ON "app_secret_requirements" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_secret_requirements_approved_idx" ON "app_secret_requirements" USING btree ("approved");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_sessions_org_provider_idx" ON "oauth_sessions" USING btree ("organization_id","provider","user_id");--> statement-breakpoint
CREATE INDEX "oauth_sessions_user_provider_idx" ON "oauth_sessions" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "oauth_sessions_provider_idx" ON "oauth_sessions" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "oauth_sessions_expires_idx" ON "oauth_sessions" USING btree ("access_token_expires_at");--> statement-breakpoint
CREATE INDEX "oauth_sessions_valid_idx" ON "oauth_sessions" USING btree ("is_valid");--> statement-breakpoint
CREATE INDEX "secret_audit_log_secret_idx" ON "secret_audit_log" USING btree ("secret_id");--> statement-breakpoint
CREATE INDEX "secret_audit_log_oauth_idx" ON "secret_audit_log" USING btree ("oauth_session_id");--> statement-breakpoint
CREATE INDEX "secret_audit_log_org_idx" ON "secret_audit_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "secret_audit_log_action_idx" ON "secret_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "secret_audit_log_actor_idx" ON "secret_audit_log" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "secret_audit_log_created_at_idx" ON "secret_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "secret_audit_log_org_action_time_idx" ON "secret_audit_log" USING btree ("organization_id","action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "secret_bindings_secret_project_idx" ON "secret_bindings" USING btree ("secret_id","project_id","project_type");--> statement-breakpoint
CREATE INDEX "secret_bindings_org_idx" ON "secret_bindings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "secret_bindings_project_idx" ON "secret_bindings" USING btree ("project_id","project_type");--> statement-breakpoint
CREATE INDEX "secret_bindings_secret_idx" ON "secret_bindings" USING btree ("secret_id");--> statement-breakpoint
CREATE UNIQUE INDEX "secrets_org_name_project_env_idx" ON "secrets" USING btree ("organization_id","name","project_id","environment");--> statement-breakpoint
CREATE INDEX "secrets_org_idx" ON "secrets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "secrets_project_idx" ON "secrets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "secrets_scope_idx" ON "secrets" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "secrets_env_idx" ON "secrets" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "secrets_name_idx" ON "secrets" USING btree ("name");--> statement-breakpoint
CREATE INDEX "secrets_expires_idx" ON "secrets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "secrets_provider_idx" ON "secrets" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "app_domains_app_id_idx" ON "app_domains" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_domains_subdomain_idx" ON "app_domains" USING btree ("subdomain");--> statement-breakpoint
CREATE UNIQUE INDEX "app_domains_custom_domain_idx" ON "app_domains" USING btree ("custom_domain");--> statement-breakpoint
CREATE INDEX "app_domains_vercel_domain_idx" ON "app_domains" USING btree ("vercel_domain_id");--> statement-breakpoint
CREATE INDEX "org_feed_configs_org_idx" ON "org_feed_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_feed_configs_enabled_idx" ON "org_feed_configs" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "org_feed_configs_platform_idx" ON "org_feed_configs" USING btree ("source_platform");--> statement-breakpoint
CREATE UNIQUE INDEX "org_feed_configs_unique" ON "org_feed_configs" USING btree ("organization_id","source_platform","source_account_id");--> statement-breakpoint
CREATE INDEX "pending_reply_confirmations_org_idx" ON "pending_reply_confirmations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pending_reply_confirmations_status_idx" ON "pending_reply_confirmations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pending_reply_confirmations_engagement_idx" ON "pending_reply_confirmations" USING btree ("engagement_event_id");--> statement-breakpoint
CREATE INDEX "pending_reply_confirmations_source_msg_idx" ON "pending_reply_confirmations" USING btree ("source_platform","source_channel_id","source_message_id");--> statement-breakpoint
CREATE INDEX "social_engagement_events_org_idx" ON "social_engagement_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "social_engagement_events_feed_idx" ON "social_engagement_events" USING btree ("feed_config_id");--> statement-breakpoint
CREATE INDEX "social_engagement_events_type_idx" ON "social_engagement_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "social_engagement_events_created_idx" ON "social_engagement_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "social_engagement_events_author_idx" ON "social_engagement_events" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_engagement_events_unique" ON "social_engagement_events" USING btree ("feed_config_id","source_post_id");--> statement-breakpoint
CREATE INDEX "social_notification_messages_org_idx" ON "social_notification_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "social_notification_messages_engagement_idx" ON "social_notification_messages" USING btree ("engagement_event_id");--> statement-breakpoint
CREATE INDEX "social_notification_messages_lookup_idx" ON "social_notification_messages" USING btree ("platform","channel_id","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_notification_messages_unique" ON "social_notification_messages" USING btree ("engagement_event_id","platform","channel_id","message_id");--> statement-breakpoint
CREATE INDEX "managed_domains_org_idx" ON "managed_domains" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_domains_domain_idx" ON "managed_domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "managed_domains_app_idx" ON "managed_domains" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "managed_domains_container_idx" ON "managed_domains" USING btree ("container_id");--> statement-breakpoint
CREATE INDEX "managed_domains_agent_idx" ON "managed_domains" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "managed_domains_mcp_idx" ON "managed_domains" USING btree ("mcp_id");--> statement-breakpoint
CREATE INDEX "managed_domains_status_idx" ON "managed_domains" USING btree ("status");--> statement-breakpoint
CREATE INDEX "managed_domains_moderation_idx" ON "managed_domains" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "managed_domains_expires_idx" ON "managed_domains" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "managed_domains_content_scan_idx" ON "managed_domains" USING btree ("last_content_scan_at");--> statement-breakpoint
CREATE INDEX "managed_domains_suspended_idx" ON "managed_domains" USING btree ("suspended_at");--> statement-breakpoint
CREATE INDEX "domain_mod_events_domain_idx" ON "domain_moderation_events" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_mod_events_type_idx" ON "domain_moderation_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "domain_mod_events_severity_idx" ON "domain_moderation_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "domain_mod_events_created_idx" ON "domain_moderation_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "domain_mod_events_unresolved_idx" ON "domain_moderation_events" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "platform_credential_sessions_session_idx" ON "platform_credential_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "platform_credential_sessions_org_idx" ON "platform_credential_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_credential_sessions_oauth_state_idx" ON "platform_credential_sessions" USING btree ("oauth_state");--> statement-breakpoint
CREATE INDEX "platform_credential_sessions_status_idx" ON "platform_credential_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_credential_sessions_expires_idx" ON "platform_credential_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "platform_credentials_org_idx" ON "platform_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "platform_credentials_user_idx" ON "platform_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "platform_credentials_app_idx" ON "platform_credentials" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_credentials_platform_user_idx" ON "platform_credentials" USING btree ("organization_id","platform","platform_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_credentials_user_platform_idx" ON "platform_credentials" USING btree ("organization_id","user_id","platform") WHERE "platform_credentials"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "platform_credentials_status_idx" ON "platform_credentials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_checkin_responses_schedule_idx" ON "org_checkin_responses" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "org_checkin_responses_org_idx" ON "org_checkin_responses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_checkin_responses_responder_idx" ON "org_checkin_responses" USING btree ("responder_platform_id","responder_platform");--> statement-breakpoint
CREATE INDEX "org_checkin_responses_date_idx" ON "org_checkin_responses" USING btree ("checkin_date");--> statement-breakpoint
CREATE INDEX "org_checkin_schedules_org_idx" ON "org_checkin_schedules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_checkin_schedules_server_idx" ON "org_checkin_schedules" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "org_checkin_schedules_enabled_idx" ON "org_checkin_schedules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "org_checkin_schedules_next_run_idx" ON "org_checkin_schedules" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "org_platform_connections_org_idx" ON "org_platform_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_platform_connections_platform_idx" ON "org_platform_connections" USING btree ("platform");--> statement-breakpoint
CREATE UNIQUE INDEX "org_platform_connections_unique" ON "org_platform_connections" USING btree ("organization_id","platform","platform_bot_id");--> statement-breakpoint
CREATE INDEX "org_platform_connections_status_idx" ON "org_platform_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_platform_servers_connection_idx" ON "org_platform_servers" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "org_platform_servers_org_idx" ON "org_platform_servers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_platform_servers_server_id_idx" ON "org_platform_servers" USING btree ("server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_platform_servers_unique" ON "org_platform_servers" USING btree ("connection_id","server_id");--> statement-breakpoint
CREATE INDEX "org_platform_servers_enabled_idx" ON "org_platform_servers" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "org_team_members_org_idx" ON "org_team_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_team_members_server_idx" ON "org_team_members" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "org_team_members_platform_user_idx" ON "org_team_members" USING btree ("platform_user_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "org_team_members_unique" ON "org_team_members" USING btree ("server_id","platform_user_id","platform");--> statement-breakpoint
CREATE INDEX "org_todos_org_idx" ON "org_todos" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_todos_status_idx" ON "org_todos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_todos_assignee_idx" ON "org_todos" USING btree ("assignee_platform_id","assignee_platform");--> statement-breakpoint
CREATE INDEX "org_todos_due_date_idx" ON "org_todos" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "org_todos_created_by_idx" ON "org_todos" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "ad_accounts_organization_idx" ON "ad_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ad_accounts_platform_idx" ON "ad_accounts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "ad_accounts_org_platform_idx" ON "ad_accounts" USING btree ("organization_id","platform");--> statement-breakpoint
CREATE INDEX "ad_accounts_external_id_idx" ON "ad_accounts" USING btree ("external_account_id");--> statement-breakpoint
CREATE INDEX "ad_accounts_status_idx" ON "ad_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ad_campaigns_organization_idx" ON "ad_campaigns" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ad_campaigns_ad_account_idx" ON "ad_campaigns" USING btree ("ad_account_id");--> statement-breakpoint
CREATE INDEX "ad_campaigns_platform_idx" ON "ad_campaigns" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "ad_campaigns_status_idx" ON "ad_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ad_campaigns_external_id_idx" ON "ad_campaigns" USING btree ("external_campaign_id");--> statement-breakpoint
CREATE INDEX "ad_campaigns_app_idx" ON "ad_campaigns" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "ad_campaigns_created_at_idx" ON "ad_campaigns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ad_campaigns_org_status_idx" ON "ad_campaigns" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "ad_creatives_campaign_idx" ON "ad_creatives" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_creatives_type_idx" ON "ad_creatives" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ad_creatives_status_idx" ON "ad_creatives" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ad_creatives_external_id_idx" ON "ad_creatives" USING btree ("external_creative_id");--> statement-breakpoint
CREATE INDEX "ad_creatives_created_at_idx" ON "ad_creatives" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ad_transactions_organization_idx" ON "ad_transactions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ad_transactions_campaign_idx" ON "ad_transactions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_transactions_credit_tx_idx" ON "ad_transactions" USING btree ("credit_transaction_id");--> statement-breakpoint
CREATE INDEX "ad_transactions_type_idx" ON "ad_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ad_transactions_created_at_idx" ON "ad_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ad_transactions_org_type_idx" ON "ad_transactions" USING btree ("organization_id","type");--> statement-breakpoint
CREATE INDEX "seo_artifacts_request_idx" ON "seo_artifacts" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "seo_artifacts_type_idx" ON "seo_artifacts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "seo_provider_calls_request_idx" ON "seo_provider_calls" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "seo_provider_calls_provider_idx" ON "seo_provider_calls" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "seo_provider_calls_status_idx" ON "seo_provider_calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "seo_requests_org_idx" ON "seo_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "seo_requests_app_idx" ON "seo_requests" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "seo_requests_type_idx" ON "seo_requests" USING btree ("type");--> statement-breakpoint
CREATE INDEX "seo_requests_status_idx" ON "seo_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_requests_idempotency_idx" ON "seo_requests" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "telegram_chats_organization_id_idx" ON "telegram_chats" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "telegram_chats_chat_id_idx" ON "telegram_chats" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "discord_guilds_organization_id_idx" ON "discord_guilds" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "discord_guilds_guild_id_idx" ON "discord_guilds" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "discord_guilds_org_guild_idx" ON "discord_guilds" USING btree ("organization_id","guild_id");--> statement-breakpoint
CREATE INDEX "discord_channels_organization_id_idx" ON "discord_channels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "discord_channels_guild_id_idx" ON "discord_channels" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "discord_channels_channel_id_idx" ON "discord_channels" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "discord_channels_guild_channel_idx" ON "discord_channels" USING btree ("guild_id","channel_id");--> statement-breakpoint
CREATE INDEX "discord_connections_organization_id_idx" ON "discord_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "discord_connections_character_id_idx" ON "discord_connections" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_connections_org_app_unique_idx" ON "discord_connections" USING btree ("organization_id","application_id");--> statement-breakpoint
CREATE INDEX "discord_connections_assigned_pod_idx" ON "discord_connections" USING btree ("assigned_pod");--> statement-breakpoint
CREATE INDEX "discord_connections_status_idx" ON "discord_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "discord_connections_is_active_idx" ON "discord_connections" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_phone_numbers_phone_org_idx" ON "agent_phone_numbers" USING btree ("phone_number","organization_id");--> statement-breakpoint
CREATE INDEX "agent_phone_numbers_organization_idx" ON "agent_phone_numbers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_phone_numbers_agent_idx" ON "agent_phone_numbers" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_phone_numbers_provider_idx" ON "agent_phone_numbers" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "agent_phone_numbers_is_active_idx" ON "agent_phone_numbers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "phone_message_log_phone_number_idx" ON "phone_message_log" USING btree ("phone_number_id");--> statement-breakpoint
CREATE INDEX "phone_message_log_direction_idx" ON "phone_message_log" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "phone_message_log_status_idx" ON "phone_message_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "phone_message_log_created_at_idx" ON "phone_message_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "phone_message_log_from_number_idx" ON "phone_message_log" USING btree ("from_number");--> statement-breakpoint
CREATE INDEX "phone_message_log_conversation_idx" ON "phone_message_log" USING btree ("from_number","to_number","phone_number_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_source_idx" ON "idempotency_keys" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_settings_user_agent_key_idx" ON "entity_settings" USING btree ("user_id","agent_id","key");--> statement-breakpoint
CREATE INDEX "entity_settings_user_idx" ON "entity_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entity_settings_user_agent_idx" ON "entity_settings" USING btree ("user_id","agent_id");--> statement-breakpoint
CREATE INDEX "entity_settings_key_idx" ON "entity_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "affiliate_codes_user_idx" ON "affiliate_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "affiliate_codes_code_idx" ON "affiliate_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "user_affiliates_user_idx" ON "user_affiliates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_affiliates_affiliate_idx" ON "user_affiliates" USING btree ("affiliate_code_id");--> statement-breakpoint
CREATE INDEX "agent_server_wallets_organization_idx" ON "agent_server_wallets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_server_wallets_user_idx" ON "agent_server_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_server_wallets_character_idx" ON "agent_server_wallets" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "agent_server_wallets_privy_wallet_idx" ON "agent_server_wallets" USING btree ("privy_wallet_id");--> statement-breakpoint
CREATE INDEX "agent_server_wallets_address_idx" ON "agent_server_wallets" USING btree ("address");--> statement-breakpoint
CREATE INDEX "agent_server_wallets_client_address_idx" ON "agent_server_wallets" USING btree ("client_address");