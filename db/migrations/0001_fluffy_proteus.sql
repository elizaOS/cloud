CREATE TABLE "user_voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"elevenlabs_voice_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"clone_type" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"total_audio_duration_seconds" integer,
	"audio_quality_score" numeric(3, 2),
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"creation_cost" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_voices_elevenlabs_voice_id_unique" UNIQUE("elevenlabs_voice_id")
);
--> statement-breakpoint
CREATE TABLE "voice_cloning_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"voice_name" text NOT NULL,
	"voice_description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"user_voice_id" uuid,
	"elevenlabs_voice_id" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_voice_id" uuid,
	"job_id" uuid,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_type" text NOT NULL,
	"blob_url" text NOT NULL,
	"duration_seconds" numeric(10, 2),
	"sample_rate" integer,
	"channels" integer,
	"quality_score" numeric(3, 2),
	"is_processed" boolean DEFAULT false NOT NULL,
	"transcription" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "containers" ALTER COLUMN "memory" SET DEFAULT 896;--> statement-breakpoint
ALTER TABLE "user_voices" ADD CONSTRAINT "user_voices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_voices" ADD CONSTRAINT "user_voices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cloning_jobs" ADD CONSTRAINT "voice_cloning_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cloning_jobs" ADD CONSTRAINT "voice_cloning_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cloning_jobs" ADD CONSTRAINT "voice_cloning_jobs_user_voice_id_user_voices_id_fk" FOREIGN KEY ("user_voice_id") REFERENCES "public"."user_voices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_user_voice_id_user_voices_id_fk" FOREIGN KEY ("user_voice_id") REFERENCES "public"."user_voices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_job_id_voice_cloning_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."voice_cloning_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_voices_organization_idx" ON "user_voices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_voices_user_idx" ON "user_voices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_voices_org_type_idx" ON "user_voices" USING btree ("organization_id","clone_type");--> statement-breakpoint
CREATE INDEX "user_voices_org_usage_idx" ON "user_voices" USING btree ("organization_id","usage_count","last_used_at");--> statement-breakpoint
CREATE INDEX "usage_records_org_type_created_idx" ON "usage_records" USING btree ("organization_id","type","created_at");