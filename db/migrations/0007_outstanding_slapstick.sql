CREATE TYPE "public"."platform_credential_status" AS ENUM('pending', 'active', 'expired', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."platform_credential_type" AS ENUM('discord', 'telegram', 'twitter', 'gmail', 'slack', 'github', 'google');--> statement-breakpoint
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
ALTER TABLE "platform_credential_sessions" ADD CONSTRAINT "platform_credential_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credential_sessions" ADD CONSTRAINT "platform_credential_sessions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credential_sessions" ADD CONSTRAINT "platform_credential_sessions_requesting_user_id_users_id_fk" FOREIGN KEY ("requesting_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credential_sessions" ADD CONSTRAINT "platform_credential_sessions_credential_id_platform_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."platform_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credentials" ADD CONSTRAINT "platform_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credentials" ADD CONSTRAINT "platform_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credentials" ADD CONSTRAINT "platform_credentials_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_credential_sessions_session_idx" ON "platform_credential_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "platform_credential_sessions_org_idx" ON "platform_credential_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_credential_sessions_oauth_state_idx" ON "platform_credential_sessions" USING btree ("oauth_state");--> statement-breakpoint
CREATE INDEX "platform_credential_sessions_status_idx" ON "platform_credential_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_credential_sessions_expires_idx" ON "platform_credential_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "platform_credentials_org_idx" ON "platform_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "platform_credentials_user_idx" ON "platform_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "platform_credentials_app_idx" ON "platform_credentials" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_credentials_platform_user_idx" ON "platform_credentials" USING btree ("organization_id","platform","platform_user_id");--> statement-breakpoint
CREATE INDEX "platform_credentials_status_idx" ON "platform_credentials" USING btree ("status");