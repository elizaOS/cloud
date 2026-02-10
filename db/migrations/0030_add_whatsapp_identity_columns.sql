-- Migration: Add WhatsApp identity columns to users table
-- Supports WhatsApp authentication for Eliza App
-- Generated via: npx drizzle-kit generate --custom --name=add_whatsapp_identity_columns

-- Add WhatsApp identity columns (uses IF NOT EXISTS for idempotency)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsapp_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsapp_name" text;--> statement-breakpoint

-- Add unique constraint on whatsapp_id (idempotent - checks if exists first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_whatsapp_id_unique'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_whatsapp_id_unique" UNIQUE ("whatsapp_id");
  END IF;
END $$;--> statement-breakpoint

-- Create partial index for efficient lookups (only indexes non-null values)
CREATE INDEX IF NOT EXISTS "users_whatsapp_id_idx" ON "users" ("whatsapp_id") WHERE "whatsapp_id" IS NOT NULL;--> statement-breakpoint

-- Add 'whatsapp' to phone_provider enum if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'whatsapp' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'phone_provider')
  ) THEN
    ALTER TYPE phone_provider ADD VALUE 'whatsapp';
  END IF;
END $$;--> statement-breakpoint

-- Add 'whatsapp' to phone_type enum if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'whatsapp' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'phone_type')
  ) THEN
    ALTER TYPE phone_type ADD VALUE 'whatsapp';
  END IF;
END $$;
