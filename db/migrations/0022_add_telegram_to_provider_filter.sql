-- Add 'telegram' to the provider_filter enum for workflow triggers
-- This allows triggers to be filtered specifically for Telegram messages

ALTER TYPE provider_filter ADD VALUE 'telegram';
