-- Migration: Add Free Tier LLM System
-- Created: 2025-10-31
-- Description: Adds model categories, free model usage tracking, and organization tier system

-- Create model_categories table
CREATE TABLE IF NOT EXISTS "model_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "model" varchar(255) NOT NULL,
  "provider" varchar(100) NOT NULL,
  "category" varchar(50) NOT NULL,
  "tier_required" varchar(50),
  "rate_limit_per_minute" integer,
  "rate_limit_per_day" integer,
  "is_active" boolean DEFAULT true NOT NULL,
  "features" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for model_categories
CREATE INDEX IF NOT EXISTS "model_categories_model_provider_idx" ON "model_categories" ("model", "provider");
CREATE INDEX IF NOT EXISTS "model_categories_category_idx" ON "model_categories" ("category");
CREATE INDEX IF NOT EXISTS "model_categories_tier_idx" ON "model_categories" ("tier_required");
CREATE INDEX IF NOT EXISTS "model_categories_provider_idx" ON "model_categories" ("provider");
CREATE INDEX IF NOT EXISTS "model_categories_active_idx" ON "model_categories" ("is_active");

-- Create free_model_usage table
CREATE TABLE IF NOT EXISTS "free_model_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "model" varchar(255) NOT NULL,
  "provider" varchar(100) NOT NULL,
  "request_count" integer DEFAULT 1 NOT NULL,
  "token_count" integer DEFAULT 0 NOT NULL,
  "date" date DEFAULT CURRENT_DATE NOT NULL,
  "hour" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for free_model_usage
CREATE INDEX IF NOT EXISTS "free_model_usage_org_user_model_date_hour_idx" ON "free_model_usage" ("organization_id", "user_id", "model", "provider", "date", "hour");
CREATE INDEX IF NOT EXISTS "free_model_usage_org_date_idx" ON "free_model_usage" ("organization_id", "date");
CREATE INDEX IF NOT EXISTS "free_model_usage_user_date_idx" ON "free_model_usage" ("user_id", "date");
CREATE INDEX IF NOT EXISTS "free_model_usage_model_idx" ON "free_model_usage" ("model");

-- Add tier columns to organizations table
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "tier" text DEFAULT 'free' NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "tier_started_at" timestamp DEFAULT now() NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "tier_expires_at" timestamp;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "monthly_free_credits" numeric(10, 2) DEFAULT '0.00' NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "free_credits_used_this_month" numeric(10, 2) DEFAULT '0.00' NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "free_credits_reset_at" timestamp DEFAULT now() NOT NULL;

-- Create index for tier
CREATE INDEX IF NOT EXISTS "organizations_tier_idx" ON "organizations" ("tier");

-- Insert seed data for free models
INSERT INTO "model_categories" ("model", "provider", "category", "tier_required", "rate_limit_per_minute", "rate_limit_per_day", "features", "metadata") VALUES
-- Groq free models
('llama-3.3-70b-versatile', 'groq', 'free', NULL, 30, 14400, '{"max_tokens": 8192, "supports_streaming": true, "supports_tools": true}', '{"description": "Meta Llama 3.3 70B - Fast and versatile model via Groq", "context_window": 8192}'),
('mixtral-8x7b-32768', 'groq', 'free', NULL, 30, 14400, '{"max_tokens": 32768, "supports_streaming": true}', '{"description": "Mixtral 8x7B - Large context window via Groq", "context_window": 32768}'),
('gemma-7b-it', 'groq', 'free', NULL, 30, 14400, '{"max_tokens": 8192, "supports_streaming": true}', '{"description": "Google Gemma 7B Instruct via Groq", "context_window": 8192}'),

-- Together AI free models
('meta-llama/Llama-3-70b-chat-hf', 'together', 'free', NULL, 60, 20000, '{"max_tokens": 8192, "supports_streaming": true}', '{"description": "Meta Llama 3 70B Chat via Together AI", "context_window": 8192}'),
('mistralai/Mixtral-8x7B-Instruct-v0.1', 'together', 'free', NULL, 60, 20000, '{"max_tokens": 32768, "supports_streaming": true}', '{"description": "Mistral Mixtral 8x7B Instruct via Together AI", "context_window": 32768}'),

-- Google Gemini Flash (free tier)
('gemini-1.5-flash', 'google', 'free', NULL, 15, 1500, '{"max_tokens": 8192, "supports_streaming": true, "monthly_token_limit": 1000000}', '{"description": "Google Gemini 1.5 Flash - Free tier with 1M tokens/month", "context_window": 32768}'),

-- Hugging Face embedding models (free)
('sentence-transformers/all-MiniLM-L6-v2', 'huggingface', 'free', NULL, 100, 30000, '{"dimensions": 384, "max_batch_size": 100}', '{"description": "Sentence Transformers embedding model - 384 dimensions", "type": "embedding"}'),
('BAAI/bge-small-en-v1.5', 'huggingface', 'free', NULL, 100, 30000, '{"dimensions": 384}', '{"description": "BAAI BGE Small embedding model - 384 dimensions", "type": "embedding"}'),

-- Paid models for comparison
('gpt-4o', 'openai', 'paid', 'starter', 60, 10000, '{"max_tokens": 16384, "supports_streaming": true, "supports_tools": true, "supports_vision": true}', '{"description": "GPT-4 Omni - Advanced multimodal model", "context_window": 128000}'),
('gpt-4o-mini', 'openai', 'paid', NULL, 60, 10000, '{"max_tokens": 16384, "supports_streaming": true, "supports_vision": true}', '{"description": "GPT-4 Omni Mini - Cost-effective multimodal model", "context_window": 128000}'),
('claude-3-5-sonnet-20241022', 'anthropic', 'premium', 'pro', 50, 5000, '{"max_tokens": 8192, "supports_streaming": true, "supports_tools": true}', '{"description": "Claude 3.5 Sonnet - Advanced reasoning model", "context_window": 200000}')
ON CONFLICT DO NOTHING;
