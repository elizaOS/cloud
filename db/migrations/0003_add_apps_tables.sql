-- Migration: Add Apps Tables
-- Description: Create tables for Apps feature including apps, app_users, and app_analytics

--> statement-breakpoint
CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"slug" text NOT NULL UNIQUE,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"app_url" text NOT NULL,
	"allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"api_key_id" uuid UNIQUE,
	"affiliate_code" text UNIQUE,
	"referral_bonus_credits" numeric(10, 2) DEFAULT '0.00',
	"total_requests" integer DEFAULT 0 NOT NULL,
	"total_users" integer DEFAULT 0 NOT NULL,
	"total_credits_used" numeric(10, 2) DEFAULT '0.00',
	"custom_pricing_enabled" boolean DEFAULT false NOT NULL,
	"custom_pricing_markup" numeric(5, 2) DEFAULT '0.00',
	"features_enabled" jsonb DEFAULT '{"chat":true,"image":false,"video":false,"voice":false,"agents":false,"embedding":false}'::jsonb NOT NULL,
	"rate_limit_per_minute" integer DEFAULT 60,
	"rate_limit_per_hour" integer DEFAULT 1000,
	"logo_url" text,
	"website_url" text,
	"contact_email" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_approved" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL REFERENCES "apps"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
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
CREATE TABLE "app_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL REFERENCES "apps"("id") ON DELETE CASCADE,
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

-- Create indexes for apps table
CREATE INDEX "apps_slug_idx" ON "apps" ("slug");
--> statement-breakpoint
CREATE INDEX "apps_organization_idx" ON "apps" ("organization_id");
--> statement-breakpoint
CREATE INDEX "apps_created_by_idx" ON "apps" ("created_by_user_id");
--> statement-breakpoint
CREATE INDEX "apps_affiliate_code_idx" ON "apps" ("affiliate_code");
--> statement-breakpoint
CREATE INDEX "apps_is_active_idx" ON "apps" ("is_active");
--> statement-breakpoint
CREATE INDEX "apps_created_at_idx" ON "apps" ("created_at");
--> statement-breakpoint

-- Create indexes for app_users table
CREATE INDEX "app_users_app_id_idx" ON "app_users" ("app_id");
--> statement-breakpoint
CREATE INDEX "app_users_user_id_idx" ON "app_users" ("user_id");
--> statement-breakpoint
CREATE INDEX "app_users_app_user_idx" ON "app_users" ("app_id", "user_id");
--> statement-breakpoint
CREATE INDEX "app_users_first_seen_idx" ON "app_users" ("first_seen_at");
--> statement-breakpoint

-- Create indexes for app_analytics table
CREATE INDEX "app_analytics_app_id_idx" ON "app_analytics" ("app_id");
--> statement-breakpoint
CREATE INDEX "app_analytics_period_idx" ON "app_analytics" ("period_start", "period_end");
--> statement-breakpoint
CREATE INDEX "app_analytics_period_type_idx" ON "app_analytics" ("period_type");
--> statement-breakpoint
CREATE INDEX "app_analytics_app_period_idx" ON "app_analytics" ("app_id", "period_start");
--> statement-breakpoint

-- Add foreign key for api_key_id in apps table (optional relationship)
-- Note: This is done after api_keys table exists
ALTER TABLE "apps" ADD CONSTRAINT "apps_api_key_id_fk" 
  FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL;

