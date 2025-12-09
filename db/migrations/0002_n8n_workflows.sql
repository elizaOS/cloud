-- Migration: N8N Workflow Miniapp Tables
-- Creates tables for n8n workflow management with version control, variables, API keys, and executions

CREATE TABLE "n8n_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"endpoint" text NOT NULL,
	"api_key" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "n8n_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"workflow_data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"n8n_instance_id" uuid,
	"n8n_workflow_id" text,
	"is_active_in_n8n" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "n8n_workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"workflow_data" jsonb NOT NULL,
	"change_description" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "n8n_workflow_variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_id" uuid,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"type" text DEFAULT 'string' NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "n8n_workflow_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_id" uuid,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "n8n_workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_type" text DEFAULT 'test' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"input_data" jsonb,
	"output_data" jsonb,
	"error_message" text,
	"duration_ms" integer,
	"n8n_execution_id" text,
	"triggered_by" uuid,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "n8n_instances" ADD CONSTRAINT "n8n_instances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_instances" ADD CONSTRAINT "n8n_instances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflows" ADD CONSTRAINT "n8n_workflows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflows" ADD CONSTRAINT "n8n_workflows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflows" ADD CONSTRAINT "n8n_workflows_n8n_instance_id_n8n_instances_id_fk" FOREIGN KEY ("n8n_instance_id") REFERENCES "public"."n8n_instances"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflow_versions" ADD CONSTRAINT "n8n_workflow_versions_workflow_id_n8n_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."n8n_workflows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflow_versions" ADD CONSTRAINT "n8n_workflow_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflow_versions" ADD CONSTRAINT "n8n_workflow_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflow_variables" ADD CONSTRAINT "n8n_workflow_variables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflow_variables" ADD CONSTRAINT "n8n_workflow_variables_workflow_id_n8n_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."n8n_workflows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflow_api_keys" ADD CONSTRAINT "n8n_workflow_api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflow_api_keys" ADD CONSTRAINT "n8n_workflow_api_keys_workflow_id_n8n_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."n8n_workflows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflow_executions" ADD CONSTRAINT "n8n_workflow_executions_workflow_id_n8n_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."n8n_workflows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflow_executions" ADD CONSTRAINT "n8n_workflow_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflow_executions" ADD CONSTRAINT "n8n_workflow_executions_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "n8n_instances_org_id_idx" ON "n8n_instances"("organization_id");
--> statement-breakpoint
CREATE INDEX "n8n_instances_user_id_idx" ON "n8n_instances"("user_id");
--> statement-breakpoint
CREATE INDEX "n8n_instances_org_default_idx" ON "n8n_instances"("organization_id","is_default");
--> statement-breakpoint
CREATE INDEX "n8n_workflows_org_id_idx" ON "n8n_workflows"("organization_id");
--> statement-breakpoint
CREATE INDEX "n8n_workflows_user_id_idx" ON "n8n_workflows"("user_id");
--> statement-breakpoint
CREATE INDEX "n8n_workflows_status_idx" ON "n8n_workflows"("organization_id","status");
--> statement-breakpoint
CREATE INDEX "n8n_workflows_n8n_instance_idx" ON "n8n_workflows"("n8n_instance_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "n8n_workflow_versions_workflow_version_idx" ON "n8n_workflow_versions"("workflow_id","version");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_versions_workflow_id_idx" ON "n8n_workflow_versions"("workflow_id");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_versions_org_id_idx" ON "n8n_workflow_versions"("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "n8n_workflow_variables_org_workflow_name_idx" ON "n8n_workflow_variables"("organization_id","workflow_id","name");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_variables_org_id_idx" ON "n8n_workflow_variables"("organization_id");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_variables_workflow_id_idx" ON "n8n_workflow_variables"("workflow_id");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_api_keys_org_id_idx" ON "n8n_workflow_api_keys"("organization_id");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_api_keys_workflow_id_idx" ON "n8n_workflow_api_keys"("workflow_id");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_api_keys_key_prefix_idx" ON "n8n_workflow_api_keys"("key_prefix");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_executions_workflow_id_idx" ON "n8n_workflow_executions"("workflow_id");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_executions_org_id_idx" ON "n8n_workflow_executions"("organization_id");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_executions_status_idx" ON "n8n_workflow_executions"("workflow_id","status");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_executions_created_at_idx" ON "n8n_workflow_executions"("created_at");
--> statement-breakpoint
CREATE TABLE "n8n_workflow_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"trigger_type" text NOT NULL,
	"config" jsonb NOT NULL,
	"trigger_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_executed_at" timestamp,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "n8n_workflow_triggers" ADD CONSTRAINT "n8n_workflow_triggers_workflow_id_n8n_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."n8n_workflows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "n8n_workflow_triggers" ADD CONSTRAINT "n8n_workflow_triggers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "n8n_workflow_triggers_workflow_id_idx" ON "n8n_workflow_triggers"("workflow_id");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_triggers_org_id_idx" ON "n8n_workflow_triggers"("organization_id");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_triggers_trigger_type_idx" ON "n8n_workflow_triggers"("trigger_type","is_active");
--> statement-breakpoint
CREATE INDEX "n8n_workflow_triggers_trigger_key_idx" ON "n8n_workflow_triggers"("trigger_key");

