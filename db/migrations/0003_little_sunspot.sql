CREATE TYPE "public"."secret_project_type" AS ENUM('character', 'app', 'workflow', 'container', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."secret_provider" AS ENUM('openai', 'anthropic', 'google', 'elevenlabs', 'fal', 'stripe', 'discord', 'telegram', 'twitter', 'github', 'slack', 'aws', 'vercel', 'custom');--> statement-breakpoint
CREATE TYPE "public"."moderation_event_type" AS ENUM('spam', 'scam', 'banned_word', 'malicious_link', 'phishing', 'raid', 'harassment', 'nsfw', 'manual', 'token_gate_fail');--> statement-breakpoint
CREATE TYPE "public"."moderation_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."token_gate_chain" AS ENUM('solana', 'ethereum', 'base', 'polygon', 'arbitrum', 'optimism');--> statement-breakpoint
CREATE TYPE "public"."token_gate_type" AS ENUM('token', 'nft', 'nft_collection');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('signature', 'oauth', 'privy');--> statement-breakpoint
CREATE TYPE "public"."discord_connection_status" AS ENUM('connected', 'disconnected', 'reconnecting', 'error', 'starting');--> statement-breakpoint
CREATE TYPE "public"."discord_event_type" AS ENUM('MESSAGE_CREATE', 'MESSAGE_UPDATE', 'MESSAGE_DELETE', 'MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE', 'GUILD_MEMBER_ADD', 'GUILD_MEMBER_REMOVE', 'GUILD_MEMBER_UPDATE', 'INTERACTION_CREATE', 'VOICE_STATE_UPDATE', 'PRESENCE_UPDATE', 'TYPING_START', 'CHANNEL_CREATE', 'CHANNEL_UPDATE', 'CHANNEL_DELETE', 'THREAD_CREATE', 'THREAD_UPDATE', 'THREAD_DELETE');--> statement-breakpoint
CREATE TYPE "public"."discord_route_type" AS ENUM('a2a', 'mcp', 'webhook', 'container', 'internal');--> statement-breakpoint
CREATE TYPE "public"."application_trigger_target" AS ENUM('fragment_project', 'container', 'user_mcp', 'code_agent_session');--> statement-breakpoint
CREATE TYPE "public"."application_trigger_type" AS ENUM('cron', 'webhook', 'event');--> statement-breakpoint
CREATE TYPE "public"."reply_confirmation_status" AS ENUM('pending', 'confirmed', 'rejected', 'expired', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."social_engagement_type" AS ENUM('mention', 'reply', 'quote_tweet', 'repost', 'like', 'comment', 'follow');--> statement-breakpoint
CREATE TYPE "public"."seo_artifact_type" AS ENUM('keywords', 'meta', 'schema', 'serp_snapshot', 'health_report', 'indexnow_submission');--> statement-breakpoint
CREATE TYPE "public"."seo_provider" AS ENUM('dataforseo', 'serpapi', 'claude', 'indexnow', 'bing');--> statement-breakpoint
CREATE TYPE "public"."seo_provider_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."seo_request_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."seo_request_type" AS ENUM('keyword_research', 'serp_snapshot', 'meta_generate', 'schema_generate', 'publish_bundle', 'index_now', 'health_check');--> statement-breakpoint
CREATE TYPE "public"."domain_moderation_status" AS ENUM('clean', 'pending_review', 'flagged', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."domain_nameserver_mode" AS ENUM('vercel', 'external');--> statement-breakpoint
CREATE TYPE "public"."domain_registrar" AS ENUM('vercel', 'external');--> statement-breakpoint
CREATE TYPE "public"."domain_resource_type" AS ENUM('app', 'container', 'agent', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'active', 'expired', 'suspended', 'transferring');--> statement-breakpoint
CREATE TYPE "public"."domain_event_detected_by" AS ENUM('system', 'admin', 'user_report', 'automated_scan', 'health_monitor');--> statement-breakpoint
CREATE TYPE "public"."domain_event_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."domain_event_type" AS ENUM('name_check', 'auto_flag', 'admin_flag', 'health_check', 'content_scan', 'user_report', 'suspension', 'reinstatement', 'dns_change', 'assignment_change', 'verification', 'renewal', 'expiration_warning');--> statement-breakpoint
CREATE TYPE "public"."content_mod_type" AS ENUM('image', 'text', 'agent', 'domain', 'file');--> statement-breakpoint
CREATE TYPE "public"."flag_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."content_mod_status" AS ENUM('pending', 'scanning', 'clean', 'flagged', 'suspended', 'deleted', 'reviewed');--> statement-breakpoint
ALTER TYPE "public"."platform_credential_type" ADD VALUE 'bluesky';--> statement-breakpoint
ALTER TYPE "public"."platform_credential_type" ADD VALUE 'reddit';--> statement-breakpoint
ALTER TYPE "public"."platform_credential_type" ADD VALUE 'facebook';--> statement-breakpoint
ALTER TYPE "public"."platform_credential_type" ADD VALUE 'instagram';--> statement-breakpoint
ALTER TYPE "public"."platform_credential_type" ADD VALUE 'tiktok';--> statement-breakpoint
ALTER TYPE "public"."platform_credential_type" ADD VALUE 'linkedin';--> statement-breakpoint
ALTER TYPE "public"."platform_credential_type" ADD VALUE 'mastodon';--> statement-breakpoint
ALTER TYPE "public"."platform_credential_type" ADD VALUE 'twilio';--> statement-breakpoint
ALTER TYPE "public"."platform_credential_type" ADD VALUE 'google_calendar';--> statement-breakpoint
CREATE TABLE "app_auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"callback_url" text NOT NULL,
	"app_id" text,
	"user_id" uuid,
	"organization_id" uuid,
	"auth_token" text,
	"auth_token_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"authenticated_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	CONSTRAINT "app_auth_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "app_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"schema" jsonb NOT NULL,
	"indexes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_writable" boolean DEFAULT true NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"storage_quota_bytes" integer DEFAULT 0 NOT NULL,
	"storage_used_bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_document_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"previous_data" jsonb,
	"new_data" jsonb,
	"changed_by" uuid,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"idx_str_1" text,
	"idx_str_2" text,
	"idx_str_3" text,
	"idx_str_4" text,
	"idx_num_1" numeric(20, 8),
	"idx_num_2" numeric(20, 8),
	"idx_bool_1" boolean,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"bundle_url" text NOT NULL,
	"entry_file" text DEFAULT 'index.html' NOT NULL,
	"framework" text,
	"build_hash" text,
	"bundle_size" integer,
	"source_project_id" uuid,
	"source_type" text DEFAULT 'fragment',
	"runtime_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'deploying' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deployed_at" timestamp
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
CREATE TABLE "org_blocked_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"server_id" uuid,
	"pattern_type" text NOT NULL,
	"pattern" text NOT NULL,
	"category" text NOT NULL,
	"action" "moderation_action" DEFAULT 'delete' NOT NULL,
	"severity" "moderation_severity" DEFAULT 'medium' NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_member_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"platform_user_id" text NOT NULL,
	"platform" text NOT NULL,
	"wallet_address" text NOT NULL,
	"chain" "token_gate_chain" NOT NULL,
	"verified_at" timestamp,
	"verification_method" "verification_method",
	"verification_signature" text,
	"last_checked_at" timestamp,
	"last_balance" jsonb,
	"assigned_roles" jsonb DEFAULT '[]'::jsonb,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"platform_user_id" text NOT NULL,
	"platform" text NOT NULL,
	"platform_username" text,
	"event_type" "moderation_event_type" NOT NULL,
	"severity" "moderation_severity" NOT NULL,
	"message_id" text,
	"channel_id" text,
	"content_sample" text,
	"matched_pattern" text,
	"action_taken" "moderation_action",
	"action_duration_minutes" integer,
	"action_expires_at" timestamp,
	"detected_by" text NOT NULL,
	"confidence_score" integer,
	"resolved_at" timestamp,
	"resolved_by" uuid,
	"resolution_notes" text,
	"false_positive" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_spam_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"platform_user_id" text NOT NULL,
	"platform" text NOT NULL,
	"recent_message_hashes" jsonb DEFAULT '[]'::jsonb,
	"message_timestamps" jsonb DEFAULT '[]'::jsonb,
	"spam_violations_1h" integer DEFAULT 0 NOT NULL,
	"spam_violations_24h" integer DEFAULT 0 NOT NULL,
	"total_violations" integer DEFAULT 0 NOT NULL,
	"is_rate_limited" boolean DEFAULT false NOT NULL,
	"rate_limit_expires_at" timestamp,
	"rate_limit_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"timeout_count" integer DEFAULT 0 NOT NULL,
	"last_warning_at" timestamp,
	"last_timeout_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_token_gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"chain" "token_gate_chain" NOT NULL,
	"token_type" "token_gate_type" NOT NULL,
	"token_address" text NOT NULL,
	"min_balance" text DEFAULT '1' NOT NULL,
	"nft_collection_id" text,
	"required_traits" jsonb,
	"discord_role_id" text,
	"telegram_group_id" text,
	"remove_on_fail" boolean DEFAULT true NOT NULL,
	"check_interval_hours" integer DEFAULT 24 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_bot_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_connection_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"application_id" text NOT NULL,
	"bot_user_id" text,
	"bot_username" text,
	"shard_id" integer DEFAULT 0,
	"shard_count" integer DEFAULT 1,
	"gateway_pod" text,
	"session_id" text,
	"resume_gateway_url" text,
	"sequence_number" integer DEFAULT 0,
	"status" "discord_connection_status" DEFAULT 'disconnected' NOT NULL,
	"error_message" text,
	"last_heartbeat" timestamp,
	"heartbeat_interval_ms" integer DEFAULT 41250,
	"guild_count" integer DEFAULT 0,
	"events_received" bigint DEFAULT 0,
	"events_routed" bigint DEFAULT 0,
	"last_event_at" timestamp,
	"intents" integer DEFAULT 3276799,
	"connected_at" timestamp,
	"disconnected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_event_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"route_id" uuid,
	"event_type" "discord_event_type" NOT NULL,
	"event_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"last_attempt_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"process_after" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "discord_event_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"platform_connection_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text,
	"event_type" "discord_event_type" NOT NULL,
	"route_type" "discord_route_type" NOT NULL,
	"route_target" text NOT NULL,
	"filter_bot_messages" boolean DEFAULT true,
	"filter_self_messages" boolean DEFAULT true,
	"mention_only" boolean DEFAULT false,
	"command_prefix" text,
	"rate_limit_per_minute" integer DEFAULT 60,
	"rate_limit_burst" integer DEFAULT 10,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100,
	"events_matched" bigint DEFAULT 0,
	"events_routed" bigint DEFAULT 0,
	"last_routed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_trigger_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_data" jsonb,
	"output_data" jsonb,
	"error_message" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"duration_ms" integer,
	"request_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"target_type" "application_trigger_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"trigger_type" "application_trigger_type" NOT NULL,
	"trigger_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action_type" text DEFAULT 'call_endpoint' NOT NULL,
	"action_config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"last_executed_at" timestamp,
	"last_error_at" timestamp,
	"last_error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_triggers_trigger_key_unique" UNIQUE("trigger_key")
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
CREATE TABLE "media_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cover_image_id" uuid,
	"item_count" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_collection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"generation_id" uuid,
	"upload_id" uuid,
	"source_type" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"original_filename" text NOT NULL,
	"storage_url" text NOT NULL,
	"thumbnail_url" text,
	"mime_type" text NOT NULL,
	"file_size" bigint NOT NULL,
	"type" text NOT NULL,
	"dimensions" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "code_agent_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"command_type" text NOT NULL,
	"command" text NOT NULL,
	"arguments" jsonb,
	"working_directory" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"exit_code" integer,
	"stdout" text,
	"stderr" text,
	"error_message" text,
	"files_created" jsonb DEFAULT '[]'::jsonb,
	"files_modified" jsonb DEFAULT '[]'::jsonb,
	"files_deleted" jsonb DEFAULT '[]'::jsonb,
	"duration_ms" integer,
	"cpu_time_ms" integer,
	"memory_mb_peak" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "code_agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"description" text,
	"runtime_type" text DEFAULT 'vercel' NOT NULL,
	"runtime_id" text,
	"runtime_url" text,
	"status" text DEFAULT 'creating' NOT NULL,
	"status_message" text,
	"working_directory" text DEFAULT '/app',
	"environment_variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets_loaded" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"git_state" jsonb,
	"capabilities" jsonb DEFAULT '{"languages":["javascript","typescript","python","shell"],"hasGit":true,"hasDocker":false,"maxCpuSeconds":3600,"maxMemoryMb":2048,"maxDiskMb":10240,"networkAccess":true}'::jsonb NOT NULL,
	"latest_snapshot_id" uuid,
	"snapshot_count" integer DEFAULT 0 NOT NULL,
	"auto_snapshot_enabled" boolean DEFAULT true NOT NULL,
	"auto_snapshot_interval_seconds" integer DEFAULT 300 NOT NULL,
	"cpu_seconds_used" integer DEFAULT 0 NOT NULL,
	"memory_mb_peak" integer DEFAULT 0 NOT NULL,
	"disk_mb_used" integer DEFAULT 0 NOT NULL,
	"api_calls_count" integer DEFAULT 0 NOT NULL,
	"commands_executed" integer DEFAULT 0 NOT NULL,
	"files_created" integer DEFAULT 0 NOT NULL,
	"files_modified" integer DEFAULT 0 NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"suspended_at" timestamp,
	"terminated_at" timestamp,
	"webhook_url" text,
	"webhook_secret" text,
	"webhook_events" jsonb DEFAULT '["session_ready","session_error","session_terminated"]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "code_agent_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text,
	"description" text,
	"snapshot_type" text DEFAULT 'manual' NOT NULL,
	"storage_backend" text DEFAULT 'vercel_blob' NOT NULL,
	"storage_key" text NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"total_size_bytes" integer DEFAULT 0 NOT NULL,
	"file_manifest" jsonb DEFAULT '[]'::jsonb,
	"git_state" jsonb,
	"environment_variables" jsonb DEFAULT '{}'::jsonb,
	"working_directory" text,
	"is_valid" boolean DEFAULT true NOT NULL,
	"validation_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "interpreter_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"language" text NOT NULL,
	"code" text NOT NULL,
	"packages" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"output" text,
	"error" text,
	"exit_code" integer,
	"duration_ms" integer,
	"memory_mb_peak" integer,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "app_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slow_query_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" text NOT NULL,
	"sql_text" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"call_count" integer DEFAULT 1 NOT NULL,
	"total_duration_ms" bigint DEFAULT 0 NOT NULL,
	"avg_duration_ms" numeric(10, 2) DEFAULT '0' NOT NULL,
	"min_duration_ms" integer DEFAULT 0 NOT NULL,
	"max_duration_ms" integer DEFAULT 0 NOT NULL,
	"source_file" text,
	"source_function" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slow_query_log_query_hash_unique" UNIQUE("query_hash")
);
--> statement-breakpoint
CREATE TABLE "content_moderation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" "content_mod_type" NOT NULL,
	"source_table" text NOT NULL,
	"source_id" uuid NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"content_url" text,
	"content_hash" text,
	"content_size_bytes" bigint,
	"is_public" boolean DEFAULT false NOT NULL,
	"status" "content_mod_status" DEFAULT 'pending' NOT NULL,
	"confidence" real DEFAULT 0,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_model" text,
	"ai_scores" jsonb,
	"ai_reasoning" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"review_decision" text,
	"review_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_scanned_at" timestamp,
	"scan_attempts" integer DEFAULT 0 NOT NULL,
	"next_scan_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_moderation_strikes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_item_id" uuid,
	"reason" text NOT NULL,
	"severity" "flag_severity" NOT NULL,
	"content_type" "content_mod_type" NOT NULL,
	"content_preview" text,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action_taken" text NOT NULL,
	"reviewed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "miniapp_auth_sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "miniapp_collections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "miniapp_document_changes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "miniapp_documents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "miniapp_bundles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "miniapp_domains" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "miniapp_auth_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "miniapp_collections" CASCADE;--> statement-breakpoint
DROP TABLE "miniapp_document_changes" CASCADE;--> statement-breakpoint
DROP TABLE "miniapp_documents" CASCADE;--> statement-breakpoint
DROP TABLE "miniapp_bundles" CASCADE;--> statement-breakpoint
DROP TABLE "miniapp_domains" CASCADE;--> statement-breakpoint
ALTER TABLE "redeemable_earnings_ledger" ALTER COLUMN "earnings_source" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."earnings_source";--> statement-breakpoint
CREATE TYPE "public"."earnings_source" AS ENUM('app', 'agent', 'mcp');--> statement-breakpoint
ALTER TABLE "redeemable_earnings_ledger" ALTER COLUMN "earnings_source" SET DATA TYPE "public"."earnings_source" USING "earnings_source"::"public"."earnings_source";--> statement-breakpoint
ALTER TABLE "user_characters" ADD COLUMN "custom_domain" text;--> statement-breakpoint
ALTER TABLE "user_characters" ADD COLUMN "custom_domain_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "containers" ADD COLUMN "custom_domain" text;--> statement-breakpoint
ALTER TABLE "containers" ADD COLUMN "custom_domain_verified" text DEFAULT 'false';--> statement-breakpoint
ALTER TABLE "user_mcps" ADD COLUMN "custom_domain" text;--> statement-breakpoint
ALTER TABLE "user_mcps" ADD COLUMN "custom_domain_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "redeemable_earnings" ADD COLUMN "earned_from_apps" numeric(18, 4) DEFAULT '0.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "provider" "secret_provider";--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "provider_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "app_auth_sessions" ADD CONSTRAINT "app_auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_auth_sessions" ADD CONSTRAINT "app_auth_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_collections" ADD CONSTRAINT "app_collections_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_document_changes" ADD CONSTRAINT "app_document_changes_document_id_app_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."app_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_document_changes" ADD CONSTRAINT "app_document_changes_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_document_changes" ADD CONSTRAINT "app_document_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_documents" ADD CONSTRAINT "app_documents_collection_id_app_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."app_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_documents" ADD CONSTRAINT "app_documents_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_documents" ADD CONSTRAINT "app_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_documents" ADD CONSTRAINT "app_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_bundles" ADD CONSTRAINT "app_bundles_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_domains" ADD CONSTRAINT "app_domains_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_secret_requirements" ADD CONSTRAINT "app_secret_requirements_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_secret_requirements" ADD CONSTRAINT "app_secret_requirements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_bindings" ADD CONSTRAINT "secret_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_bindings" ADD CONSTRAINT "secret_bindings_secret_id_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."secrets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_bindings" ADD CONSTRAINT "secret_bindings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_blocked_patterns" ADD CONSTRAINT "org_blocked_patterns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_blocked_patterns" ADD CONSTRAINT "org_blocked_patterns_server_id_org_platform_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."org_platform_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_blocked_patterns" ADD CONSTRAINT "org_blocked_patterns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_member_wallets" ADD CONSTRAINT "org_member_wallets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_member_wallets" ADD CONSTRAINT "org_member_wallets_server_id_org_platform_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."org_platform_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_moderation_events" ADD CONSTRAINT "org_moderation_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_moderation_events" ADD CONSTRAINT "org_moderation_events_server_id_org_platform_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."org_platform_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_moderation_events" ADD CONSTRAINT "org_moderation_events_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_spam_tracking" ADD CONSTRAINT "org_spam_tracking_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_spam_tracking" ADD CONSTRAINT "org_spam_tracking_server_id_org_platform_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."org_platform_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_token_gates" ADD CONSTRAINT "org_token_gates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_token_gates" ADD CONSTRAINT "org_token_gates_server_id_org_platform_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."org_platform_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_token_gates" ADD CONSTRAINT "org_token_gates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_bot_connections" ADD CONSTRAINT "discord_bot_connections_platform_connection_id_org_platform_connections_id_fk" FOREIGN KEY ("platform_connection_id") REFERENCES "public"."org_platform_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_bot_connections" ADD CONSTRAINT "discord_bot_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_event_queue" ADD CONSTRAINT "discord_event_queue_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_event_queue" ADD CONSTRAINT "discord_event_queue_route_id_discord_event_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."discord_event_routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_event_routes" ADD CONSTRAINT "discord_event_routes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_event_routes" ADD CONSTRAINT "discord_event_routes_platform_connection_id_org_platform_connections_id_fk" FOREIGN KEY ("platform_connection_id") REFERENCES "public"."org_platform_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_trigger_executions" ADD CONSTRAINT "application_trigger_executions_trigger_id_application_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."application_triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_trigger_executions" ADD CONSTRAINT "application_trigger_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_triggers" ADD CONSTRAINT "application_triggers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_triggers" ADD CONSTRAINT "application_triggers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_feed_configs" ADD CONSTRAINT "org_feed_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_feed_configs" ADD CONSTRAINT "org_feed_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_reply_confirmations" ADD CONSTRAINT "pending_reply_confirmations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_reply_confirmations" ADD CONSTRAINT "pending_reply_confirmations_engagement_event_id_social_engagement_events_id_fk" FOREIGN KEY ("engagement_event_id") REFERENCES "public"."social_engagement_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_engagement_events" ADD CONSTRAINT "social_engagement_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_engagement_events" ADD CONSTRAINT "social_engagement_events_feed_config_id_org_feed_configs_id_fk" FOREIGN KEY ("feed_config_id") REFERENCES "public"."org_feed_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_notification_messages" ADD CONSTRAINT "social_notification_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_notification_messages" ADD CONSTRAINT "social_notification_messages_engagement_event_id_social_engagement_events_id_fk" FOREIGN KEY ("engagement_event_id") REFERENCES "public"."social_engagement_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_artifacts" ADD CONSTRAINT "seo_artifacts_request_id_seo_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."seo_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_provider_calls" ADD CONSTRAINT "seo_provider_calls_request_id_seo_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."seo_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_requests" ADD CONSTRAINT "seo_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_requests" ADD CONSTRAINT "seo_requests_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_requests" ADD CONSTRAINT "seo_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_requests" ADD CONSTRAINT "seo_requests_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_collections" ADD CONSTRAINT "media_collections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_collections" ADD CONSTRAINT "media_collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_collections" ADD CONSTRAINT "media_collections_cover_image_id_generations_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_collection_items" ADD CONSTRAINT "media_collection_items_collection_id_media_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."media_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_collection_items" ADD CONSTRAINT "media_collection_items_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_collection_items" ADD CONSTRAINT "media_collection_items_upload_id_media_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."media_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "managed_domains" ADD CONSTRAINT "managed_domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_domains" ADD CONSTRAINT "managed_domains_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_domains" ADD CONSTRAINT "managed_domains_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_domains" ADD CONSTRAINT "managed_domains_agent_id_user_characters_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_domains" ADD CONSTRAINT "managed_domains_mcp_id_user_mcps_id_fk" FOREIGN KEY ("mcp_id") REFERENCES "public"."user_mcps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_moderation_events" ADD CONSTRAINT "domain_moderation_events_domain_id_managed_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."managed_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_moderation_events" ADD CONSTRAINT "domain_moderation_events_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_moderation_events" ADD CONSTRAINT "domain_moderation_events_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_agent_commands" ADD CONSTRAINT "code_agent_commands_session_id_code_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."code_agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_agent_sessions" ADD CONSTRAINT "code_agent_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_agent_sessions" ADD CONSTRAINT "code_agent_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_agent_snapshots" ADD CONSTRAINT "code_agent_snapshots_session_id_code_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."code_agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpreter_executions" ADD CONSTRAINT "interpreter_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpreter_executions" ADD CONSTRAINT "interpreter_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_agents" ADD CONSTRAINT "app_agents_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_agents" ADD CONSTRAINT "app_agents_agent_id_user_characters_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user_characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_services" ADD CONSTRAINT "app_services_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_services" ADD CONSTRAINT "app_services_service_id_user_mcps_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."user_mcps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_workflows" ADD CONSTRAINT "app_workflows_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_workflows" ADD CONSTRAINT "app_workflows_workflow_id_n8n_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."n8n_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_moderation_items" ADD CONSTRAINT "content_moderation_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_moderation_items" ADD CONSTRAINT "content_moderation_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_moderation_items" ADD CONSTRAINT "content_moderation_items_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_moderation_strikes" ADD CONSTRAINT "user_moderation_strikes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_moderation_strikes" ADD CONSTRAINT "user_moderation_strikes_content_item_id_content_moderation_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_moderation_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_moderation_strikes" ADD CONSTRAINT "user_moderation_strikes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_collections_app_name_idx" ON "app_collections" USING btree ("app_id","name");--> statement-breakpoint
CREATE INDEX "app_collections_app_id_idx" ON "app_collections" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_document_changes_document_idx" ON "app_document_changes" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "app_document_changes_app_idx" ON "app_document_changes" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_document_changes_changed_at_idx" ON "app_document_changes" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "app_documents_app_collection_idx" ON "app_documents" USING btree ("app_id","collection_id");--> statement-breakpoint
CREATE INDEX "app_documents_idx_str_1_idx" ON "app_documents" USING btree ("app_id","collection_id","idx_str_1");--> statement-breakpoint
CREATE INDEX "app_documents_idx_str_2_idx" ON "app_documents" USING btree ("app_id","collection_id","idx_str_2");--> statement-breakpoint
CREATE INDEX "app_documents_idx_str_3_idx" ON "app_documents" USING btree ("app_id","collection_id","idx_str_3");--> statement-breakpoint
CREATE INDEX "app_documents_idx_str_4_idx" ON "app_documents" USING btree ("app_id","collection_id","idx_str_4");--> statement-breakpoint
CREATE INDEX "app_documents_idx_num_1_idx" ON "app_documents" USING btree ("app_id","collection_id","idx_num_1");--> statement-breakpoint
CREATE INDEX "app_documents_idx_num_2_idx" ON "app_documents" USING btree ("app_id","collection_id","idx_num_2");--> statement-breakpoint
CREATE INDEX "app_documents_idx_bool_1_idx" ON "app_documents" USING btree ("app_id","collection_id","idx_bool_1");--> statement-breakpoint
CREATE INDEX "app_documents_created_by_idx" ON "app_documents" USING btree ("app_id","collection_id","created_by");--> statement-breakpoint
CREATE INDEX "app_documents_deleted_at_idx" ON "app_documents" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "app_bundles_app_id_idx" ON "app_bundles" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_bundles_app_version_idx" ON "app_bundles" USING btree ("app_id","version");--> statement-breakpoint
CREATE INDEX "app_bundles_is_active_idx" ON "app_bundles" USING btree ("app_id","is_active");--> statement-breakpoint
CREATE INDEX "app_bundles_status_idx" ON "app_bundles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "app_bundles_source_project_idx" ON "app_bundles" USING btree ("source_project_id");--> statement-breakpoint
CREATE INDEX "app_domains_app_id_idx" ON "app_domains" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_domains_subdomain_idx" ON "app_domains" USING btree ("subdomain");--> statement-breakpoint
CREATE UNIQUE INDEX "app_domains_custom_domain_idx" ON "app_domains" USING btree ("custom_domain");--> statement-breakpoint
CREATE INDEX "app_domains_vercel_domain_idx" ON "app_domains" USING btree ("vercel_domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_secret_requirements_app_secret_idx" ON "app_secret_requirements" USING btree ("app_id","secret_name");--> statement-breakpoint
CREATE INDEX "app_secret_requirements_app_idx" ON "app_secret_requirements" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_secret_requirements_approved_idx" ON "app_secret_requirements" USING btree ("approved");--> statement-breakpoint
CREATE UNIQUE INDEX "secret_bindings_secret_project_idx" ON "secret_bindings" USING btree ("secret_id","project_id","project_type");--> statement-breakpoint
CREATE INDEX "secret_bindings_org_idx" ON "secret_bindings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "secret_bindings_project_idx" ON "secret_bindings" USING btree ("project_id","project_type");--> statement-breakpoint
CREATE INDEX "secret_bindings_secret_idx" ON "secret_bindings" USING btree ("secret_id");--> statement-breakpoint
CREATE INDEX "org_blocked_patterns_org_idx" ON "org_blocked_patterns" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_blocked_patterns_server_idx" ON "org_blocked_patterns" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "org_blocked_patterns_category_idx" ON "org_blocked_patterns" USING btree ("category");--> statement-breakpoint
CREATE INDEX "org_blocked_patterns_enabled_idx" ON "org_blocked_patterns" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "org_member_wallets_org_idx" ON "org_member_wallets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_member_wallets_server_idx" ON "org_member_wallets" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "org_member_wallets_platform_user_idx" ON "org_member_wallets" USING btree ("platform_user_id","platform");--> statement-breakpoint
CREATE INDEX "org_member_wallets_wallet_idx" ON "org_member_wallets" USING btree ("wallet_address","chain");--> statement-breakpoint
CREATE UNIQUE INDEX "org_member_wallets_unique_wallet" ON "org_member_wallets" USING btree ("server_id","wallet_address","chain");--> statement-breakpoint
CREATE INDEX "org_mod_events_org_idx" ON "org_moderation_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_mod_events_server_idx" ON "org_moderation_events" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "org_mod_events_user_idx" ON "org_moderation_events" USING btree ("platform_user_id","platform");--> statement-breakpoint
CREATE INDEX "org_mod_events_type_idx" ON "org_moderation_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "org_mod_events_created_idx" ON "org_moderation_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "org_mod_events_unresolved_idx" ON "org_moderation_events" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "org_spam_tracking_org_idx" ON "org_spam_tracking" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_spam_tracking_server_idx" ON "org_spam_tracking" USING btree ("server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_spam_tracking_unique_user" ON "org_spam_tracking" USING btree ("server_id","platform_user_id","platform");--> statement-breakpoint
CREATE INDEX "org_spam_tracking_rate_limited_idx" ON "org_spam_tracking" USING btree ("is_rate_limited");--> statement-breakpoint
CREATE INDEX "org_token_gates_org_idx" ON "org_token_gates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_token_gates_server_idx" ON "org_token_gates" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "org_token_gates_enabled_idx" ON "org_token_gates" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "discord_bot_connections_org_idx" ON "discord_bot_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "discord_bot_connections_platform_idx" ON "discord_bot_connections" USING btree ("platform_connection_id");--> statement-breakpoint
CREATE INDEX "discord_bot_connections_app_id_idx" ON "discord_bot_connections" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "discord_bot_connections_status_idx" ON "discord_bot_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "discord_bot_connections_shard_idx" ON "discord_bot_connections" USING btree ("shard_id","shard_count");--> statement-breakpoint
CREATE INDEX "discord_bot_connections_pod_idx" ON "discord_bot_connections" USING btree ("gateway_pod");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_bot_connections_unique" ON "discord_bot_connections" USING btree ("platform_connection_id","shard_id");--> statement-breakpoint
CREATE INDEX "discord_event_queue_org_idx" ON "discord_event_queue" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "discord_event_queue_status_idx" ON "discord_event_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "discord_event_queue_process_idx" ON "discord_event_queue" USING btree ("status","process_after");--> statement-breakpoint
CREATE INDEX "discord_event_queue_event_idx" ON "discord_event_queue" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "discord_event_routes_org_idx" ON "discord_event_routes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "discord_event_routes_connection_idx" ON "discord_event_routes" USING btree ("platform_connection_id");--> statement-breakpoint
CREATE INDEX "discord_event_routes_guild_idx" ON "discord_event_routes" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "discord_event_routes_channel_idx" ON "discord_event_routes" USING btree ("guild_id","channel_id");--> statement-breakpoint
CREATE INDEX "discord_event_routes_type_idx" ON "discord_event_routes" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "discord_event_routes_enabled_idx" ON "discord_event_routes" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "discord_event_routes_priority_idx" ON "discord_event_routes" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "app_trigger_executions_trigger_id_idx" ON "application_trigger_executions" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "app_trigger_executions_org_idx" ON "application_trigger_executions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "app_trigger_executions_status_idx" ON "application_trigger_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "app_trigger_executions_created_at_idx" ON "application_trigger_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "app_trigger_executions_trigger_date_idx" ON "application_trigger_executions" USING btree ("trigger_id","created_at");--> statement-breakpoint
CREATE INDEX "app_triggers_organization_idx" ON "application_triggers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "app_triggers_target_idx" ON "application_triggers" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "app_triggers_trigger_type_idx" ON "application_triggers" USING btree ("trigger_type","is_active");--> statement-breakpoint
CREATE INDEX "app_triggers_trigger_key_idx" ON "application_triggers" USING btree ("trigger_key");--> statement-breakpoint
CREATE INDEX "app_triggers_is_active_idx" ON "application_triggers" USING btree ("is_active");--> statement-breakpoint
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
CREATE INDEX "media_collections_organization_idx" ON "media_collections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "media_collections_user_idx" ON "media_collections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_collections_org_user_idx" ON "media_collections" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "media_collections_name_idx" ON "media_collections" USING btree ("name");--> statement-breakpoint
CREATE INDEX "media_collections_created_at_idx" ON "media_collections" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "media_collection_items_collection_idx" ON "media_collection_items" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "media_collection_items_generation_idx" ON "media_collection_items" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "media_collection_items_upload_idx" ON "media_collection_items" USING btree ("upload_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_collection_items_unique_generation" ON "media_collection_items" USING btree ("collection_id","generation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_collection_items_unique_upload" ON "media_collection_items" USING btree ("collection_id","upload_id");--> statement-breakpoint
CREATE INDEX "media_collection_items_order_idx" ON "media_collection_items" USING btree ("collection_id","order_index");--> statement-breakpoint
CREATE INDEX "media_uploads_organization_idx" ON "media_uploads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "media_uploads_user_idx" ON "media_uploads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_uploads_org_user_idx" ON "media_uploads" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "media_uploads_type_idx" ON "media_uploads" USING btree ("type");--> statement-breakpoint
CREATE INDEX "media_uploads_created_at_idx" ON "media_uploads" USING btree ("created_at");--> statement-breakpoint
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
CREATE INDEX "code_agent_commands_session_idx" ON "code_agent_commands" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "code_agent_commands_status_idx" ON "code_agent_commands" USING btree ("status");--> statement-breakpoint
CREATE INDEX "code_agent_commands_created_at_idx" ON "code_agent_commands" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "code_agent_sessions_org_idx" ON "code_agent_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "code_agent_sessions_user_idx" ON "code_agent_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "code_agent_sessions_status_idx" ON "code_agent_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "code_agent_sessions_runtime_idx" ON "code_agent_sessions" USING btree ("runtime_id");--> statement-breakpoint
CREATE INDEX "code_agent_sessions_created_at_idx" ON "code_agent_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "code_agent_sessions_expires_at_idx" ON "code_agent_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "code_agent_snapshots_session_idx" ON "code_agent_snapshots" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "code_agent_snapshots_created_at_idx" ON "code_agent_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "code_agent_snapshots_storage_key_idx" ON "code_agent_snapshots" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "interpreter_executions_org_idx" ON "interpreter_executions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "interpreter_executions_user_idx" ON "interpreter_executions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "interpreter_executions_language_idx" ON "interpreter_executions" USING btree ("language");--> statement-breakpoint
CREATE INDEX "interpreter_executions_created_at_idx" ON "interpreter_executions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "app_agents_unique_idx" ON "app_agents" USING btree ("app_id","agent_id");--> statement-breakpoint
CREATE INDEX "app_agents_app_idx" ON "app_agents" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_agents_agent_idx" ON "app_agents" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_services_unique_idx" ON "app_services" USING btree ("app_id","service_id");--> statement-breakpoint
CREATE INDEX "app_services_app_idx" ON "app_services" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_services_service_idx" ON "app_services" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_workflows_unique_idx" ON "app_workflows" USING btree ("app_id","workflow_id");--> statement-breakpoint
CREATE INDEX "app_workflows_app_idx" ON "app_workflows" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_workflows_workflow_idx" ON "app_workflows" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "content_mod_source_idx" ON "content_moderation_items" USING btree ("source_table","source_id");--> statement-breakpoint
CREATE INDEX "content_mod_status_idx" ON "content_moderation_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_mod_org_idx" ON "content_moderation_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "content_mod_user_idx" ON "content_moderation_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_mod_type_status_idx" ON "content_moderation_items" USING btree ("content_type","status");--> statement-breakpoint
CREATE INDEX "content_mod_next_scan_idx" ON "content_moderation_items" USING btree ("next_scan_at");--> statement-breakpoint
CREATE INDEX "content_mod_created_at_idx" ON "content_moderation_items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_mod_strikes_user_id_idx" ON "user_moderation_strikes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_mod_strikes_severity_idx" ON "user_moderation_strikes" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "user_mod_strikes_created_at_idx" ON "user_moderation_strikes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_mod_strikes_content_type_idx" ON "user_moderation_strikes" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "secrets_provider_idx" ON "secrets" USING btree ("provider");--> statement-breakpoint
ALTER TABLE "redeemable_earnings" DROP COLUMN "earned_from_miniapps";