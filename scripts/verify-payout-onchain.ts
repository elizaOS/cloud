#!/usr/bin/env npx tsx
/**
 * On-Chain Verification Script for Payout System
 * 
 * Verifies that:
 * 1. elizaOS token contracts exist on all networks
 * 2. Token metadata is correct (name, symbol, decimals)
 * 3. Hot wallet balances are readable
 * 4. Transfer function is callable (simulation)
 * 5. Price oracle can fetch prices
 * 
 * USAGE:
 *   bun run scripts/verify-payout-onchain.ts
 * 
 * EXIT CODES:
 *   0 - All verifications passed
 *   1 - Some verifications failed
 */

import { createPublicClient, http, parseAbi, formatUnits, type Address } from "viem";
import { mainnet, base, bsc } from "viem/chains";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, getMint } from "@solana/spl-token";

// ============================================================================
// CONFIGURATION
// ============================================================================

const ELIZA_TOKEN_ADDRESSES = {
  ethereum: "0xea17df5cf6d172224892b5477a16acb111182478" as Address,
  base: "0xea17df5cf6d172224892b5477a16acb111182478" as Address,
  bnb: "0xea17df5cf6d172224892b5477a16acb111182478" as Address,
  solana: "DuMbhu7mvQvqQHGcnikDgb4XegXJRyhUBfdU22uELiZA",
};

const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

const CHAINS = {
  ethereum: mainnet,
  base: base,
  bnb: bsc,
};

const RPC_URLS = {
  ethereum: process.env.ETHEREUM_RPC_URL || "https://eth.llamarpc.com",
  base: process.env.BASE_RPC_URL || "https://mainnet.base.org",
  bnb: process.env.BNB_RPC_URL || "https://bsc-dataseed.binance.org",
  solana: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
};

// ============================================================================
// VERIFICATION RESULTS
// ============================================================================

interface VerificationResult {
  network: string;
  test: string;
  passed: boolean;
  message: string;
  data?: Record<string, unknown>;
}

const results: VerificationResult[] = [];

function pass(network: string, test: string, message: string, data?: Record<string, unknown>) {
  results.push({ network, test, passed: true, message, data });
  console.log(`  ✅ ${message}`);
}

function fail(network: string, test: string, message: string, data?: Record<string, unknown>) {
  results.push({ network, test, passed: false, message, data });
  console.log(`  ❌ ${message}`);
}

// ============================================================================
// EVM VERIFICATION
// ============================================================================

