#!/usr/bin/env bun
/**
 * Register Cloud as a Decentralized Storage Provider
 * 
 * Registers the cloud service as a storage provider in the StorageProviderRegistry,
 * enabling it to participate in the Jeju storage marketplace.
 * 
 * Usage:
 *   bun run scripts/register-storage-provider.ts [--network localnet|testnet|mainnet]
 */

import { ethers } from 'ethers';

const STORAGE_PROVIDER_REGISTRY_ABI = [
  'function register(string name, string endpoint, uint8 providerType, bytes32 attestationHash) payable',
  'function registerWithAgent(string name, string endpoint, uint8 providerType, bytes32 attestationHash, uint256 agentId) payable',
  'function updateCapacity(uint256 totalGB, uint256 availableGB)',
  'function updatePricing(uint8 tier, uint256 pricePerGBMonth)',
  'function getProvider(address) view returns (tuple(address owner, string name, string endpoint, uint8 providerType, bytes32 attestationHash, uint256 stake, uint256 registeredAt, uint256 agentId, bool active, bool verified))',
  'function minProviderStake() view returns (uint256)',
  'event ProviderRegistered(address indexed provider, string name, string endpoint, uint8 providerType, uint256 agentId)',
] as const;

// Provider types from IStorageTypes.sol
const ProviderType = {
  IPFS: 0,
  CLOUD: 1,
  ARWEAVE: 2,
  FILECOIN: 3,
  HYBRID: 4,
} as const;

// Storage tiers from IStorageTypes.sol
const StorageTier = {
  HOT: 0,
  WARM: 1,
  COLD: 2,
  PERMANENT: 3,
} as const;

// Cloud storage pricing (aligned with apps/storage STORAGE_PRICING in sdk/x402.ts)
const CLOUD_PRICING = {
  [StorageTier.HOT]: ethers.parseEther('0.0001'),      // 0.0001 ETH/GB/month
  [StorageTier.WARM]: ethers.parseEther('0.00005'),    // 0.00005 ETH/GB/month
  [StorageTier.COLD]: ethers.parseEther('0.00001'),    // 0.00001 ETH/GB/month
  [StorageTier.PERMANENT]: ethers.parseEther('0.005'), // 0.005 ETH/GB (one-time permanent)
};

interface NetworkConfig {
  rpcUrl: string;
  registryAddress: string;
  minStake: string;
}

const NETWORKS: Record<string, NetworkConfig> = {
  localnet: {
    rpcUrl: process.env.JEJU_RPC_URL || 'http://127.0.0.1:9545',
    registryAddress: process.env.STORAGE_REGISTRY_ADDRESS || '',
    minStake: '0.01',
  },
  testnet: {
    rpcUrl: process.env.JEJU_TESTNET_RPC_URL || 'https://testnet-rpc.jeju.network',
    registryAddress: process.env.STORAGE_REGISTRY_ADDRESS_TESTNET || '',
    minStake: '0.01',
  },
  mainnet: {
    rpcUrl: process.env.JEJU_MAINNET_RPC_URL || 'https://rpc.jeju.network',
    registryAddress: process.env.STORAGE_REGISTRY_ADDRESS_MAINNET || '',
    minStake: '0.1',
  },
};

