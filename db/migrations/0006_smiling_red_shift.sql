CREATE TYPE "public"."secret_actor_type" AS ENUM('user', 'api_key', 'system', 'deployment', 'workflow');--> statement-breakpoint
CREATE TYPE "public"."secret_audit_action" AS ENUM('created', 'read', 'updated', 'deleted', 'rotated');--> statement-breakpoint
CREATE TYPE "public"."secret_environment" AS ENUM('development', 'preview', 'production');--> statement-breakpoint
CREATE TYPE "public"."secret_scope" AS ENUM('organization', 'project', 'environment');--> statement-breakpoint
CREATE TYPE "public"."org_agent_type" AS ENUM('community_manager', 'project_manager', 'dev_rel', 'liaison', 'social_media_manager');--> statement-breakpoint
CREATE TYPE "public"."org_checkin_frequency" AS ENUM('daily', 'weekdays', 'weekly', 'bi_weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."org_checkin_type" AS ENUM('standup', 'sprint', 'mental_health', 'project_status', 'retrospective');--> statement-breakpoint
CREATE TYPE "public"."org_platform_status" AS ENUM('active', 'disconnected', 'error', 'pending');--> statement-breakpoint
CREATE TYPE "public"."org_platform_type" AS ENUM('discord', 'telegram', 'slack', 'twitter');--> statement-breakpoint
CREATE TYPE "public"."org_todo_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."org_todo_status" AS ENUM('pending', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."org_agent_instance_status" AS ENUM('active', 'inactive', 'configuring', 'error');--> statement-breakpoint
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
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" "secret_scope" DEFAULT 'organization' NOT NULL,
	"project_id" uuid,
	"project_type" text,
	"environment" "secret_environment",
	"name" text NOT NULL,
	"description" text,
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
CREATE TABLE "org_agent_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"action_description" text,
	"platform" text,
	"platform_channel_id" text,
	"platform_user_id" text,
	"related_todo_id" uuid,
	"related_checkin_id" uuid,
	"related_message_id" text,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"discord_config" jsonb,
	"telegram_config" jsonb,
	"twitter_config" jsonb,
	"custom_settings" jsonb,
	"checkin_settings" jsonb,
	"community_settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_agent_configs_instance_id_unique" UNIQUE("instance_id")
);
--> statement-breakpoint
CREATE TABLE "org_agent_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_type" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"status" "org_agent_instance_status" DEFAULT 'configuring' NOT NULL,
	"error_message" text,
	"last_active_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_sessions" ADD CONSTRAINT "oauth_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_sessions" ADD CONSTRAINT "oauth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "org_agent_activity_log" ADD CONSTRAINT "org_agent_activity_log_instance_id_org_agent_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."org_agent_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_agent_activity_log" ADD CONSTRAINT "org_agent_activity_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_agent_configs" ADD CONSTRAINT "org_agent_configs_instance_id_org_agent_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."org_agent_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_agent_instances" ADD CONSTRAINT "org_agent_instances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_agent_instances" ADD CONSTRAINT "org_agent_instances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
CREATE UNIQUE INDEX "secrets_org_name_project_env_idx" ON "secrets" USING btree ("organization_id","name","project_id","environment");--> statement-breakpoint
CREATE INDEX "secrets_org_idx" ON "secrets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "secrets_project_idx" ON "secrets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "secrets_scope_idx" ON "secrets" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "secrets_env_idx" ON "secrets" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "secrets_name_idx" ON "secrets" USING btree ("name");--> statement-breakpoint
CREATE INDEX "secrets_expires_idx" ON "secrets" USING btree ("expires_at");--> statement-breakpoint
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
CREATE INDEX "org_agent_activity_instance_idx" ON "org_agent_activity_log" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "org_agent_activity_org_idx" ON "org_agent_activity_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_agent_activity_type_idx" ON "org_agent_activity_log" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "org_agent_activity_created_idx" ON "org_agent_activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "org_agent_configs_instance_idx" ON "org_agent_configs" USING btree ("instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_agent_instances_org_type_idx" ON "org_agent_instances" USING btree ("organization_id","agent_type");--> statement-breakpoint
CREATE INDEX "org_agent_instances_org_idx" ON "org_agent_instances" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_agent_instances_status_idx" ON "org_agent_instances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_agent_instances_enabled_idx" ON "org_agent_instances" USING btree ("enabled");