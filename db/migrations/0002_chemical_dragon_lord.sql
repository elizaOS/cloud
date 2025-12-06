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
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_agent_id_user_characters_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user_characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_events_agent_idx" ON "agent_events" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_events_organization_idx" ON "agent_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_events_event_type_idx" ON "agent_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "agent_events_level_idx" ON "agent_events" USING btree ("level");--> statement-breakpoint
CREATE INDEX "agent_events_created_at_idx" ON "agent_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_events_agent_created_idx" ON "agent_events" USING btree ("agent_id","created_at");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "credit_balance_non_negative" CHECK ("organizations"."credit_balance" >= 0);