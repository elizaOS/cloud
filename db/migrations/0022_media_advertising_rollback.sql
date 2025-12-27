-- Rollback Migration: Media Collections & Advertising Platform
-- Run this to revert migration 0022_media_advertising.sql
-- WARNING: This will delete all data in these tables

-- Drop in reverse order of creation (due to foreign key dependencies)

-- Ad Transactions (no dependencies on it)
DROP TABLE IF EXISTS "ad_transactions";

-- Ad Creatives (depends on ad_campaigns)
DROP TABLE IF EXISTS "ad_creatives";

-- Ad Campaigns (depends on ad_accounts)
DROP TABLE IF EXISTS "ad_campaigns";

-- Ad Accounts (depends on secrets, organizations, users)
DROP TABLE IF EXISTS "ad_accounts";

-- Media Collection Items (depends on media_collections, generations, media_uploads)
DROP TABLE IF EXISTS "media_collection_items";

-- Media Collections (depends on organizations, users, generations)
DROP TABLE IF EXISTS "media_collections";

-- Media Uploads (depends on organizations, users)
DROP TABLE IF EXISTS "media_uploads";
