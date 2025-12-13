#!/usr/bin/env bun
/**
 * Cloud Integration Deployment Script
 * 
 * Deploys and configures CloudReputationProvider and related services.
 * 
 * Note: This script requires contract addresses to be configured via environment
 * variables or config files. See config/erc8004.json for address configuration.
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { CloudIntegration, defaultCloudServices, AgentMetadata } from '../src';

interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  success(message: string, ...args: unknown[]): void;
}

const logger: Logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  success: (msg, ...args) => console.log(`[SUCCESS] ${msg}`, ...args)
};

interface DeploymentAddresses {
  identityRegistry: string;
  reputationRegistry: string;
  serviceRegistry: string;
  creditManager: string;
  cloudReputationProvider?: string;
  usdc: string;
  paymentToken: string;
}

/**
 * Load deployment addresses from config or environment variables
 */
function loadDeploymentAddresses(_chainId: number): DeploymentAddresses {
  // Load from config/erc8004.json or environment variables
  const configPath = path.resolve(process.cwd(), 'config/erc8004.json');
  let config: Record<string, Record<string, Record<string, string>>> = { networks: {} };
  
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  
  const network = process.env.ERC8004_NETWORK || 'base-sepolia';
  const networkConfig = config.networks?.[network]?.contracts || {};
  
  return {
    identityRegistry: process.env.ERC8004_IDENTITY_REGISTRY || networkConfig.identity || '',
    reputationRegistry: process.env.ERC8004_REPUTATION_REGISTRY || networkConfig.reputation || '',
    serviceRegistry: process.env.ERC8004_SERVICE_REGISTRY || '',
    creditManager: process.env.ERC8004_CREDIT_MANAGER || '',
    cloudReputationProvider: process.env.ERC8004_CLOUD_REPUTATION_PROVIDER,
    usdc: process.env.USDC_ADDRESS || '',
    paymentToken: process.env.ELIZA_TOKEN_ADDRESS || ''
  };
}

/**
 * Deploy CloudReputationProvider contract
 * 
 * Requires: CONTRACT_ARTIFACT_PATH environment variable pointing to compiled contract JSON
 * Or: contracts/CloudReputationProvider.json in the project root
 */
async function deployCloudReputationProvider(
  signer: ethers.Signer,
  addresses: DeploymentAddresses
): Promise<string> {
  logger.info('Deploying CloudReputationProvider...');
  
  // Check for artifact in multiple locations
  const possiblePaths = [
    process.env.CONTRACT_ARTIFACT_PATH,
    path.resolve(process.cwd(), 'contracts/CloudReputationProvider.json'),
  ].filter(Boolean) as string[];
  
  const artifactPath = possiblePaths.find(p => fs.existsSync(p));
  
  if (!artifactPath) {
    throw new Error(
      'CloudReputationProvider artifact not found. Either:\n' +
      '  1. Set CONTRACT_ARTIFACT_PATH to the compiled contract JSON\n' +
      '  2. Place CloudReputationProvider.json in contracts/'
    );
  }
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode.object,
    signer
  );
  
  const registryGovernance = addresses.identityRegistry; // Use IdentityRegistry as fallback
  
  const contract = await factory.deploy(
    addresses.identityRegistry,
    addresses.reputationRegistry,
    registryGovernance,
    await signer.getAddress()
  );
  
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  
  logger.success(`CloudReputationProvider deployed at: ${address}`);
  
  return address;
}

/**
 * Setup cloud agent and services
 */
async function setupCloudIntegration(
  integration: CloudIntegration,
  signer: ethers.Signer,
  metadata: AgentMetadata
): Promise<void> {
  logger.info('Registering cloud service as agent...');
  
  // Upload to IPFS (placeholder - in production use actual IPFS)
  const tokenURI = `ipfs://QmCloudServiceCard${Date.now()}`;
  logger.info(`Agent card URI: ${tokenURI}`);
  
  // Register cloud agent
  const agentId = await integration.registerCloudAgent(
    signer,
    metadata,
    tokenURI
  );
  
  logger.success(`Cloud agent registered with ID: ${agentId}`);
  
  // Register cloud services
  logger.info('Registering cloud services in ServiceRegistry...');
  await integration.registerServices(signer, defaultCloudServices);
  logger.success(`Registered ${defaultCloudServices.length} services`);
  
  logger.success('Permissions configured');
}

/**
 * Main deployment function
 */
async function main() {
  logger.info('=== Cloud Integration Deployment ===\n');
  
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const networkArg = args.find(a => a.startsWith('--network='))?.split('=')[1] || 'localnet';
  
  // Setup provider and signer
  const rpcUrl = process.env.RPC_URL || 
    (networkArg === 'testnet' ? 'https://sepolia.base.org' : 'http://localhost:8545');
  const privateKey = process.env.PRIVATE_KEY || 
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Anvil default
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const cloudAgentSigner = new ethers.Wallet(
    process.env.CLOUD_AGENT_KEY || '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    provider
  );
  
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  
  logger.info(`Deploying from: ${await signer.getAddress()}`);
  logger.info(`Network: ${network.name} (${chainId})\n`);
  
  // Load deployment addresses
  const addresses = loadDeploymentAddresses(chainId);
  
  logger.info('Loaded deployment addresses:');
  logger.info(`  IdentityRegistry: ${addresses.identityRegistry}`);
  logger.info(`  ReputationRegistry: ${addresses.reputationRegistry}`);
  logger.info(`  ServiceRegistry: ${addresses.serviceRegistry}`);
  logger.info(`  CreditManager: ${addresses.creditManager}`);
  
  // Deploy CloudReputationProvider if not already deployed
  if (!addresses.cloudReputationProvider) {
    addresses.cloudReputationProvider = await deployCloudReputationProvider(
      signer,
      addresses
    );
  } else {
    logger.info(`Using existing CloudReputationProvider: ${addresses.cloudReputationProvider}\n`);
  }
  
  // Initialize CloudIntegration
  const integration = new CloudIntegration({
    identityRegistryAddress: addresses.identityRegistry,
    reputationRegistryAddress: addresses.reputationRegistry,
    cloudReputationProviderAddress: addresses.cloudReputationProvider,
    serviceRegistryAddress: addresses.serviceRegistry,
    creditManagerAddress: addresses.creditManager,
    provider,
    logger,
    cloudAgentSigner,
    chainId: BigInt(chainId)
  });
  
  // Setup cloud agent and services
  const metadata: AgentMetadata = {
    name: 'Cloud Services',
    description: 'Decentralized AI inference and storage platform with x402 payments',
    endpoint: process.env.CLOUD_ENDPOINT || 'https://cloud.jeju.network/a2a',
    version: '1.0.0',
    capabilities: [
      'chat-completion',
      'image-generation',
      'embeddings',
      'storage',
      'compute',
      'reputation-provider',
      'x402-payments'
    ]
  };
  
  await setupCloudIntegration(integration, signer, metadata);
  
  logger.success('\n=== Cloud Integration Deployment Complete ===');
  logger.info('\nNext steps:');
  logger.info('1. Configure cloud app with CloudReputationProvider address');
  logger.info('2. Add authorized operators via setAuthorizedOperator()');
  logger.info('3. Test x402 payments through cloud services');
  logger.info('4. Test A2A communication with cloud agent');
}

// Run deployment
main()
  .then(() => {
    logger.success('\nDeployment successful');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('\nDeployment failed:', error);
    process.exit(1);
  });
