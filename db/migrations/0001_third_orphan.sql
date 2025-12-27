CREATE TABLE "miniapp_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"schema" jsonb NOT NULL,
	"indexes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_writable" boolean DEFAULT true NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"storage_quota_bytes" integer DEFAULT 0 NOT NULL,
	"storage_used_bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "miniapp_document_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"previous_data" jsonb,
	"new_data" jsonb,
	"changed_by" uuid,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "miniapp_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"idx_str_1" text,
	"idx_str_2" text,
	"idx_str_3" text,
	"idx_str_4" text,
	"idx_num_1" numeric(20, 8),
	"idx_num_2" numeric(20, 8),
	"idx_bool_1" boolean,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "miniapp_collections" ADD CONSTRAINT "miniapp_collections_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_document_changes" ADD CONSTRAINT "miniapp_document_changes_document_id_miniapp_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."miniapp_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_document_changes" ADD CONSTRAINT "miniapp_document_changes_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_document_changes" ADD CONSTRAINT "miniapp_document_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_documents" ADD CONSTRAINT "miniapp_documents_collection_id_miniapp_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."miniapp_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_documents" ADD CONSTRAINT "miniapp_documents_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_documents" ADD CONSTRAINT "miniapp_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_documents" ADD CONSTRAINT "miniapp_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "miniapp_collections_app_name_idx" ON "miniapp_collections" USING btree ("app_id","name");--> statement-breakpoint
CREATE INDEX "miniapp_collections_app_id_idx" ON "miniapp_collections" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "miniapp_document_changes_document_idx" ON "miniapp_document_changes" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "miniapp_document_changes_app_idx" ON "miniapp_document_changes" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "miniapp_document_changes_changed_at_idx" ON "miniapp_document_changes" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "miniapp_documents_app_collection_idx" ON "miniapp_documents" USING btree ("app_id","collection_id");--> statement-breakpoint
CREATE INDEX "miniapp_documents_idx_str_1_idx" ON "miniapp_documents" USING btree ("app_id","collection_id","idx_str_1");--> statement-breakpoint
CREATE INDEX "miniapp_documents_idx_str_2_idx" ON "miniapp_documents" USING btree ("app_id","collection_id","idx_str_2");--> statement-breakpoint
CREATE INDEX "miniapp_documents_idx_str_3_idx" ON "miniapp_documents" USING btree ("app_id","collection_id","idx_str_3");--> statement-breakpoint
CREATE INDEX "miniapp_documents_idx_str_4_idx" ON "miniapp_documents" USING btree ("app_id","collection_id","idx_str_4");--> statement-breakpoint
CREATE INDEX "miniapp_documents_idx_num_1_idx" ON "miniapp_documents" USING btree ("app_id","collection_id","idx_num_1");--> statement-breakpoint
CREATE INDEX "miniapp_documents_idx_num_2_idx" ON "miniapp_documents" USING btree ("app_id","collection_id","idx_num_2");--> statement-breakpoint
CREATE INDEX "miniapp_documents_idx_bool_1_idx" ON "miniapp_documents" USING btree ("app_id","collection_id","idx_bool_1");--> statement-breakpoint
CREATE INDEX "miniapp_documents_created_by_idx" ON "miniapp_documents" USING btree ("app_id","collection_id","created_by");--> statement-breakpoint
CREATE INDEX "miniapp_documents_deleted_at_idx" ON "miniapp_documents" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "miniapp_documents_data_gin_idx" ON "miniapp_documents" USING gin ("data");