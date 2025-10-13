CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"version" text NOT NULL,
	"checksum" text NOT NULL,
	"size" integer NOT NULL,
	"r2_key" text NOT NULL,
	"r2_url" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_artifacts_org_project" ON "artifacts" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_artifacts_project_version" ON "artifacts" USING btree ("project_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_artifact_version" ON "artifacts" USING btree ("organization_id","project_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "containers_org_name_unique_idx" ON "containers" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "containers_org_status_idx" ON "containers" USING btree ("organization_id","status");