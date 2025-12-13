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
ALTER TABLE "organizations" ALTER COLUMN "credit_balance" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "credit_balance" SET DEFAULT '100.00';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "privy_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_records" ALTER COLUMN "input_cost" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "usage_records" ALTER COLUMN "input_cost" SET DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "usage_records" ALTER COLUMN "output_cost" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "usage_records" ALTER COLUMN "output_cost" SET DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "usage_records" ALTER COLUMN "markup" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "usage_records" ALTER COLUMN "markup" SET DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "credit_transactions" ALTER COLUMN "amount" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "credit_packs" ALTER COLUMN "credits" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "generations" ALTER COLUMN "cost" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "generations" ALTER COLUMN "cost" SET DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "generations" ALTER COLUMN "credits" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "generations" ALTER COLUMN "credits" SET DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "conversation_messages" ALTER COLUMN "cost" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "conversation_messages" ALTER COLUMN "cost" SET DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "total_cost" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "total_cost" SET DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "user_voices" ALTER COLUMN "creation_cost" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymous_session_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "anonymous_sessions" ADD CONSTRAINT "anonymous_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anon_sessions_token_idx" ON "anonymous_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "anon_sessions_user_id_idx" ON "anonymous_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "anon_sessions_expires_at_idx" ON "anonymous_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "anon_sessions_ip_address_idx" ON "anonymous_sessions" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "anon_sessions_is_active_idx" ON "anonymous_sessions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "users_is_anonymous_idx" ON "users" USING btree ("is_anonymous");--> statement-breakpoint
CREATE INDEX "users_anonymous_session_idx" ON "users" USING btree ("anonymous_session_id");--> statement-breakpoint
CREATE INDEX "users_expires_at_idx" ON "users" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_anonymous_session_id_unique" UNIQUE("anonymous_session_id");