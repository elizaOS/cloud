-- Migration: Add first-class token↔agent linkage columns to user_characters
-- Purpose: Thin clients should not need to dig through JSONB to discover
--          which token an agent is linked to. These columns make the link
--          queryable, indexable, and canonical.

-- Add token linkage columns to user_characters
ALTER TABLE "user_characters"
  ADD COLUMN "token_address" text,
  ADD COLUMN "token_chain"   text,
  ADD COLUMN "token_name"    text,
  ADD COLUMN "token_ticker"  text;

-- Composite unique index: at most one agent per (token_address, token_chain) pair
-- Uses a partial index so NULLs are ignored (agents without tokens).
CREATE UNIQUE INDEX "user_characters_token_address_chain_uniq"
  ON "user_characters" ("token_address", "token_chain")
  WHERE "token_address" IS NOT NULL;

-- Fast lookup by token_address alone (covers cross-chain queries)
CREATE INDEX "user_characters_token_address_idx"
  ON "user_characters" ("token_address")
  WHERE "token_address" IS NOT NULL;

-- Backfill from milady_sandboxes.agent_config JSONB where data already exists.
-- This extracts tokenContractAddress / chain stored during service-to-service provisioning.
UPDATE "user_characters" uc
SET
  token_address = CASE
    WHEN (ms.agent_config->>'tokenContractAddress') ~ '^0x[0-9A-Fa-f]+$'
      THEN lower(ms.agent_config->>'tokenContractAddress')
    ELSE ms.agent_config->>'tokenContractAddress'
  END,
  token_chain   = ms.agent_config->>'chain',
  token_name    = ms.agent_config->>'tokenName',
  token_ticker  = ms.agent_config->>'tokenTicker'
FROM "milady_sandboxes" ms
WHERE ms.character_id = uc.id
  AND ms.agent_config->>'tokenContractAddress' IS NOT NULL
  AND uc.token_address IS NULL;
