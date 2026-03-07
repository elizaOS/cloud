CREATE TABLE "service_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" text NOT NULL,
	"method" text NOT NULL,
	"cost" numeric(12, 6) NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_pricing_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_pricing_id" uuid,
	"service_id" text NOT NULL,
	"method" text NOT NULL,
	"old_cost" numeric(12, 6),
	"new_cost" numeric(12, 6) NOT NULL,
	"change_type" text NOT NULL,
	"changed_by" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_pricing_audit" ADD CONSTRAINT "service_pricing_audit_service_pricing_id_service_pricing_id_fk" FOREIGN KEY ("service_pricing_id") REFERENCES "public"."service_pricing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_pricing_service_method_idx" ON "service_pricing" USING btree ("service_id","method");
