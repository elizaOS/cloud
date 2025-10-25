-- Create user_voices table
CREATE TABLE IF NOT EXISTS "user_voices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "elevenlabs_voice_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "clone_type" text NOT NULL CHECK (clone_type IN ('instant', 'professional')),
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
  CONSTRAINT "user_voices_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "user_voices_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Create voice_cloning_jobs table
CREATE TABLE IF NOT EXISTS "voice_cloning_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "job_type" text NOT NULL CHECK (job_type IN ('instant', 'professional')),
  "voice_name" text NOT NULL,
  "voice_description" text,
  "status" text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  "progress" integer DEFAULT 0 NOT NULL CHECK (progress >= 0 AND progress <= 100),
  "user_voice_id" uuid,
  "elevenlabs_voice_id" text,
  "error_message" text,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "voice_cloning_jobs_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "voice_cloning_jobs_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "voice_cloning_jobs_user_voice_id_fk" FOREIGN KEY ("user_voice_id") REFERENCES "user_voices"("id") ON DELETE SET NULL
);

-- Create voice_samples table
CREATE TABLE IF NOT EXISTS "voice_samples" (
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
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "voice_samples_user_voice_id_fk" FOREIGN KEY ("user_voice_id") REFERENCES "user_voices"("id") ON DELETE CASCADE,
  CONSTRAINT "voice_samples_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "voice_cloning_jobs"("id") ON DELETE CASCADE,
  CONSTRAINT "voice_samples_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "voice_samples_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Create indexes for user_voices
CREATE INDEX IF NOT EXISTS "idx_user_voices_organization" ON "user_voices"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_user_voices_user" ON "user_voices"("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_voices_elevenlabs_id" ON "user_voices"("elevenlabs_voice_id");
CREATE INDEX IF NOT EXISTS "idx_user_voices_active" ON "user_voices"("is_active") WHERE "is_active" = true;
CREATE INDEX IF NOT EXISTS "idx_user_voices_public" ON "user_voices"("is_public") WHERE "is_public" = true;

-- Create indexes for voice_cloning_jobs
CREATE INDEX IF NOT EXISTS "idx_voice_cloning_jobs_organization" ON "voice_cloning_jobs"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_voice_cloning_jobs_user" ON "voice_cloning_jobs"("user_id");
CREATE INDEX IF NOT EXISTS "idx_voice_cloning_jobs_status" ON "voice_cloning_jobs"("status");
CREATE INDEX IF NOT EXISTS "idx_voice_cloning_jobs_created" ON "voice_cloning_jobs"("created_at" DESC);

-- Create indexes for voice_samples
CREATE INDEX IF NOT EXISTS "idx_voice_samples_user_voice" ON "voice_samples"("user_voice_id");
CREATE INDEX IF NOT EXISTS "idx_voice_samples_job" ON "voice_samples"("job_id");
CREATE INDEX IF NOT EXISTS "idx_voice_samples_organization" ON "voice_samples"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_voice_samples_user" ON "voice_samples"("user_id");

