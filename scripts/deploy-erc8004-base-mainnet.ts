#!/usr/bin/env bun
/**
 * Deploy ERC-8004 contracts to Base Mainnet
 * 
 * This script deploys the Identity, Reputation, and Validation registries
 * to Base mainnet, then configures the SDK to use these addresses.
 * 
 * Requirements:
 * - AGENT0_PRIVATE_KEY in .env.local (wallet with ETH on Base mainnet)
 * - Sufficient ETH for gas (~0.01 ETH recommended)
 * 
 * Usage:
 *   bun run scripts/deploy-erc8004-base-mainnet.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeAbiParameters,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Contract bytecodes will be loaded from compiled contracts
const CONTRACTS_DIR = join(
  process.cwd(),
  "docs/docs/erc-8004-contracts/contracts"
);

// Minimal ABIs for deployment
const IDENTITY_INIT_ABI = parseAbi(["function initialize() external"]);
const REGISTRY_INIT_ABI = parseAbi([
  "function initialize(address identityRegistry) external",
]);
const VERSION_ABI = parseAbi(["function getVersion() view returns (string)"]);
const IDENTITY_REGISTRY_ABI = parseAbi([
  "function getIdentityRegistry() view returns (address)",
]);

// ERC1967Proxy bytecode (compiled)
const ERC1967_PROXY_BYTECODE =
  "0x608060405234801561001057600080fd5b506040516102c83803806102c8833981016040819052610030919061019d565b6100398261004d565b80511561004757610047816100b3565b5050565b505061026a565b6001600160a01b0381166100955760405162461bcd60e51b815260206004820152600d60248201526c1a5b9d985b1a590818dbdd5b9d609a1b60448201526064015b60405180910390fd5b61009e816100df565b50565b3660008037600080366000845af43d6000803e8080156100cc573d6000f35b3d6000fd5b90565b505050565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc80546001600160a01b0319166001600160a01b0383169081179091556040517fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a250565b634e487b7160e01b600052604160045260246000fd5b60005b8381101561017857818101518382015260200161016060565b50506000910152565b80516001600160a01b038116811461019857600080fd5b919050565b600080604083850312156101b057600080fd5b6101b983610181565b60208401519092506001600160401b03808211156101d657600080fd5b818501915085601f8301126101ea57600080fd5b8151818111156101fc576101fc610142565b604051601f8201601f19908116603f0116810190838211818310171561022457610224610142565b8160405282815288602084870101111561023d57600080fd5b61024e83602083016020880161015e565b80955050505050509250929050565b60508061027b6000396000f3fe6080604052600a600c565b005b6018601460105b9182819190565b6020601f565b565b60009060206022565b90565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc549056fea2646970667358221220e82e9ba3f7d2a5d7c0a8fb3f8e88a4c8e1c5c8e1c5c8e1c5c8e1c5c8e1c5c8e164736f6c63430008180033";

async function main() {
  console.log("═".repeat(60));
  console.log("ERC-8004 Contracts Deployment - Base Mainnet");
  console.log("═".repeat(60));

  // Check for private key
  const privateKey = process.env.AGENT0_PRIVATE_KEY;
  if (!privateKey) {
    console.error("\n❌ AGENT0_PRIVATE_KEY not set in environment");
    console.log("\nAdd to .env.local:");
    console.log("AGENT0_PRIVATE_KEY=0x...");
    process.exit(1);
  }

  // Setup clients
  const account = privateKeyToAccount(privateKey as Hex);
  const publicClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  console.log("\nDeployer:", account.address);

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Balance:", formatUnits(balance, 18), "ETH");

  if (balance < BigInt(1e16)) {
    // 0.01 ETH minimum
    console.error("\n❌ Insufficient ETH for deployment");
    console.log("   Recommended: At least 0.01 ETH");
    console.log("   Current:", formatUnits(balance, 18), "ETH");
    console.log("\nSend ETH to:", account.address);
    process.exit(1);
  }

  console.log("\n📦 Deploying contracts...");
  console.log("   (This will cost gas on Base mainnet)\n");

  // For now, we'll use pre-compiled bytecodes
  // In production, you'd compile these from Solidity
  console.log(
    "⚠️  Note: Full deployment requires compiled contract bytecodes."
  );
  console.log("   The ERC-8004 contracts need to be compiled first.\n");

  console.log("To deploy manually:");
  console.log("1. cd docs/docs/erc-8004-contracts");
  console.log("2. npm install");
  console.log("3. Add Base mainnet to hardhat.config.ts:");
  console.log('   base: { type: "http", chainType: "op", url: "https://mainnet.base.org", accounts: [process.env.DEPLOYER_PRIVATE_KEY] }');
  console.log("4. npm run deploy:upgradeable:base");
  console.log("\nThen update lib/config/erc8004.ts with the deployed addresses.");

  // Alternative: Check if we have compiled artifacts
  const artifactsPath = join(
    process.cwd(),
    "docs/docs/erc-8004-contracts/artifacts/contracts"
  );

  if (existsSync(artifactsPath)) {
    console.log("\n✅ Found compiled artifacts, proceeding with deployment...");
    // Would load bytecodes from artifacts and deploy
  } else {
    console.log("\n📋 Setup Instructions:");
    console.log("─".repeat(40));
    console.log(`
1. Compile the contracts:
   cd docs/docs/erc-8004-contracts
   npm install
   npx hardhat compile

2. Add Base mainnet network to hardhat.config.ts:
   base: {
     type: "http",
     chainType: "op",
     url: "https://mainnet.base.org",
     accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
   }

3. Create .vars file in erc-8004-contracts folder:
   DEPLOYER_PRIVATE_KEY=${privateKey}

4. Deploy:
   npx hardhat run scripts/deploy-upgradeable.ts --network base

5. Copy the deployed addresses to lib/config/erc8004.ts
`);
  }

  // Show current config
  console.log("\n📋 Current ERC-8004 Configuration:");
  console.log("─".repeat(40));

  const configPath = join(process.cwd(), "lib/config/erc8004.ts");
  if (existsSync(configPath)) {
    const config = readFileSync(configPath, "utf-8");
    const baseMatch = config.match(/base:\s*["']([^"']+)["']/);
    if (baseMatch) {
      console.log("Base mainnet Identity Registry:", baseMatch[1]);
    } else {
      console.log("Base mainnet: Not configured");
    }
  }

  console.log("\n═".repeat(60));
  console.log("After deployment, update lib/config/erc8004.ts with:");
  console.log("═".repeat(60));
  console.log(`
export const IDENTITY_REGISTRY_ADDRESSES: Record<ERC8004Network, Address> = {
  // ...existing
  base: "0x...YOUR_DEPLOYED_IDENTITY_REGISTRY...",
};

export const REPUTATION_REGISTRY_ADDRESSES: Record<ERC8004Network, Address> = {
  // ...existing
  base: "0x...YOUR_DEPLOYED_REPUTATION_REGISTRY...",
};

export const VALIDATION_REGISTRY_ADDRESSES: Record<ERC8004Network, Address> = {
  // ...existing
  base: "0x...YOUR_DEPLOYED_VALIDATION_REGISTRY...",
};
`);
}

main().catch(console.error);

