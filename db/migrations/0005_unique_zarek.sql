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
ALTER TABLE "usage_quotas" ADD CONSTRAINT "usage_quotas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_quotas_org_id_idx" ON "usage_quotas" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "usage_quotas_quota_type_idx" ON "usage_quotas" USING btree ("quota_type");--> statement-breakpoint
CREATE INDEX "usage_quotas_period_idx" ON "usage_quotas" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "usage_quotas_active_idx" ON "usage_quotas" USING btree ("is_active");