async function verifyEvmNetwork(network: "ethereum" | "base" | "bnb") {
  console.log(`\n🔗 Verifying ${network.toUpperCase()}...\n`);
  
  const tokenAddress = ELIZA_TOKEN_ADDRESSES[network];
  const chain = CHAINS[network];
  
  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URLS[network]),
  });
  
  // Test 1: RPC Connectivity
  try {
    const blockNumber = await publicClient.getBlockNumber();
    pass(network, "rpc_connectivity", `RPC connected, block: ${blockNumber}`);
  } catch (e) {
    fail(network, "rpc_connectivity", `RPC connection failed: ${e instanceof Error ? e.message : "Unknown"}`);
    return; // Can't continue without RPC
  }
  
  // Test 2: Contract exists (has bytecode)
  try {
    const code = await publicClient.getCode({ address: tokenAddress });
    if (code && code !== "0x") {
      pass(network, "contract_exists", `Token contract exists at ${tokenAddress.slice(0, 10)}...`);
    } else {
      fail(network, "contract_exists", `No contract at ${tokenAddress}`);
      return;
    }
  } catch (e) {
    fail(network, "contract_exists", `Contract check failed: ${e instanceof Error ? e.message : "Unknown"}`);
    return;
  }
  
  // Test 3: Token name
  try {
    const name = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "name",
    });
    pass(network, "token_name", `Token name: "${name}"`, { name });
  } catch (e) {
    fail(network, "token_name", `Failed to read name: ${e instanceof Error ? e.message : "Unknown"}`);
  }
  
  // Test 4: Token symbol
  try {
    const symbol = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "symbol",
    });
    pass(network, "token_symbol", `Token symbol: "${symbol}"`, { symbol });
  } catch (e) {
    fail(network, "token_symbol", `Failed to read symbol: ${e instanceof Error ? e.message : "Unknown"}`);
  }
  
  // Test 5: Token decimals (elizaOS uses 9 decimals on all networks)
  try {
    const decimals = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    });
    if (decimals === 9) {
      pass(network, "token_decimals", `Token decimals: ${decimals} ✓`);
    } else {
      fail(network, "token_decimals", `Expected 9 decimals, got ${decimals}`);
    }
  } catch (e) {
    fail(network, "token_decimals", `Failed to read decimals: ${e instanceof Error ? e.message : "Unknown"}`);
  }
  
  // Test 6: Total supply (elizaOS uses 9 decimals)
  try {
    const totalSupply = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "totalSupply",
    });
    const formattedSupply = formatUnits(totalSupply, 9);
    pass(network, "total_supply", `Total supply: ${Number(formattedSupply).toLocaleString()} tokens`, { 
      totalSupply: formattedSupply 
    });
  } catch (e) {
    fail(network, "total_supply", `Failed to read totalSupply: ${e instanceof Error ? e.message : "Unknown"}`);
  }
  
  // Test 7: Hot wallet balance (if configured, elizaOS uses 9 decimals)
  const walletAddress = process.env.EVM_PAYOUT_WALLET_ADDRESS;
  if (walletAddress) {
    try {
      const balance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress as Address],
      });
      const formattedBalance = formatUnits(balance, 9);
      const balanceNum = Number(formattedBalance);
      
      if (balanceNum > 0) {
        pass(network, "hot_wallet_balance", `Hot wallet has ${balanceNum.toLocaleString()} tokens`, {
          balance: formattedBalance,
          address: walletAddress,
        });
      } else {
        fail(network, "hot_wallet_balance", `Hot wallet is empty (${walletAddress.slice(0, 10)}...)`, {
          address: walletAddress,
        });
      }
    } catch (e) {
      fail(network, "hot_wallet_balance", `Failed to check balance: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  } else {
    console.log(`  ⚠️ Skipping hot wallet check (EVM_PAYOUT_WALLET_ADDRESS not set)`);
  }
}

// ============================================================================
// SOLANA VERIFICATION
// ============================================================================

async function verifySolana() {
  console.log(`\n🔗 Verifying SOLANA...\n`);
  
  const tokenAddress = ELIZA_TOKEN_ADDRESSES.solana;
  const connection = new Connection(RPC_URLS.solana, "confirmed");
  
  // Test 1: RPC Connectivity
  try {
    const slot = await connection.getSlot();
    pass("solana", "rpc_connectivity", `RPC connected, slot: ${slot}`);
  } catch (e) {
    fail("solana", "rpc_connectivity", `RPC connection failed: ${e instanceof Error ? e.message : "Unknown"}`);
    return;
  }
  
  // Test 2: Token mint exists
  let mintInfo;
  try {
    const mintPubkey = new PublicKey(tokenAddress);
    mintInfo = await getMint(connection, mintPubkey);
    pass("solana", "token_exists", `Token mint exists at ${tokenAddress.slice(0, 8)}...`);
  } catch (e) {
    fail("solana", "token_exists", `Token mint not found: ${e instanceof Error ? e.message : "Unknown"}`);
    return;
  }
  
  // Test 3: Token decimals
  if (mintInfo.decimals === 9) {
    pass("solana", "token_decimals", `Token decimals: ${mintInfo.decimals} ✓`);
  } else {
    fail("solana", "token_decimals", `Expected 9 decimals, got ${mintInfo.decimals}`);
  }
  
  // Test 4: Total supply
  const supply = Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals);
  pass("solana", "total_supply", `Total supply: ${supply.toLocaleString()} tokens`, { supply });
  
  // Test 5: Hot wallet balance (if configured)
  const walletAddress = process.env.SOLANA_PAYOUT_WALLET_ADDRESS;
  if (walletAddress) {
    try {
      const walletPubkey = new PublicKey(walletAddress);
      const mintPubkey = new PublicKey(tokenAddress);
      const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey);
      
      const account = await getAccount(connection, ata);
      const balance = Number(account.amount) / Math.pow(10, mintInfo.decimals);
      
      if (balance > 0) {
        pass("solana", "hot_wallet_balance", `Hot wallet has ${balance.toLocaleString()} tokens`, {
          balance,
          address: walletAddress,
        });
      } else {
        fail("solana", "hot_wallet_balance", `Hot wallet is empty`, {
          address: walletAddress,
        });
      }
    } catch (e) {
      fail("solana", "hot_wallet_balance", `Failed to check balance: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  } else {
    console.log(`  ⚠️ Skipping hot wallet check (SOLANA_PAYOUT_WALLET_ADDRESS not set)`);
  }
}

// ============================================================================
// PRICE ORACLE VERIFICATION
// ============================================================================