async function main() {
  const args = process.argv.slice(2);
  const networkArg = args.find(a => a.startsWith('--network='))?.split('=')[1] 
    || args[args.indexOf('--network') + 1] 
    || 'localnet';
  
  const network = NETWORKS[networkArg];
  if (!network) {
    console.error(`Unknown network: ${networkArg}`);
    console.error('Available networks: localnet, testnet, mainnet');
    process.exit(1);
  }
  
  if (!network.registryAddress) {
    console.error(`STORAGE_REGISTRY_ADDRESS not configured for ${networkArg}`);
    console.error('Set STORAGE_REGISTRY_ADDRESS environment variable');
    process.exit(1);
  }
  
  const privateKey = process.env.CLOUD_OPERATOR_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('CLOUD_OPERATOR_PRIVATE_KEY or PRIVATE_KEY not set');
    process.exit(1);
  }
  
  console.log('=== Cloud Storage Provider Registration ===\n');
  console.log(`Network: ${networkArg}`);
  console.log(`RPC: ${network.rpcUrl}`);
  console.log(`Registry: ${network.registryAddress}`);
  
  // Connect to network
  const provider = new ethers.JsonRpcProvider(network.rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log(`Operator: ${wallet.address}`);
  
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  
  // Connect to registry
  const registry = new ethers.Contract(
    network.registryAddress,
    STORAGE_PROVIDER_REGISTRY_ABI,
    wallet
  );
  
  // Check if already registered
  const existingProvider = await registry.getProvider(wallet.address);
  if (existingProvider.registeredAt > 0n) {
    console.log('\nProvider already registered:');
    console.log(`  Name: ${existingProvider.name}`);
    console.log(`  Endpoint: ${existingProvider.endpoint}`);
    console.log(`  Type: ${Object.keys(ProviderType).find(k => ProviderType[k as keyof typeof ProviderType] === existingProvider.providerType)}`);
    console.log(`  Active: ${existingProvider.active}`);
    console.log(`  Verified: ${existingProvider.verified}`);
    
    // Update capacity and pricing
    console.log('\nUpdating capacity and pricing...');
    
    const CLOUD_CAPACITY_GB = 1000; // 1 TB available
    const CLOUD_AVAILABLE_GB = 800; // 800 GB available
    
    await registry.updateCapacity(CLOUD_CAPACITY_GB, CLOUD_AVAILABLE_GB);
    console.log(`  Capacity: ${CLOUD_CAPACITY_GB} GB total, ${CLOUD_AVAILABLE_GB} GB available`);
    
    // Update pricing for each tier
    for (const [tier, price] of Object.entries(CLOUD_PRICING)) {
      const tierNum = parseInt(tier);
      await registry.updatePricing(tierNum, price);
      const tierName = Object.keys(StorageTier).find(k => StorageTier[k as keyof typeof StorageTier] === tierNum);
      console.log(`  ${tierName}: ${ethers.formatEther(price)} ETH/GB/month`);
    }
    
    console.log('\nProvider updated successfully.');
    return;
  }
  
  // Get minimum stake
  const minStake = await registry.minProviderStake();
  console.log(`\nMinimum stake: ${ethers.formatEther(minStake)} ETH`);
  
  // Cloud provider details
  const cloudEndpoint = process.env.CLOUD_API_ENDPOINT || 'https://cloud.jeju.network/api/v1/storage';
  const cloudName = 'Jeju Cloud Storage';
  
  // Generate attestation hash (in production, this would be from TEE/hardware attestation)
  const attestationData = JSON.stringify({
    provider: 'jeju-cloud',
    version: '2.0.0',
    capabilities: ['vercel-blob', 'ipfs-pinning', 'x402-payments'],
    timestamp: Date.now(),
  });
  const attestationHash = ethers.keccak256(ethers.toUtf8Bytes(attestationData));
  
  console.log(`\nRegistering cloud storage provider:`);
  console.log(`  Name: ${cloudName}`);
  console.log(`  Endpoint: ${cloudEndpoint}`);
  console.log(`  Type: CLOUD`);
  console.log(`  Attestation: ${attestationHash.slice(0, 18)}...`);
  
  // Register provider
  const stake = minStake > 0n ? minStake : ethers.parseEther(network.minStake);
  
  console.log(`\nSending transaction with ${ethers.formatEther(stake)} ETH stake...`);
  
  const tx = await registry.register(
    cloudName,
    cloudEndpoint,
    ProviderType.CLOUD,
    attestationHash,
    { value: stake }
  );
  
  console.log(`  Transaction: ${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`  Confirmed in block: ${receipt.blockNumber}`);
  
  // Update capacity and pricing
  console.log('\nSetting capacity and pricing...');
  
  const CLOUD_CAPACITY_GB = 1000;
  const CLOUD_AVAILABLE_GB = 800;
  
  await registry.updateCapacity(CLOUD_CAPACITY_GB, CLOUD_AVAILABLE_GB);
  console.log(`  Capacity: ${CLOUD_CAPACITY_GB} GB total, ${CLOUD_AVAILABLE_GB} GB available`);
  
  for (const [tier, price] of Object.entries(CLOUD_PRICING)) {
    const tierNum = parseInt(tier);
    await registry.updatePricing(tierNum, price);
    const tierName = Object.keys(StorageTier).find(k => StorageTier[k as keyof typeof StorageTier] === tierNum);
    console.log(`  ${tierName}: ${ethers.formatEther(price)} ETH/GB/month`);
  }
  
  console.log('\n=== Cloud Storage Provider Registered ===');
  console.log(`Provider Address: ${wallet.address}`);
  console.log(`Endpoint: ${cloudEndpoint}`);
  console.log(`Stake: ${ethers.formatEther(stake)} ETH`);
}

main().catch((error) => {
  console.error('Registration failed:', error);
  process.exit(1);
});

