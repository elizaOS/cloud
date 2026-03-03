CREATE TABLE "agent_server_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" uuid,
	"privy_wallet_id" text NOT NULL,
	"address" text NOT NULL,
	"chain_type" text NOT NULL,
	"client_pubkey" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_server_wallets" ADD CONSTRAINT "agent_server_wallets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_server_wallets" ADD CONSTRAINT "agent_server_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_server_wallets" ADD CONSTRAINT "agent_server_wallets_character_id_user_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."user_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_server_wallets_organization_idx" ON "agent_server_wallets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_server_wallets_user_idx" ON "agent_server_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_server_wallets_character_idx" ON "agent_server_wallets" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "agent_server_wallets_privy_wallet_idx" ON "agent_server_wallets" USING btree ("privy_wallet_id");--> statement-breakpoint
CREATE INDEX "agent_server_wallets_address_idx" ON "agent_server_wallets" USING btree ("address");--> statement-breakpoint
CREATE INDEX "agent_server_wallets_client_pubkey_idx" ON "agent_server_wallets" USING btree ("client_pubkey");