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
CREATE TABLE "fragment_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"fragment_data" jsonb NOT NULL,
	"template" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"deployed_app_id" uuid,
	"deployed_container_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deployed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "miniapp_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"bundle_url" text NOT NULL,
	"entry_file" text DEFAULT 'index.html' NOT NULL,
	"framework" text,
	"build_hash" text,
	"bundle_size" integer,
	"source_project_id" uuid,
	"source_type" text DEFAULT 'fragment',
	"runtime_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'deploying' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deployed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "miniapp_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"subdomain" text NOT NULL,
	"custom_domain" text,
	"custom_domain_verified" boolean DEFAULT false NOT NULL,
	"verification_records" jsonb DEFAULT '[]'::jsonb,
	"ssl_status" text DEFAULT 'pending' NOT NULL,
	"ssl_error" text,
	"vercel_project_id" text,
	"vercel_domain_id" text,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "n8n_instances" ADD CONSTRAINT "n8n_instances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_instances" ADD CONSTRAINT "n8n_instances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_api_keys" ADD CONSTRAINT "n8n_workflow_api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_api_keys" ADD CONSTRAINT "n8n_workflow_api_keys_workflow_id_n8n_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."n8n_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_executions" ADD CONSTRAINT "n8n_workflow_executions_workflow_id_n8n_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."n8n_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_executions" ADD CONSTRAINT "n8n_workflow_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_executions" ADD CONSTRAINT "n8n_workflow_executions_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_triggers" ADD CONSTRAINT "n8n_workflow_triggers_workflow_id_n8n_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."n8n_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_triggers" ADD CONSTRAINT "n8n_workflow_triggers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_variables" ADD CONSTRAINT "n8n_workflow_variables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_variables" ADD CONSTRAINT "n8n_workflow_variables_workflow_id_n8n_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."n8n_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_versions" ADD CONSTRAINT "n8n_workflow_versions_workflow_id_n8n_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."n8n_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_versions" ADD CONSTRAINT "n8n_workflow_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflow_versions" ADD CONSTRAINT "n8n_workflow_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflows" ADD CONSTRAINT "n8n_workflows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflows" ADD CONSTRAINT "n8n_workflows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_workflows" ADD CONSTRAINT "n8n_workflows_n8n_instance_id_n8n_instances_id_fk" FOREIGN KEY ("n8n_instance_id") REFERENCES "public"."n8n_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fragment_projects" ADD CONSTRAINT "fragment_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fragment_projects" ADD CONSTRAINT "fragment_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fragment_projects" ADD CONSTRAINT "fragment_projects_deployed_app_id_apps_id_fk" FOREIGN KEY ("deployed_app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_bundles" ADD CONSTRAINT "miniapp_bundles_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_domains" ADD CONSTRAINT "miniapp_domains_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "n8n_instances_org_id_idx" ON "n8n_instances" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "n8n_instances_user_id_idx" ON "n8n_instances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "n8n_instances_org_default_idx" ON "n8n_instances" USING btree ("organization_id","is_default");--> statement-breakpoint
CREATE INDEX "n8n_workflow_api_keys_org_id_idx" ON "n8n_workflow_api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "n8n_workflow_api_keys_workflow_id_idx" ON "n8n_workflow_api_keys" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "n8n_workflow_api_keys_key_prefix_idx" ON "n8n_workflow_api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "n8n_workflow_executions_workflow_id_idx" ON "n8n_workflow_executions" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "n8n_workflow_executions_org_id_idx" ON "n8n_workflow_executions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "n8n_workflow_executions_status_idx" ON "n8n_workflow_executions" USING btree ("workflow_id","status");--> statement-breakpoint
CREATE INDEX "n8n_workflow_executions_created_at_idx" ON "n8n_workflow_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "n8n_workflow_triggers_workflow_id_idx" ON "n8n_workflow_triggers" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "n8n_workflow_triggers_org_id_idx" ON "n8n_workflow_triggers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "n8n_workflow_triggers_trigger_type_idx" ON "n8n_workflow_triggers" USING btree ("trigger_type","is_active");--> statement-breakpoint
CREATE INDEX "n8n_workflow_triggers_trigger_key_idx" ON "n8n_workflow_triggers" USING btree ("trigger_key");--> statement-breakpoint
CREATE UNIQUE INDEX "n8n_workflow_variables_org_workflow_name_idx" ON "n8n_workflow_variables" USING btree ("organization_id","workflow_id","name");--> statement-breakpoint
CREATE INDEX "n8n_workflow_variables_org_id_idx" ON "n8n_workflow_variables" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "n8n_workflow_variables_workflow_id_idx" ON "n8n_workflow_variables" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "n8n_workflow_versions_workflow_version_idx" ON "n8n_workflow_versions" USING btree ("workflow_id","version");--> statement-breakpoint
CREATE INDEX "n8n_workflow_versions_workflow_id_idx" ON "n8n_workflow_versions" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "n8n_workflow_versions_org_id_idx" ON "n8n_workflow_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "n8n_workflows_org_id_idx" ON "n8n_workflows" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "n8n_workflows_user_id_idx" ON "n8n_workflows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "n8n_workflows_status_idx" ON "n8n_workflows" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "n8n_workflows_n8n_instance_idx" ON "n8n_workflows" USING btree ("n8n_instance_id");--> statement-breakpoint
CREATE INDEX "fragment_projects_organization_idx" ON "fragment_projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fragment_projects_user_idx" ON "fragment_projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fragment_projects_status_idx" ON "fragment_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fragment_projects_deployed_app_idx" ON "fragment_projects" USING btree ("deployed_app_id");--> statement-breakpoint
CREATE INDEX "miniapp_bundles_app_id_idx" ON "miniapp_bundles" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "miniapp_bundles_app_version_idx" ON "miniapp_bundles" USING btree ("app_id","version");--> statement-breakpoint
CREATE INDEX "miniapp_bundles_is_active_idx" ON "miniapp_bundles" USING btree ("app_id","is_active");--> statement-breakpoint
CREATE INDEX "miniapp_bundles_status_idx" ON "miniapp_bundles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "miniapp_bundles_source_project_idx" ON "miniapp_bundles" USING btree ("source_project_id");--> statement-breakpoint
CREATE INDEX "miniapp_domains_app_id_idx" ON "miniapp_domains" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "miniapp_domains_subdomain_idx" ON "miniapp_domains" USING btree ("subdomain");--> statement-breakpoint
CREATE UNIQUE INDEX "miniapp_domains_custom_domain_idx" ON "miniapp_domains" USING btree ("custom_domain");--> statement-breakpoint
CREATE INDEX "miniapp_domains_vercel_domain_idx" ON "miniapp_domains" USING btree ("vercel_domain_id");