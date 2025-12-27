-- Migration: Media Collections & Advertising Platform
-- Description: Add tables for media collections, uploads, ad accounts, campaigns, creatives, and transactions

-- Media Uploads table
CREATE TABLE IF NOT EXISTS "media_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "filename" text NOT NULL,
  "original_filename" text NOT NULL,
  "storage_url" text NOT NULL,
  "thumbnail_url" text,
  "mime_type" text NOT NULL,
  "file_size" bigint NOT NULL,
  "type" text NOT NULL,
  "dimensions" jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "media_uploads_organization_idx" ON "media_uploads" ("organization_id");
CREATE INDEX IF NOT EXISTS "media_uploads_user_idx" ON "media_uploads" ("user_id");
CREATE INDEX IF NOT EXISTS "media_uploads_org_user_idx" ON "media_uploads" ("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "media_uploads_type_idx" ON "media_uploads" ("type");
CREATE INDEX IF NOT EXISTS "media_uploads_created_at_idx" ON "media_uploads" ("created_at");

-- Media Collections table
CREATE TABLE IF NOT EXISTS "media_collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "cover_image_id" uuid REFERENCES "generations"("id") ON DELETE SET NULL,
  "item_count" integer NOT NULL DEFAULT 0,
  "is_default" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "media_collections_organization_idx" ON "media_collections" ("organization_id");
CREATE INDEX IF NOT EXISTS "media_collections_user_idx" ON "media_collections" ("user_id");
CREATE INDEX IF NOT EXISTS "media_collections_org_user_idx" ON "media_collections" ("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "media_collections_name_idx" ON "media_collections" ("name");
CREATE INDEX IF NOT EXISTS "media_collections_created_at_idx" ON "media_collections" ("created_at");

-- Media Collection Items table
CREATE TABLE IF NOT EXISTS "media_collection_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collection_id" uuid NOT NULL REFERENCES "media_collections"("id") ON DELETE CASCADE,
  "generation_id" uuid REFERENCES "generations"("id") ON DELETE CASCADE,
  "upload_id" uuid REFERENCES "media_uploads"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "order_index" integer NOT NULL DEFAULT 0,
  "added_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "media_collection_items_collection_idx" ON "media_collection_items" ("collection_id");
CREATE INDEX IF NOT EXISTS "media_collection_items_generation_idx" ON "media_collection_items" ("generation_id");
CREATE INDEX IF NOT EXISTS "media_collection_items_upload_idx" ON "media_collection_items" ("upload_id");
CREATE UNIQUE INDEX IF NOT EXISTS "media_collection_items_unique_generation" ON "media_collection_items" ("collection_id", "generation_id") WHERE "generation_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "media_collection_items_unique_upload" ON "media_collection_items" ("collection_id", "upload_id") WHERE "upload_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "media_collection_items_order_idx" ON "media_collection_items" ("collection_id", "order_index");

-- Ad Accounts table
CREATE TABLE IF NOT EXISTS "ad_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "connected_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "platform" text NOT NULL,
  "external_account_id" text NOT NULL,
  "account_name" text NOT NULL,
  "access_token_secret_id" uuid REFERENCES "secrets"("id") ON DELETE SET NULL,
  "refresh_token_secret_id" uuid REFERENCES "secrets"("id") ON DELETE SET NULL,
  "token_expires_at" timestamp,
  "status" text NOT NULL DEFAULT 'active',
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ad_accounts_organization_idx" ON "ad_accounts" ("organization_id");
CREATE INDEX IF NOT EXISTS "ad_accounts_platform_idx" ON "ad_accounts" ("platform");
CREATE INDEX IF NOT EXISTS "ad_accounts_org_platform_idx" ON "ad_accounts" ("organization_id", "platform");
CREATE INDEX IF NOT EXISTS "ad_accounts_external_id_idx" ON "ad_accounts" ("external_account_id");
CREATE INDEX IF NOT EXISTS "ad_accounts_status_idx" ON "ad_accounts" ("status");

-- Ad Campaigns table
CREATE TABLE IF NOT EXISTS "ad_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ad_account_id" uuid NOT NULL REFERENCES "ad_accounts"("id") ON DELETE CASCADE,
  "external_campaign_id" text,
  "name" text NOT NULL,
  "platform" text NOT NULL,
  "objective" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "budget_type" text NOT NULL,
  "budget_amount" numeric(12, 2) NOT NULL DEFAULT '0.00',
  "budget_currency" text NOT NULL DEFAULT 'USD',
  "credits_allocated" numeric(12, 2) NOT NULL DEFAULT '0.00',
  "credits_spent" numeric(12, 2) NOT NULL DEFAULT '0.00',
  "start_date" timestamp,
  "end_date" timestamp,
  "targeting" jsonb NOT NULL DEFAULT '{}',
  "total_spend" numeric(12, 2) NOT NULL DEFAULT '0.00',
  "total_impressions" integer NOT NULL DEFAULT 0,
  "total_clicks" integer NOT NULL DEFAULT 0,
  "total_conversions" integer NOT NULL DEFAULT 0,
  "app_id" uuid REFERENCES "apps"("id") ON DELETE SET NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ad_campaigns_organization_idx" ON "ad_campaigns" ("organization_id");
CREATE INDEX IF NOT EXISTS "ad_campaigns_ad_account_idx" ON "ad_campaigns" ("ad_account_id");
CREATE INDEX IF NOT EXISTS "ad_campaigns_platform_idx" ON "ad_campaigns" ("platform");
CREATE INDEX IF NOT EXISTS "ad_campaigns_status_idx" ON "ad_campaigns" ("status");
CREATE INDEX IF NOT EXISTS "ad_campaigns_external_id_idx" ON "ad_campaigns" ("external_campaign_id");
CREATE INDEX IF NOT EXISTS "ad_campaigns_app_idx" ON "ad_campaigns" ("app_id");
CREATE INDEX IF NOT EXISTS "ad_campaigns_created_at_idx" ON "ad_campaigns" ("created_at");
CREATE INDEX IF NOT EXISTS "ad_campaigns_org_status_idx" ON "ad_campaigns" ("organization_id", "status");

-- Ad Creatives table
CREATE TABLE IF NOT EXISTS "ad_creatives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "ad_campaigns"("id") ON DELETE CASCADE,
  "external_creative_id" text,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "headline" text,
  "primary_text" text,
  "description" text,
  "call_to_action" text,
  "destination_url" text,
  "media" jsonb NOT NULL DEFAULT '[]',
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ad_creatives_campaign_idx" ON "ad_creatives" ("campaign_id");
CREATE INDEX IF NOT EXISTS "ad_creatives_type_idx" ON "ad_creatives" ("type");
CREATE INDEX IF NOT EXISTS "ad_creatives_status_idx" ON "ad_creatives" ("status");
CREATE INDEX IF NOT EXISTS "ad_creatives_external_id_idx" ON "ad_creatives" ("external_creative_id");
CREATE INDEX IF NOT EXISTS "ad_creatives_created_at_idx" ON "ad_creatives" ("created_at");

-- Ad Transactions table
CREATE TABLE IF NOT EXISTS "ad_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "ad_campaigns"("id") ON DELETE SET NULL,
  "credit_transaction_id" uuid REFERENCES "credit_transactions"("id") ON DELETE SET NULL,
  "type" text NOT NULL,
  "amount" numeric(12, 4) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "credits_amount" numeric(12, 4) NOT NULL,
  "description" text NOT NULL,
  "external_reference" text,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ad_transactions_organization_idx" ON "ad_transactions" ("organization_id");
CREATE INDEX IF NOT EXISTS "ad_transactions_campaign_idx" ON "ad_transactions" ("campaign_id");
CREATE INDEX IF NOT EXISTS "ad_transactions_credit_tx_idx" ON "ad_transactions" ("credit_transaction_id");
CREATE INDEX IF NOT EXISTS "ad_transactions_type_idx" ON "ad_transactions" ("type");
CREATE INDEX IF NOT EXISTS "ad_transactions_created_at_idx" ON "ad_transactions" ("created_at");
CREATE INDEX IF NOT EXISTS "ad_transactions_org_type_idx" ON "ad_transactions" ("organization_id", "type");
