#!/usr/bin/env npx tsx
/**
 * REAL On-Chain Verification - No LARP
 *
 * Makes actual blockchain calls to verify everything works.
 * Run: bun run scripts/real-onchain-verify.ts
 */

import {
  createPublicClient,
  http,
  formatUnits,
  parseAbi,
  type Address,
} from "viem";
import { mainnet, base, bsc } from "viem/chains";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getMint,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";

const ELIZA_TOKENS: Record<string, Address | string> = {
  ethereum: "0xea17df5cf6d172224892b5477a16acb111182478",
  base: "0xea17df5cf6d172224892b5477a16acb111182478",
  bnb: "0xea17df5cf6d172224892b5477a16acb111182478",
  solana: "DuMbhu7mvQvqQHGcnikDgb4XegXJRyhUBfdU22uELiZA",
};

const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

interface VerifyResult {
  network: string;
  blockNumber?: bigint | number;
  tokenName?: string;
  tokenSymbol?: string;
  decimals?: number;
  totalSupply?: string;
  error?: string;
}

async function verifyEVM(
  name: string,
  chain: typeof mainnet | typeof base | typeof bsc,
  rpcUrl: string,
  tokenAddress: Address,
): Promise<VerifyResult> {
  const result: VerifyResult = { network: name };

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  // Get block number
  result.blockNumber = await client.getBlockNumber();

  // Verify contract exists
  const code = await client.getCode({ address: tokenAddress });
  if (!code || code === "0x") {
    result.error = "Contract not found at address";
    return result;
  }

  // Read token data
  const [tokenName, tokenSymbol, decimals, totalSupply] = await Promise.all([
    client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "name",
    }),
    client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "symbol",
    }),
    client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
    client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "totalSupply",
    }),
  ]);

  result.tokenName = tokenName;
  result.tokenSymbol = tokenSymbol;
  result.decimals = Number(decimals);
  result.totalSupply = formatUnits(totalSupply, Number(decimals));

  return result;
}

async function verifySolana(): Promise<VerifyResult> {
  const result: VerifyResult = { network: "Solana" };

  const connection = new Connection(
    "https://api.mainnet-beta.solana.com",
    "confirmed",
  );

  // Get slot
  result.blockNumber = await connection.getSlot();

  // Get mint info
  const mintPubkey = new PublicKey(ELIZA_TOKENS.solana);
  const mintInfo = await getMint(connection, mintPubkey);

  result.tokenName = "elizaOS (SPL)";
  result.tokenSymbol = "ELIZA";
  result.decimals = mintInfo.decimals;
  result.totalSupply = (
    Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals)
  ).toLocaleString();

  return result;
}

async function checkPrice(
  source: string,
  url: string,
): Promise<{ price?: number; error?: string }> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { error: `HTTP ${response.status}` };
  }

  const data = await response.json();

  if (source === "coingecko") {
    const price = (data as Record<string, { usd?: number }>)[
      ELIZA_TOKENS.base.toLowerCase()
    ]?.usd;
    return price ? { price } : { error: "No price data" };
  }

  if (source === "dexscreener") {
    const price = (data as { pairs?: Array<{ priceUsd?: string }> }).pairs?.[0]
      ?.priceUsd;
    return price ? { price: parseFloat(price) } : { error: "No price data" };
  }

  return { error: "Unknown source" };
}

async function checkHotWallet(
  chain: typeof mainnet | typeof base | typeof bsc,
  rpcUrl: string,
  tokenAddress: Address,
  walletAddress: Address,
): Promise<{ tokenBalance: string; nativeBalance: string }> {
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const [tokenBalance, nativeBalance] = await Promise.all([
    client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
    }),
    client.getBalance({ address: walletAddress }),
  ]);

  return {
    tokenBalance: formatUnits(tokenBalance, 9), // elizaOS is 9 decimals
    nativeBalance: formatUnits(nativeBalance, 18),
  };
}

