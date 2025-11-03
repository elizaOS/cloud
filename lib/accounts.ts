import type { Account } from "viem/accounts";
import { CdpClient } from "@coinbase/cdp-sdk";
import { base, baseSepolia } from "viem/chains";
import { createPublicClient, http } from "viem";

export const env = {
  NETWORK:
    (process.env.NEXT_PUBLIC_NETWORK as "base" | "base-sepolia") || "base",
  CDP_API_KEY_ID: process.env.CDP_API_KEY_ID || "",
  CDP_API_KEY_SECRET: process.env.CDP_API_KEY_SECRET || "",
  CDP_WALLET_SECRET: process.env.CDP_WALLET_SECRET || "",
} as const;

let cdpInstance: CdpClient | null = null;

function getCdpClient(): CdpClient {
  if (!cdpInstance) {
    cdpInstance = new CdpClient();
  }
  return cdpInstance;
}

const chainMap = {
  "base-sepolia": baseSepolia,
  base: base,
} as const;

const publicClient = createPublicClient({
  chain: chainMap[env.NETWORK],
  transport: http(),
});

export async function getOrCreatePurchaserAccount(): Promise<Account> {
  const cdp = getCdpClient();
  const account = await cdp.evm.getOrCreateAccount({
    name: "Purchaser",
  });
  const balances = await account.listTokenBalances({
    network: env.NETWORK,
  });

  const usdcBalance = balances.balances.find(
    (balance) => balance.token.symbol === "USDC",
  );

  // if under $0.50 while on testnet, request more
  if (
    env.NETWORK === "base-sepolia" &&
    (!usdcBalance || Number(usdcBalance.amount) < 500000)
  ) {
    const { transactionHash } = await getCdpClient().evm.requestFaucet({
      address: account.address,
      network: env.NETWORK,
      token: "usdc",
    });
    const tx = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
    });
    if (tx.status !== "success") {
      throw new Error("Failed to receive funds from faucet");
    }
  }

  // The CDP SDK account object is already compatible with viem Account
  // Bypass toAccount() to avoid version conflicts between viem and x402-mcp
  return account as unknown as Account;
}

export async function getOrCreateSellerAccount(): Promise<Account> {
  const cdp = getCdpClient();
  const account = await cdp.evm.getOrCreateAccount({
    name: "Seller",
  });
  // The CDP SDK account object is already compatible with viem Account
  // Bypass toAccount() to avoid version conflicts between viem and x402-mcp
  return account as unknown as Account;
}
