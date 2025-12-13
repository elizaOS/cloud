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
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "containers" ALTER COLUMN "memory" SET DEFAULT 1792;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wallet_address" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wallet_chain_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wallet_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_characters" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "user_characters" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "user_characters" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "user_characters" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_characters" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_characters" ADD COLUMN "interaction_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_characters" ADD COLUMN "popularity_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "containers" ADD COLUMN "architecture" text DEFAULT 'arm64' NOT NULL;--> statement-breakpoint
ALTER TABLE "cli_auth_sessions" ADD CONSTRAINT "cli_auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cli_auth_sessions_session_id_idx" ON "cli_auth_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "cli_auth_sessions_status_idx" ON "cli_auth_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cli_auth_sessions_user_id_idx" ON "cli_auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cli_auth_sessions_expires_at_idx" ON "cli_auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_wallet_address_idx" ON "users" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "users_wallet_chain_type_idx" ON "users" USING btree ("wallet_chain_type");--> statement-breakpoint
CREATE INDEX "user_characters_category_idx" ON "user_characters" USING btree ("category");--> statement-breakpoint
CREATE INDEX "user_characters_featured_idx" ON "user_characters" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "user_characters_is_template_idx" ON "user_characters" USING btree ("is_template");--> statement-breakpoint
CREATE INDEX "user_characters_is_public_idx" ON "user_characters" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "user_characters_popularity_idx" ON "user_characters" USING btree ("popularity_score");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address");