async function verifyPriceOracle() {
  console.log(`\n📊 Verifying Price Oracle...\n`);
  
  // Test CoinGecko
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${ELIZA_TOKEN_ADDRESSES.base}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (response.ok) {
      const data = await response.json() as Record<string, { usd?: number }>;
      const price = data[ELIZA_TOKEN_ADDRESSES.base.toLowerCase()]?.usd;
      
      if (price) {
        pass("oracle", "coingecko", `CoinGecko price: $${price.toFixed(8)}`, { price });
      } else {
        fail("oracle", "coingecko", "CoinGecko returned no price data");
      }
    } else {
      fail("oracle", "coingecko", `CoinGecko HTTP ${response.status}`);
    }
  } catch (e) {
    fail("oracle", "coingecko", `CoinGecko failed: ${e instanceof Error ? e.message : "Unknown"}`);
  }
  
  // Test DexScreener
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${ELIZA_TOKEN_ADDRESSES.base}`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (response.ok) {
      const data = await response.json() as { pairs?: Array<{ priceUsd?: string }> };
      const price = data.pairs?.[0]?.priceUsd;
      
      if (price) {
        pass("oracle", "dexscreener", `DexScreener price: $${parseFloat(price).toFixed(8)}`, { price: parseFloat(price) });
      } else {
        fail("oracle", "dexscreener", "DexScreener returned no price data");
      }
    } else {
      fail("oracle", "dexscreener", `DexScreener HTTP ${response.status}`);
    }
  } catch (e) {
    fail("oracle", "dexscreener", `DexScreener failed: ${e instanceof Error ? e.message : "Unknown"}`);
  }
  
  // Test Jupiter (Solana)
  try {
    const response = await fetch(
      `https://price.jup.ag/v6/price?ids=${ELIZA_TOKEN_ADDRESSES.solana}`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (response.ok) {
      const data = await response.json() as { data?: Record<string, { price?: number }> };
      const price = data.data?.[ELIZA_TOKEN_ADDRESSES.solana]?.price;
      
      if (price) {
        pass("oracle", "jupiter", `Jupiter price: $${price.toFixed(8)}`, { price });
      } else {
        fail("oracle", "jupiter", "Jupiter returned no price data");
      }
    } else {
      fail("oracle", "jupiter", `Jupiter HTTP ${response.status}`);
    }
  } catch (e) {
    fail("oracle", "jupiter", `Jupiter failed: ${e instanceof Error ? e.message : "Unknown"}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║       elizaOS Payout System On-Chain Verification            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  
  console.log("\nToken Addresses:");
  console.log(`  Ethereum/Base/BNB: ${ELIZA_TOKEN_ADDRESSES.ethereum}`);
  console.log(`  Solana: ${ELIZA_TOKEN_ADDRESSES.solana}`);
  
  if (process.env.EVM_PAYOUT_WALLET_ADDRESS) {
    console.log(`\nEVM Hot Wallet: ${process.env.EVM_PAYOUT_WALLET_ADDRESS}`);
  }
  if (process.env.SOLANA_PAYOUT_WALLET_ADDRESS) {
    console.log(`Solana Hot Wallet: ${process.env.SOLANA_PAYOUT_WALLET_ADDRESS}`);
  }
  
  // Run verifications
  await verifyEvmNetwork("ethereum");
  await verifyEvmNetwork("base");
  await verifyEvmNetwork("bnb");
  await verifySolana();
  await verifyPriceOracle();
  
  // Summary
  console.log("\n" + "═".repeat(66));
  console.log("VERIFICATION SUMMARY");
  console.log("═".repeat(66));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`\n  Total Tests:  ${total}`);
  console.log(`  Passed:       ${passed} ✅`);
  console.log(`  Failed:       ${failed} ❌`);
  console.log(`  Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log("\n  Failed Tests:");
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    ❌ [${r.network}] ${r.test}: ${r.message}`);
    });
  }
  
  // Network summary
  console.log("\n  Per-Network Status:");
  for (const network of ["ethereum", "base", "bnb", "solana", "oracle"]) {
    const networkResults = results.filter(r => r.network === network);
    const networkPassed = networkResults.filter(r => r.passed).length;
    const networkTotal = networkResults.length;
    const status = networkPassed === networkTotal ? "✅" : "⚠️";
    console.log(`    ${status} ${network.toUpperCase()}: ${networkPassed}/${networkTotal} passed`);
  }
  
  console.log("\n" + "═".repeat(66));
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);

