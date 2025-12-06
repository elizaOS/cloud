CREATE TYPE "public"."share_type" AS ENUM('app_share', 'character_share', 'invite_share');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('x', 'farcaster', 'telegram', 'discord');--> statement-breakpoint
CREATE TABLE "miniapp_auth_sessions" (
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
	CONSTRAINT "miniapp_auth_sessions_session_id_unique" UNIQUE("session_id")
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
	"total_creator_earnings" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_platform_revenue" numeric(12, 2) DEFAULT '0.00' NOT NULL,
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_credit_balances_balance_non_negative" CHECK ("credit_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"total_lifetime_earnings" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_inference_earnings" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_purchase_earnings" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"pending_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"withdrawable_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_withdrawn" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"last_withdrawal_at" timestamp,
	"payout_threshold" numeric(10, 2) DEFAULT '10.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_earnings_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
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
ALTER TABLE "user_characters" ADD COLUMN "source" text DEFAULT 'cloud' NOT NULL;--> statement-breakpoint
ALTER TABLE "miniapp_auth_sessions" ADD CONSTRAINT "miniapp_auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_auth_sessions" ADD CONSTRAINT "miniapp_auth_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_analytics" ADD CONSTRAINT "app_analytics_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "social_share_rewards" ADD CONSTRAINT "social_share_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_analytics_app_id_idx" ON "app_analytics" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_analytics_period_idx" ON "app_analytics" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "app_analytics_period_type_idx" ON "app_analytics" USING btree ("period_type");--> statement-breakpoint
CREATE INDEX "app_analytics_app_period_idx" ON "app_analytics" USING btree ("app_id","period_start");--> statement-breakpoint
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
CREATE INDEX "user_characters_source_idx" ON "user_characters" USING btree ("source");