/**
 * Bootstrap Contracts Script
 * 
 * Checks if required contracts are deployed on the target network.
 * For local development (Anvil), deploys contracts if they aren't present.
 * 
 * Usage:
 *   bun run scripts/bootstrap-contracts.ts [--network <network>] [--deploy]
 * 
 * Options:
 *   --network  Network to check (anvil, base-sepolia, base). Default: anvil
 *   --deploy   Deploy missing contracts (only works on anvil)
 */

import { createPublicClient, http, type Address } from "viem";
import { foundry, baseSepolia, base } from "viem/chains";
import { spawn } from "child_process";

// Constants - local definitions (no external deps)
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const CHAIN_IDS = {
  anvil: 31337,
  "base-sepolia": 84532,
  base: 8453,
  jeju: 420691,
  "jeju-testnet": 420690,
  "jeju-localnet": 1337,
};
import path from "path";

// ============================================================================
// Configuration
// ============================================================================

type NetworkType = "anvil" | "base-sepolia" | "base";

const NETWORKS = {
  anvil: {
    chain: foundry,
    rpcUrl: process.env.ANVIL_RPC_URL || "http://127.0.0.1:8545",
    canDeploy: true,
  },
  "base-sepolia": {
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    canDeploy: false,
  },
  base: {
    chain: base,
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    canDeploy: false,
  },
} as const;

// Required contracts for Cloud to function
interface ContractCheck {
  name: string;
  envVar: string;
  deployScript?: string;
  critical: boolean;
}

const REQUIRED_CONTRACTS: ContractCheck[] = [
  {
    name: "Identity Registry",
    envVar: "ERC8004_IDENTITY_REGISTRY_ANVIL",
    deployScript: "DeployLocalnet.s.sol",
    critical: true,
  },
  {
    name: "Reputation Registry",
    envVar: "ERC8004_REPUTATION_REGISTRY_ANVIL",
    critical: true,
  },
  {
    name: "Validation Registry",
    envVar: "ERC8004_VALIDATION_REGISTRY_ANVIL",
    critical: true,
  },
];

// ============================================================================
// Contract Check Functions
// ============================================================================

async function checkContractDeployed(
  rpcUrl: string,
  address: string
): Promise<boolean> {
  if (!address || address === ZERO_ADDRESS) {
    return false;
  }

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const code = await client.getCode({ address: address as Address });
  return code !== undefined && code !== "0x";
}

async function checkNetwork(network: NetworkType): Promise<{
  missing: ContractCheck[];
  found: ContractCheck[];
}> {
  const config = NETWORKS[network];
  const missing: ContractCheck[] = [];
  const found: ContractCheck[] = [];

  console.log(`\n🔍 Checking contracts on ${network}...`);
  console.log(`   RPC: ${config.rpcUrl}`);

  for (const contract of REQUIRED_CONTRACTS) {
    const address = process.env[contract.envVar];
    
    if (!address) {
      console.log(`   ❌ ${contract.name}: Not configured (${contract.envVar})`);
      missing.push(contract);
      continue;
    }

    const deployed = await checkContractDeployed(config.rpcUrl, address);
    
    if (deployed) {
      console.log(`   ✅ ${contract.name}: ${address.slice(0, 10)}...`);
      found.push(contract);
    } else {
      console.log(`   ❌ ${contract.name}: ${address.slice(0, 10)}... (not deployed)`);
      missing.push(contract);
    }
  }

  return { missing, found };
}

// ============================================================================
// Deployment Functions
// ============================================================================

async function deployContracts(): Promise<boolean> {
  // Check for contracts directory path from env or use project-local contracts folder
  const contractsDir = process.env.CONTRACTS_DIR || path.resolve(process.cwd(), "contracts");
  
  console.log("\n🚀 Deploying contracts to Anvil...");
  console.log(`   Working directory: ${contractsDir}`);
  
  // Check if forge is available and contracts directory exists
  const fs = await import("fs");
  if (!fs.existsSync(contractsDir)) {
    console.log("\n⚠️  Contracts directory not found.");
    console.log("   To deploy contracts:");
    console.log("   1. Set CONTRACTS_DIR env var to your contracts project path");
    console.log("   2. Or place Solidity contracts in ./contracts/");
    console.log("   3. Run: forge script script/DeployLocalnet.s.sol --rpc-url http://127.0.0.1:8545 --broadcast");
    return false;
  }

  return new Promise((resolve) => {
    const child = spawn(
      "forge",
      [
        "script",
        "script/DeployLocalnet.s.sol:DeployLocalnet",
        "--rpc-url",
        NETWORKS.anvil.rpcUrl,
        "--broadcast",
        "--legacy",
      ],
      {
        cwd: contractsDir,
        stdio: "inherit",
        env: {
          ...process.env,
          PRIVATE_KEY: process.env.ANVIL_PRIVATE_KEY || 
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Anvil account 0
        },
      }
    );

    child.on("close", (code) => {
      if (code === 0) {
        console.log("   ✅ Contracts deployed successfully!");
        resolve(true);
      } else {
        console.error("   ❌ Contract deployment failed");
        resolve(false);
      }
    });

    child.on("error", (err) => {
      console.error("   ❌ Failed to start deployment:", err.message);
      resolve(false);
    });
  });
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const networkArg = args.find((a) => a.startsWith("--network="))?.split("=")[1] ||
    (args.includes("--network") ? args[args.indexOf("--network") + 1] : "anvil");
  const shouldDeploy = args.includes("--deploy");

  const network = networkArg as NetworkType;

  if (!NETWORKS[network]) {
    console.error(`Unknown network: ${network}`);
    console.error(`Valid networks: ${Object.keys(NETWORKS).join(", ")}`);
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           Cloud Contract Bootstrap                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const { missing, found } = await checkNetwork(network);

  if (missing.length === 0) {
    console.log("\n✅ All required contracts are deployed and configured!");
    process.exit(0);
  }

  const criticalMissing = missing.filter((c) => c.critical);
  
  if (criticalMissing.length > 0) {
    console.log(`\n⚠️  ${criticalMissing.length} critical contract(s) missing!`);

    if (network === "anvil" && shouldDeploy) {
      const success = await deployContracts();
      if (!success) {
        process.exit(1);
      }
      
      // Re-check after deployment
      console.log("\n🔍 Verifying deployment...");
      const { missing: stillMissing } = await checkNetwork(network);
      
      if (stillMissing.length > 0) {
        console.log("\n❌ Some contracts still missing after deployment.");
        console.log("   You may need to update your .env with deployed addresses.");
        process.exit(1);
      }
      
      console.log("\n✅ All contracts deployed and verified!");
    } else if (network === "anvil") {
      console.log("\nTo deploy contracts locally, run:");
      console.log("  bun run scripts/bootstrap-contracts.ts --network anvil --deploy");
      console.log("\nOr start Anvil and deploy manually:");
      console.log("  CONTRACTS_DIR=/path/to/contracts forge script script/DeployLocalnet.s.sol --rpc-url http://127.0.0.1:8545 --broadcast");
      process.exit(1);
    } else {
      console.log(`\n❌ Cannot auto-deploy to ${network}.`);
      console.log("   Please deploy contracts manually or use pre-deployed addresses.");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});

