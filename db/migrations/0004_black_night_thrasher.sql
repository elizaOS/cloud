CREATE TABLE "containers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"api_key_id" uuid,
	"cloudflare_worker_id" text,
	"cloudflare_container_id" text,
	"cloudflare_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"image_tag" text,
	"dockerfile_path" text,
	"environment_vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_instances" integer DEFAULT 1 NOT NULL,
	"port" integer DEFAULT 3000 NOT NULL,
	"health_check_path" text DEFAULT '/health',
	"last_deployed_at" timestamp,
	"last_health_check" timestamp,
	"deployment_log" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "containers_organization_idx" ON "containers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "containers_user_idx" ON "containers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "containers_status_idx" ON "containers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "containers_cloudflare_worker_idx" ON "containers" USING btree ("cloudflare_worker_id");