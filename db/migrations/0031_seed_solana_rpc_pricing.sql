-- Seed Solana RPC pricing data
-- Tier 1 (default): 1 provider credit = $0.000005 * 1.2 (20% markup) = $0.000006
-- Tier 2: 10 provider credits = $0.000050 * 1.2 = $0.000060  
-- Tier 3: 100 provider credits = $0.000500 * 1.2 = $0.000600

INSERT INTO "service_pricing" (
  "id",
  "service_id",
  "method",
  "cost",
  "description",
  "metadata",
  "is_active",
  "updated_by",
  "created_at",
  "updated_at"
) VALUES
  -- Tier 1 (Default) - Standard RPC calls
  (gen_random_uuid(), 'solana-rpc', '_default', '0.000006', 'Standard Solana RPC call', '{"provider_credits": 1, "tier": 1}'::jsonb, true, 'system', NOW(), NOW()),
  
  -- Tier 2 - DAS API (10 credits each)
  (gen_random_uuid(), 'solana-rpc', 'getAsset', '0.000060', 'DAS API - Get asset', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getAssetsByOwner', '0.000060', 'DAS API - Get assets by owner', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'searchAssets', '0.000060', 'DAS API - Search assets', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getTokenAccounts', '0.000060', 'DAS API - Get token accounts', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getAssetProof', '0.000060', 'DAS API - Get asset proof', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getAssetProofBatch', '0.000060', 'DAS API - Get asset proof batch', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getAssetsByAuthority', '0.000060', 'DAS API - Get assets by authority', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getAssetsByCreator', '0.000060', 'DAS API - Get assets by creator', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getAssetsByGroup', '0.000060', 'DAS API - Get assets by group', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getAssetBatch', '0.000060', 'DAS API - Get asset batch', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getSignaturesForAsset', '0.000060', 'DAS API - Get signatures for asset', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getNftEditions', '0.000060', 'DAS API - Get NFT editions', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  
  -- Tier 2 - Complex RPC calls (10 credits each)
  (gen_random_uuid(), 'solana-rpc', 'getProgramAccounts', '0.000060', 'Complex RPC - Get program accounts', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  
  -- Tier 2 - Historical data (10 credits each)
  (gen_random_uuid(), 'solana-rpc', 'getBlock', '0.000060', 'Historical - Get block', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getBlocks', '0.000060', 'Historical - Get blocks', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getBlocksWithLimit', '0.000060', 'Historical - Get blocks with limit', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getTransaction', '0.000060', 'Historical - Get transaction', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getSignaturesForAddress', '0.000060', 'Historical - Get signatures for address', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getBlockTime', '0.000060', 'Historical - Get block time', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getInflationReward', '0.000060', 'Historical - Get inflation reward', '{"provider_credits": 10, "tier": 2}'::jsonb, true, 'system', NOW(), NOW()),
  
  -- Tier 3 - Enhanced APIs (100 credits each)
  (gen_random_uuid(), 'solana-rpc', 'getTransactionsForAddress', '0.000600', 'Enhanced - Get transactions for address', '{"provider_credits": 100, "tier": 3}'::jsonb, true, 'system', NOW(), NOW()),
  (gen_random_uuid(), 'solana-rpc', 'getValidityProof', '0.000600', 'ZK Proof - Get validity proof', '{"provider_credits": 100, "tier": 3}'::jsonb, true, 'system', NOW(), NOW())
ON CONFLICT (service_id, method) DO NOTHING;
