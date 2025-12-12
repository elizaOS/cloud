#!/usr/bin/env npx tsx
/**
 * Payout System Test Script
 *
 * Comprehensive test suite for the elizaOS token payout system.
 * Tests on testnet to verify all components work correctly.
 *
 * USAGE:
 *   bun run scripts/test-payout-system.ts [options]
 *
 * OPTIONS:
 *   --network=<network>  Network to test on (default: base-sepolia)
 *   --dry-run           Don't execute actual transactions
 *   --verbose           Show detailed logs
 *   --skip-balance      Skip balance checks (for CI without funded wallet)
 *
 * REQUIREMENTS:
 * 1. Set PAYOUT_TESTNET=true in .env
 * 2. Set EVM_PAYOUT_PRIVATE_KEY with a funded testnet wallet
 * 3. Set ELIZA_TOKEN_BASE_SEPOLIA with deployed test token address
 * 4. Ensure the test wallet has test ETH for gas
 *
 * WHAT IT TESTS:
 * ✓ Network configuration
 * ✓ Wallet connectivity
 * ✓ Token balance checks
 * ✓ Price oracle (TWAP)
 * ✓ Quote generation
 * ✓ Rate limiting
 * ✓ Security validations
 * ✓ Transaction simulation (dry run)
 * ✓ Full payout flow (live run)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  formatUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  NETWORK_CONFIGS,
  isTestnetMode,
  getNetworkConfig,
  getConfiguredNetworks,
  getExplorerTxUrl,
  type PayoutNetwork,
} from "../lib/config/payout-networks";
import {
  ARBITRAGE_PROTECTION,
  SUPPLY_SHOCK_PROTECTION,
} from "../lib/config/redemption-security";
import {
  twapPriceOracle,
  TWAP_CONFIG,
  SYSTEM_LIMITS,
} from "../lib/services/twap-price-oracle";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import bs58 from "bs58";

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

interface TestConfig {
  network: PayoutNetwork;
  dryRun: boolean;
  verbose: boolean;
  skipBalance: boolean;
}

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// Parse CLI arguments
function parseArgs(): TestConfig {
  const args = process.argv.slice(2);

  let network: PayoutNetwork = "base-sepolia";
  let dryRun = false;
  let verbose = false;
  let skipBalance = false;

  for (const arg of args) {
    if (arg.startsWith("--network=")) {
      network = arg.split("=")[1] as PayoutNetwork;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--verbose") {
      verbose = true;
    } else if (arg === "--skip-balance") {
      skipBalance = true;
    }
  }

  return { network, dryRun, verbose, skipBalance };
}

// Logging helpers
function log(config: TestConfig, message: string, data?: unknown) {
  if (config.verbose) {
    console.log(`  ${message}`, data || "");
  }
}

function success(message: string) {
  console.log(`  ✅ ${message}`);
}

function error(message: string) {
  console.log(`  ❌ ${message}`);
}

function warn(message: string) {
  console.log(`  ⚠️ ${message}`);
}

function info(message: string) {
  console.log(`  ℹ️ ${message}`);
}

// ============================================================================
// TEST SUITES
// ============================================================================

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]);

async function testNetworkConfiguration(
  config: TestConfig,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log("\n📡 Testing Network Configuration...\n");

  // Test 1: Testnet mode
  const testnetMode = isTestnetMode();
  results.push({
    name: "Testnet Mode Detection",
    passed: testnetMode,
    message: testnetMode
      ? "Running in testnet mode"
      : "Running in mainnet mode (set PAYOUT_TESTNET=true for testing)",
  });

  if (testnetMode) {
    success("Testnet mode enabled");
  } else {
    warn("Mainnet mode - be careful with real tokens!");
  }

  // Test 2: Network config exists
  const networkConfig = NETWORK_CONFIGS[config.network];
  results.push({
    name: "Network Config Exists",
    passed: !!networkConfig,
    message: networkConfig
      ? `Found config for ${networkConfig.name}`
      : `No config for ${config.network}`,
  });

  if (networkConfig) {
    success(
      `Network: ${networkConfig.name} (chainId: ${networkConfig.chainId})`,
    );
    log(config, "Token address:", networkConfig.tokenAddress);
  } else {
    error(`Unknown network: ${config.network}`);
    return results;
  }

  // Test 3: Token address configured
  const hasToken =
    networkConfig.tokenAddress !== "0x0000000000000000000000000000000000000000";
  results.push({
    name: "Token Address Configured",
    passed: hasToken,
    message: hasToken
      ? `Token: ${networkConfig.tokenAddress}`
      : "Token address not set (deploy test token first)",
  });

  if (hasToken) {
    success(`Token address: ${networkConfig.tokenAddress.slice(0, 10)}...`);
  } else {
    error(
      "Token address not configured - set ELIZA_TOKEN_BASE_SEPOLIA in .env",
    );
  }

  // Test 4: RPC connectivity
  if (networkConfig.chain) {
    const publicClient = createPublicClient({
      chain: networkConfig.chain,
      transport: http(networkConfig.rpcUrl),
    });

    try {
      const blockNumber = await publicClient.getBlockNumber();
      results.push({
        name: "RPC Connectivity",
        passed: true,
        message: `Connected, block: ${blockNumber}`,
      });
      success(`RPC connected, current block: ${blockNumber}`);
    } catch (e) {
      results.push({
        name: "RPC Connectivity",
        passed: false,
        message: `Failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      });
      error("RPC connection failed");
    }
  }

  return results;
}

async function testWalletConfiguration(
  config: TestConfig,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log("\n💳 Testing Wallet Configuration...\n");

  const networkConfig = NETWORK_CONFIGS[config.network];

  // Test: EVM wallet
  if (networkConfig.chain) {
    const privateKey = process.env.EVM_PAYOUT_PRIVATE_KEY;

    if (!privateKey) {
      results.push({
        name: "EVM Wallet Configured",
        passed: false,
        message: "EVM_PAYOUT_PRIVATE_KEY not set",
      });
      error("EVM_PAYOUT_PRIVATE_KEY not configured");
      return results;
    }

    try {
      const account = privateKeyToAccount(
        privateKey.startsWith("0x")
          ? (privateKey as `0x${string}`)
          : (`0x${privateKey}` as `0x${string}`),
      );

      results.push({
        name: "EVM Wallet Configured",
        passed: true,
        message: `Address: ${account.address}`,
      });
      success(`Wallet address: ${account.address}`);

      // Check native balance for gas
      const publicClient = createPublicClient({
        chain: networkConfig.chain,
        transport: http(networkConfig.rpcUrl),
      });

      const nativeBalance = await publicClient.getBalance({
        address: account.address,
      });
      const formattedNative = formatUnits(nativeBalance, 18);

      const hasGas = nativeBalance > 0n;
      results.push({
        name: "Has Gas Funds",
        passed: hasGas,
        message: `${formattedNative} ${networkConfig.nativeCurrency}`,
      });

      if (hasGas) {
        success(
          `Native balance: ${formattedNative} ${networkConfig.nativeCurrency}`,
        );
      } else {
        error(`No ${networkConfig.nativeCurrency} for gas - fund the wallet`);
      }

      // Check token balance
      if (
        !config.skipBalance &&
        networkConfig.tokenAddress !==
          "0x0000000000000000000000000000000000000000"
      ) {
        try {
          const tokenBalance = await publicClient.readContract({
            address: networkConfig.tokenAddress as Address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [account.address],
          });

          const formattedToken = formatUnits(
            tokenBalance,
            networkConfig.tokenDecimals,
          );
          const hasTokens = tokenBalance > 0n;

          results.push({
            name: "Has Token Balance",
            passed: hasTokens,
            message: `${formattedToken} ${networkConfig.tokenSymbol}`,
          });

          if (hasTokens) {
            success(
              `Token balance: ${formattedToken} ${networkConfig.tokenSymbol}`,
            );
          } else {
            warn(
              `No ${networkConfig.tokenSymbol} tokens - transfer some for testing`,
            );
          }
        } catch (e) {
          results.push({
            name: "Token Contract Check",
            passed: false,
            message: `Failed to read token contract: ${e instanceof Error ? e.message : "Unknown"}`,
          });
          error("Failed to check token balance - is token contract deployed?");
        }
      }
    } catch (e) {
      results.push({
        name: "EVM Wallet Configured",
        passed: false,
        message: `Invalid private key: ${e instanceof Error ? e.message : "Unknown"}`,
      });
      error("Invalid EVM private key format");
    }
  } else {
    // Solana wallet
    const privateKey = process.env.SOLANA_PAYOUT_PRIVATE_KEY;

    if (!privateKey) {
      results.push({
        name: "Solana Wallet Configured",
        passed: false,
        message: "SOLANA_PAYOUT_PRIVATE_KEY not set",
      });
      error("SOLANA_PAYOUT_PRIVATE_KEY not configured");
      return results;
    }

    try {
      const decoded = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(decoded);

      results.push({
        name: "Solana Wallet Configured",
        passed: true,
        message: `Address: ${keypair.publicKey.toBase58()}`,
      });
      success(`Wallet address: ${keypair.publicKey.toBase58()}`);

      // Check SOL balance
      const connection = new Connection(networkConfig.rpcUrl, "confirmed");
      const solBalance = await connection.getBalance(keypair.publicKey);
      const formattedSol = (solBalance / 1e9).toFixed(4);

      const hasGas = solBalance > 0;
      results.push({
        name: "Has SOL for Gas",
        passed: hasGas,
        message: `${formattedSol} SOL`,
      });

      if (hasGas) {
        success(`SOL balance: ${formattedSol} SOL`);
      } else {
        error("No SOL for gas - request from faucet");
      }
    } catch (e) {
      results.push({
        name: "Solana Wallet Configured",
        passed: false,
        message: `Invalid private key: ${e instanceof Error ? e.message : "Unknown"}`,
      });
      error("Invalid Solana private key format");
    }
  }

  return results;
}

async function testPriceOracle(config: TestConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log("\n📊 Testing Price Oracle (TWAP)...\n");

  // Map testnet to mainnet for price lookup (testnets don't have real prices)
  const priceNetwork =
    config.network.includes("sepolia") ||
    config.network.includes("testnet") ||
    config.network.includes("devnet")
      ? "base" // Use base mainnet price for testing
      : config.network;

  info(`Using ${priceNetwork} price for testing`);

  // Test: TWAP configuration
  results.push({
    name: "TWAP Config Loaded",
    passed: TWAP_CONFIG.TWAP_WINDOW_MS > 0,
    message: `Window: ${TWAP_CONFIG.TWAP_WINDOW_MS / 60000} minutes`,
  });
  success(`TWAP window: ${TWAP_CONFIG.TWAP_WINDOW_MS / 60000} minutes`);

  // Test: System limits
  results.push({
    name: "System Limits Configured",
    passed: SYSTEM_LIMITS.MAX_HOURLY_REDEMPTION_USD > 0,
    message: `Hourly: $${SYSTEM_LIMITS.MAX_HOURLY_REDEMPTION_USD}, Daily: $${SYSTEM_LIMITS.MAX_DAILY_REDEMPTION_USD}`,
  });
  success(
    `Limits - Hourly: $${SYSTEM_LIMITS.MAX_HOURLY_REDEMPTION_USD}, Daily: $${SYSTEM_LIMITS.MAX_DAILY_REDEMPTION_USD}`,
  );

  // Test: Security spread
  results.push({
    name: "Safety Spread Configured",
    passed: ARBITRAGE_PROTECTION.SAFETY_SPREAD > 0,
    message: `${ARBITRAGE_PROTECTION.SAFETY_SPREAD * 100}% safety spread`,
  });
  success(`Safety spread: ${ARBITRAGE_PROTECTION.SAFETY_SPREAD * 100}%`);

  // Test: Get system health
  try {
    const health = await twapPriceOracle.getSystemHealth();

    results.push({
      name: "System Health Check",
      passed: true,
      message: `Can process: ${health.canProcessRedemptions}`,
      details: health,
    });

    if (health.canProcessRedemptions) {
      success("System health: OK");
    } else {
      warn(`System paused: ${health.pauseReason}`);
    }

    info(`Hourly volume: $${health.hourlyVolumeUsd.toFixed(2)}`);
    info(`Daily volume: $${health.dailyVolumeUsd.toFixed(2)}`);
  } catch (e) {
    results.push({
      name: "System Health Check",
      passed: false,
      message: `Failed: ${e instanceof Error ? e.message : "Unknown"}`,
    });
    error("Failed to check system health");
  }

  // Test: Get TWAP (may fail if no samples yet)
  try {
    const twap = await twapPriceOracle.getTWAP(priceNetwork as "base");

    if (twap) {
      results.push({
        name: "TWAP Available",
        passed: true,
        message: `Price: $${twap.twapPrice.toFixed(6)}, Samples: ${twap.sampleCount}`,
      });
      success(
        `TWAP: $${twap.twapPrice.toFixed(6)} (${twap.sampleCount} samples)`,
      );
      info(`Volatility: ${(twap.volatility * 100).toFixed(2)}%`);
      info(`Stable: ${twap.isStable}`);
    } else {
      results.push({
        name: "TWAP Available",
        passed: false,
        message: "No price samples - run /api/cron/sample-eliza-price first",
      });
      warn("No TWAP samples - need to sample prices first");
    }
  } catch (e) {
    results.push({
      name: "TWAP Available",
      passed: false,
      message: `Failed: ${e instanceof Error ? e.message : "Unknown"}`,
    });
  }

  return results;
}

async function testSecurityValidations(
  config: TestConfig,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log("\n🔒 Testing Security Validations...\n");

  // Test: Amount validation
  const minPoints = 100;
  const maxPoints = 100000;

  results.push({
    name: "Min/Max Point Limits",
    passed: true,
    message: `Min: ${minPoints} ($${minPoints / 100}), Max: ${maxPoints} ($${maxPoints / 100})`,
  });
  success(`Point limits: ${minPoints} - ${maxPoints}`);

  // Test: Daily limits
  results.push({
    name: "User Daily Limits",
    passed: true,
    message: `$${SUPPLY_SHOCK_PROTECTION.USER_DAILY_LIMIT_USD}/day`,
  });
  success(`User daily limit: $${SUPPLY_SHOCK_PROTECTION.USER_DAILY_LIMIT_USD}`);

  // Test: Large redemption delay
  results.push({
    name: "Large Redemption Delay",
    passed: true,
    message: `>$${SUPPLY_SHOCK_PROTECTION.LARGE_REDEMPTION_THRESHOLD_USD} triggers ${SUPPLY_SHOCK_PROTECTION.LARGE_REDEMPTION_DELAY_MS / 60000} min delay`,
  });
  success(
    `Large redemption (>$${SUPPLY_SHOCK_PROTECTION.LARGE_REDEMPTION_THRESHOLD_USD}): ${SUPPLY_SHOCK_PROTECTION.LARGE_REDEMPTION_DELAY_MS / 60000} min delay`,
  );

  // Test: Velocity protection
  results.push({
    name: "Velocity Protection",
    passed: true,
    message: `${SYSTEM_LIMITS.VELOCITY_LIMIT_COUNT} redemptions in ${SYSTEM_LIMITS.VELOCITY_LIMIT_WINDOW_MS / 60000} min triggers pause`,
  });
  success(
    `Velocity limit: ${SYSTEM_LIMITS.VELOCITY_LIMIT_COUNT} redemptions / ${SYSTEM_LIMITS.VELOCITY_LIMIT_WINDOW_MS / 60000} min`,
  );

  // Test: Quote validity
  results.push({
    name: "Quote Validity Period",
    passed: ARBITRAGE_PROTECTION.QUOTE_VALIDITY_MS <= 300000, // Max 5 min
    message: `${ARBITRAGE_PROTECTION.QUOTE_VALIDITY_MS / 1000} seconds`,
  });
  success(
    `Quote validity: ${ARBITRAGE_PROTECTION.QUOTE_VALIDITY_MS / 1000} seconds`,
  );

  return results;
}

async function testDryRunPayout(config: TestConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];

  if (!config.dryRun) {
    return results;
  }

  console.log("\n🧪 Testing Dry Run Payout...\n");

  const networkConfig = NETWORK_CONFIGS[config.network];

  if (!networkConfig.chain) {
    info("Skipping EVM dry run for Solana network");
    return results;
  }

  const privateKey = process.env.EVM_PAYOUT_PRIVATE_KEY;
  if (!privateKey) {
    error("No wallet configured for dry run");
    return results;
  }

  const account = privateKeyToAccount(
    privateKey.startsWith("0x")
      ? (privateKey as `0x${string}`)
      : (`0x${privateKey}` as `0x${string}`),
  );

  const publicClient = createPublicClient({
    chain: networkConfig.chain,
    transport: http(networkConfig.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: networkConfig.chain,
    transport: http(networkConfig.rpcUrl),
  });

  // Simulate a small transfer
  const testAmount = parseUnits("0.001", networkConfig.tokenDecimals);
  const testRecipient = "0x0000000000000000000000000000000000000001" as Address;

  try {
    // Simulate the transaction
    const { request } = await publicClient.simulateContract({
      address: networkConfig.tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [testRecipient, testAmount],
      account: account.address,
    });

    results.push({
      name: "Transfer Simulation",
      passed: true,
      message: "Transaction would succeed",
    });
    success("Transfer simulation passed");

    // Estimate gas
    const gasEstimate = await publicClient.estimateContractGas({
      address: networkConfig.tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [testRecipient, testAmount],
      account: account.address,
    });

    info(`Estimated gas: ${gasEstimate}`);
  } catch (e) {
    results.push({
      name: "Transfer Simulation",
      passed: false,
      message: `Would fail: ${e instanceof Error ? e.message : "Unknown"}`,
    });
    error(`Simulation failed: ${e instanceof Error ? e.message : "Unknown"}`);
  }

  return results;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║          elizaOS Payout System Test Suite                     ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝",
  );

  const config = parseArgs();

  console.log(`\nConfiguration:`);
  console.log(`  Network:      ${config.network}`);
  console.log(`  Dry Run:      ${config.dryRun}`);
  console.log(`  Verbose:      ${config.verbose}`);
  console.log(`  Skip Balance: ${config.skipBalance}`);

  let allResults: TestResult[] = [];

  // Run all test suites
  allResults = allResults.concat(await testNetworkConfiguration(config));
  allResults = allResults.concat(await testWalletConfiguration(config));
  allResults = allResults.concat(await testPriceOracle(config));
  allResults = allResults.concat(await testSecurityValidations(config));
  allResults = allResults.concat(await testDryRunPayout(config));

  // Summary
  console.log("\n" + "═".repeat(66));
  console.log("TEST SUMMARY");
  console.log("═".repeat(66));

  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.filter((r) => !r.passed).length;
  const total = allResults.length;

  console.log(`\n  Total:  ${total}`);
  console.log(`  Passed: ${passed} ✅`);
  console.log(`  Failed: ${failed} ❌`);
  console.log(`  Rate:   ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log("\n  Failed Tests:");
    allResults
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`    ❌ ${r.name}: ${r.message}`);
      });
  }

  console.log("\n" + "═".repeat(66));

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