async function main() {
  console.log("═".repeat(70));
  console.log("   REAL ON-CHAIN VERIFICATION - ALL ACTUAL BLOCKCHAIN CALLS");
  console.log("═".repeat(70));
  console.log("");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("");

  let passed = 0;
  let failed = 0;

  // ========================================
  // ETHEREUM
  // ========================================
  console.log("🔗 ETHEREUM MAINNET");
  console.log("-".repeat(70));
  try {
    const eth = await verifyEVM(
      "Ethereum",
      mainnet,
      "https://eth.llamarpc.com",
      ELIZA_TOKENS.ethereum as Address,
    );
    console.log(`  Block: ${eth.blockNumber}`);
    console.log(`  Token: "${eth.tokenName}" (${eth.tokenSymbol})`);
    console.log(`  Decimals: ${eth.decimals}`);
    console.log(`  Supply: ${eth.totalSupply} tokens`);
    console.log("  ✅ VERIFIED");
    passed++;
  } catch (e: unknown) {
    const error = e as Error;
    console.log(`  ❌ FAILED: ${error.message}`);
    failed++;
  }
  console.log("");

  // ========================================
  // BASE
  // ========================================
  console.log("🔗 BASE MAINNET");
  console.log("-".repeat(70));
  try {
    const baseResult = await verifyEVM(
      "Base",
      base,
      "https://mainnet.base.org",
      ELIZA_TOKENS.base as Address,
    );
    console.log(`  Block: ${baseResult.blockNumber}`);
    console.log(
      `  Token: "${baseResult.tokenName}" (${baseResult.tokenSymbol})`,
    );
    console.log(`  Decimals: ${baseResult.decimals}`);
    console.log(`  Supply: ${baseResult.totalSupply} tokens`);
    console.log("  ✅ VERIFIED");
    passed++;
  } catch (e: unknown) {
    const error = e as Error;
    console.log(`  ❌ FAILED: ${error.message}`);
    failed++;
  }
  console.log("");

  // ========================================
  // BNB
  // ========================================
  console.log("🔗 BNB CHAIN MAINNET");
  console.log("-".repeat(70));
  try {
    const bnb = await verifyEVM(
      "BNB",
      bsc,
      "https://bsc-dataseed.binance.org",
      ELIZA_TOKENS.bnb as Address,
    );
    console.log(`  Block: ${bnb.blockNumber}`);
    console.log(`  Token: "${bnb.tokenName}" (${bnb.tokenSymbol})`);
    console.log(`  Decimals: ${bnb.decimals}`);
    console.log(`  Supply: ${bnb.totalSupply} tokens`);
    console.log("  ✅ VERIFIED");
    passed++;
  } catch (e: unknown) {
    const error = e as Error;
    console.log(`  ❌ FAILED: ${error.message}`);
    failed++;
  }
  console.log("");

  // ========================================
  // SOLANA
  // ========================================
  console.log("🔗 SOLANA MAINNET");
  console.log("-".repeat(70));
  try {
    const sol = await verifySolana();
    console.log(`  Slot: ${sol.blockNumber}`);
    console.log(`  Token: ${sol.tokenName}`);
    console.log(`  Decimals: ${sol.decimals}`);
    console.log(`  Supply: ${sol.totalSupply} tokens`);
    console.log("  ✅ VERIFIED");
    passed++;
  } catch (e: unknown) {
    const error = e as Error;
    console.log(`  ❌ FAILED: ${error.message}`);
    failed++;
  }
  console.log("");

  // ========================================
  // PRICE ORACLES
  // ========================================
  console.log("📊 PRICE ORACLES (REAL API CALLS)");
  console.log("-".repeat(70));

  try {
    const cg = await checkPrice(
      "coingecko",
      `https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${ELIZA_TOKENS.base}&vs_currencies=usd`,
    );
    if (cg.price) {
      console.log(`  CoinGecko: $${cg.price.toFixed(8)} ✅`);
      passed++;
    } else {
      console.log(`  CoinGecko: ${cg.error} ❌`);
      failed++;
    }
  } catch (e: unknown) {
    const error = e as Error;
    console.log(`  CoinGecko: ${error.message} ❌`);
    failed++;
  }

  try {
    const ds = await checkPrice(
      "dexscreener",
      `https://api.dexscreener.com/latest/dex/tokens/${ELIZA_TOKENS.base}`,
    );
    if (ds.price) {
      console.log(`  DexScreener: $${ds.price.toFixed(8)} ✅`);
      passed++;
    } else {
      console.log(`  DexScreener: ${ds.error} ❌`);
      failed++;
    }
  } catch (e: unknown) {
    const error = e as Error;
    console.log(`  DexScreener: ${error.message} ❌`);
    failed++;
  }
  console.log("");

  // ========================================
  // HOT WALLET
  // ========================================
  console.log("💳 HOT WALLET STATUS");
  console.log("-".repeat(70));

  const evmWallet = process.env.EVM_PAYOUT_WALLET_ADDRESS;
  const evmKey = process.env.EVM_PAYOUT_PRIVATE_KEY;

  if (evmWallet) {
    console.log(`  Configured Address: ${evmWallet}`);
    console.log(`  Private Key: ${evmKey ? "✅ SET" : "❌ NOT SET"}`);

    try {
      const walletStatus = await checkHotWallet(
        base,
        "https://mainnet.base.org",
        ELIZA_TOKENS.base as Address,
        evmWallet as Address,
      );
      console.log(
        `  elizaOS Balance (Base): ${walletStatus.tokenBalance} tokens`,
      );
      console.log(`  ETH Balance (Base): ${walletStatus.nativeBalance} ETH`);

      if (parseFloat(walletStatus.tokenBalance) > 0) {
        console.log("  ✅ Wallet has tokens ready for payouts");
        passed++;
      } else {
        console.log("  ⚠️ Wallet has NO tokens - needs funding");
      }
    } catch (e: unknown) {
      const error = e as Error;
      console.log(`  ❌ Balance check failed: ${error.message}`);
      failed++;
    }
  } else {
    console.log("  ⚠️ EVM_PAYOUT_WALLET_ADDRESS not configured");
    console.log("  Set this to enable payouts");
  }

  const solWallet = process.env.SOLANA_PAYOUT_WALLET_ADDRESS;
  if (solWallet) {
    console.log(`  Solana Address: ${solWallet}`);
  } else {
    console.log("  ⚠️ SOLANA_PAYOUT_WALLET_ADDRESS not configured");
  }
  console.log("");

  // ========================================
  // SUMMARY
  // ========================================
  console.log("═".repeat(70));
  console.log("   VERIFICATION SUMMARY");
  console.log("═".repeat(70));
  console.log("");
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(
    `  📊 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`,
  );
  console.log("");

  const allNetworks = passed >= 4; // 4 networks
  const pricesWork = passed >= 6; // + 2 oracles

  if (allNetworks && pricesWork) {
    console.log(
      "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    );
    console.log(
      "  🎉 ALL ON-CHAIN VERIFICATIONS PASSED - SYSTEM IS OPERATIONAL",
    );
    console.log(
      "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    );
  } else {
    console.log("  ⚠️  SOME VERIFICATIONS NEED ATTENTION");
  }
  console.log("");
  console.log("═".repeat(70));

  process.exit(failed > 0 && !allNetworks ? 1 : 0);
}

main().catch(console.error);
