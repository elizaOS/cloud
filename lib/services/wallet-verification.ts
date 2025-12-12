/**
 * Wallet Verification Service
 *
 * Handles wallet verification for token-gated roles.
 * Supports signature verification and token balance checking
 * for Solana and EVM chains.
 */

import { logger } from "@/lib/utils/logger";
import { memberWalletsRepository, tokenGatesRepository } from "@/db/repositories/community-moderation";
import { discordMessageSender } from "./discord-gateway/message-sender";
import type { OrgTokenGate, OrgMemberWallet, NewOrgMemberWallet } from "@/db/schemas/org-community-moderation";
import nacl from "tweetnacl";
import { PublicKey, Connection } from "@solana/web3.js";
import { ethers } from "ethers";

// =============================================================================
// TYPES
// =============================================================================

export interface VerificationChallenge {
  nonce: string;
  message: string;
  expiresAt: Date;
}

export interface VerificationResult {
  verified: boolean;
  walletAddress?: string;
  chain?: "solana" | "ethereum" | "polygon" | "arbitrum" | "base";
  error?: string;
}

export interface TokenBalanceResult {
  hasBalance: boolean;
  balance: string;
  tokenAddress?: string;
  chain: string;
}

export interface GateCheckResult {
  eligible: boolean;
  gateId: string;
  gateName: string;
  roleId: string;
  balance?: string;
  requiredBalance: string;
}

// =============================================================================
// RPC ENDPOINTS
// =============================================================================

const RPC_ENDPOINTS: Record<string, string> = {
  solana: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  ethereum: process.env.ETHEREUM_RPC_URL ?? "https://eth.llamarpc.com",
  polygon: process.env.POLYGON_RPC_URL ?? "https://polygon.llamarpc.com",
  arbitrum: process.env.ARBITRUM_RPC_URL ?? "https://arbitrum.llamarpc.com",
  base: process.env.BASE_RPC_URL ?? "https://base.llamarpc.com",
};

// =============================================================================
// SERVICE
// =============================================================================

class WalletVerificationService {
  private static instance: WalletVerificationService;
  private challenges = new Map<string, VerificationChallenge>();

  private constructor() {}

  static getInstance(): WalletVerificationService {
    if (!WalletVerificationService.instance) {
      WalletVerificationService.instance = new WalletVerificationService();
    }
    return WalletVerificationService.instance;
  }

  // ===========================================================================
  // CHALLENGE GENERATION
  // ===========================================================================

  /**
   * Generate a verification challenge for a user.
   */
  generateChallenge(
    serverId: string,
    platformUserId: string,
    platform: string
  ): VerificationChallenge {
    const nonce = this.generateNonce();
    const message = `Verify wallet ownership for community access.\n\nServer: ${serverId}\nUser: ${platformUserId}\nNonce: ${nonce}\n\nSigning this message does not incur any fees.`;

    const challenge: VerificationChallenge = {
      nonce,
      message,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    };

    // Store challenge
    const key = `${serverId}:${platform}:${platformUserId}`;
    this.challenges.set(key, challenge);

    // Schedule cleanup
    setTimeout(() => {
      this.challenges.delete(key);
    }, 10 * 60 * 1000);

    return challenge;
  }

  /**
   * Get the current challenge for a user.
   */
  getChallenge(
    serverId: string,
    platformUserId: string,
    platform: string
  ): VerificationChallenge | null {
    const key = `${serverId}:${platform}:${platformUserId}`;
    const challenge = this.challenges.get(key);

    if (!challenge || challenge.expiresAt < new Date()) {
      this.challenges.delete(key);
      return null;
    }

    return challenge;
  }

  // ===========================================================================
  // SIGNATURE VERIFICATION
  // ===========================================================================

  /**
   * Verify a wallet signature and link the wallet to the user.
   */
  async verifyAndLinkWallet(
    serverId: string,
    platformUserId: string,
    platform: string,
    walletAddress: string,
    signature: string,
    chain: OrgMemberWallet["chain"]
  ): Promise<VerificationResult> {
    // Get challenge
    const key = `${serverId}:${platform}:${platformUserId}`;
    const challenge = this.challenges.get(key);

    if (!challenge || challenge.expiresAt < new Date()) {
      return { verified: false, error: "Challenge expired or not found" };
    }

    // Verify signature based on chain
    let verified = false;
    if (chain === "solana") {
      verified = await this.verifySolanaSignature(
        challenge.message,
        signature,
        walletAddress
      );
    } else {
      verified = await this.verifyEvmSignature(
        challenge.message,
        signature,
        walletAddress
      );
    }

    if (!verified) {
      return { verified: false, error: "Invalid signature" };
    }

    // Clear challenge
    this.challenges.delete(key);

    // Store wallet link - get server to find org
    const { db } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { orgPlatformServers } = await import("@/db/schemas/org-platforms");
    
    const [server] = await db
      .select({ organization_id: orgPlatformServers.organization_id })
      .from(orgPlatformServers)
      .where(eq(orgPlatformServers.id, serverId))
      .limit(1);

    if (!server) {
      return { verified: false, error: "Server not found" };
    }

    const walletData: NewOrgMemberWallet = {
      organization_id: server.organization_id,
      server_id: serverId,
      platform,
      platform_user_id: platformUserId,
      wallet_address: walletAddress,
      chain,
      verification_method: "signature",
      verification_signature: signature,
      verified_at: new Date(),
      is_primary: true,
    };

    await memberWalletsRepository.upsert(walletData);

    logger.info("[WalletVerification] Wallet verified and linked", {
      serverId,
      platformUserId,
      walletAddress: walletAddress.slice(0, 8) + "...",
      chain,
    });

    return { verified: true, walletAddress, chain };
  }

  private async verifySolanaSignature(
    message: string,
    signature: string,
    walletAddress: string
  ): Promise<boolean> {
    try {
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = Buffer.from(signature, "base64");
      const publicKeyBytes = new PublicKey(walletAddress).toBytes();

      return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (error) {
      logger.error("[WalletVerification] Solana signature verification failed", { error });
      return false;
    }
  }

  private async verifyEvmSignature(
    message: string,
    signature: string,
    walletAddress: string
  ): Promise<boolean> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
    } catch (error) {
      logger.error("[WalletVerification] EVM signature verification failed", { error });
      return false;
    }
  }

  // ===========================================================================
  // TOKEN BALANCE CHECKING
  // ===========================================================================

  /**
   * Check token balance for a wallet.
   */
  async checkTokenBalance(
    walletAddress: string,
    tokenAddress: string,
    chain: string,
    tokenType: OrgTokenGate["token_type"]
  ): Promise<TokenBalanceResult> {
    if (chain === "solana") {
      return this.checkSolanaTokenBalance(walletAddress, tokenAddress, tokenType);
    }
    return this.checkEvmTokenBalance(walletAddress, tokenAddress, chain, tokenType);
  }

  private async checkSolanaTokenBalance(
    walletAddress: string,
    tokenAddress: string,
    tokenType: OrgTokenGate["token_type"]
  ): Promise<TokenBalanceResult> {
    const connection = new Connection(RPC_ENDPOINTS.solana);
    const pubkey = new PublicKey(walletAddress);

    // For SPL tokens (token type)
    if (tokenType === "token") {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        pubkey,
        { mint: new PublicKey(tokenAddress) }
      );

      let totalBalance = BigInt(0);
      for (const account of tokenAccounts.value) {
        const amount = account.account.data.parsed?.info?.tokenAmount?.amount;
        if (amount) totalBalance += BigInt(amount);
      }

      return { hasBalance: totalBalance > 0, balance: totalBalance.toString(), tokenAddress, chain: "solana" };
    }

    // For NFTs (single or collection)
    if (tokenType === "nft" || tokenType === "nft_collection") {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        pubkey,
        { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
      );

      // NFTs have amount=1, decimals=0
      const nftCount = tokenAccounts.value.filter((account) => {
        const info = account.account.data.parsed?.info?.tokenAmount;
        return info?.amount === "1" && info?.decimals === 0;
      }).length;

      return { hasBalance: nftCount > 0, balance: nftCount.toString(), tokenAddress, chain: "solana" };
    }

    return { hasBalance: false, balance: "0", chain: "solana" };
  }

  private async checkEvmTokenBalance(
    walletAddress: string,
    tokenAddress: string,
    chain: string,
    tokenType: OrgTokenGate["token_type"]
  ): Promise<TokenBalanceResult> {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain] ?? RPC_ENDPOINTS.ethereum);

    // ERC20 tokens
    if (tokenType === "token") {
      const contract = new ethers.Contract(
        tokenAddress,
        ["function balanceOf(address) view returns (uint256)"],
        provider
      );
      const balance: bigint = await contract.balanceOf(walletAddress);
      return { hasBalance: balance > 0n, balance: balance.toString(), tokenAddress, chain };
    }

    // ERC721 NFTs
    if (tokenType === "nft" || tokenType === "nft_collection") {
      const contract = new ethers.Contract(
        tokenAddress,
        ["function balanceOf(address) view returns (uint256)"],
        provider
      );
      const balance: bigint = await contract.balanceOf(walletAddress);
      return { hasBalance: balance > 0n, balance: balance.toString(), tokenAddress, chain };
    }

    return { hasBalance: false, balance: "0", chain };
  }

  // ===========================================================================
  // GATE EVALUATION
  // ===========================================================================

  /**
   * Check if a wallet meets token gate requirements.
   */
  async checkGates(
    serverId: string,
    walletAddress: string,
    chain: OrgMemberWallet["chain"]
  ): Promise<GateCheckResult[]> {
    const gates = await tokenGatesRepository.findEnabledByServer(serverId);
    const results: GateCheckResult[] = [];

    for (const gate of gates) {
      if (gate.chain !== chain) continue;

      const balance = await this.checkTokenBalance(
        walletAddress,
        gate.token_address,
        gate.chain,
        gate.token_type
      );

      const requiredBalance = BigInt(gate.min_balance);
      const actualBalance = BigInt(balance.balance);
      const eligible = actualBalance >= requiredBalance;

      results.push({
        eligible,
        gateId: gate.id,
        gateName: gate.name,
        roleId: gate.discord_role_id ?? "",
        balance: balance.balance,
        requiredBalance: gate.min_balance,
      });
    }

    return results;
  }

  /**
   * Sync roles for a user based on their verified wallets.
   */
  async syncRoles(
    serverId: string,
    platformUserId: string,
    platform: string,
    connectionId: string,
    guildId: string
  ): Promise<{
    added: string[];
    removed: string[];
  }> {
    const wallets = await memberWalletsRepository.findByPlatformUser(
      serverId,
      platformUserId,
      platform
    );

    if (wallets.length === 0) {
      return { added: [], removed: [] };
    }

    // Get all gates for this server
    const gates = await tokenGatesRepository.findEnabledByServer(serverId);

    // Check each wallet against each gate
    const eligibleRoles = new Set<string>();

    for (const wallet of wallets) {
      for (const gate of gates) {
        if (gate.chain !== wallet.chain) continue;

        const balance = await this.checkTokenBalance(
          wallet.wallet_address,
          gate.token_address,
          gate.chain,
          gate.token_type
        );

        const required = BigInt(gate.min_balance);
        const actual = BigInt(balance.balance);

        if (actual >= required && gate.discord_role_id) {
          eligibleRoles.add(gate.discord_role_id);
        }
      }
    }

    // Get current roles
    const member = await discordMessageSender.getGuildMember(
      connectionId,
      guildId,
      platformUserId
    );

    if (!member) {
      return { added: [], removed: [] };
    }

    const currentRoles = new Set(member.roles);
    const gateRoleIds = new Set(gates.map((g) => g.discord_role_id).filter(Boolean));

    // Calculate role changes
    const added: string[] = [];
    const removed: string[] = [];

    // Add eligible roles
    for (const roleId of eligibleRoles) {
      if (!currentRoles.has(roleId)) {
        const result = await discordMessageSender.addRole(
          connectionId,
          guildId,
          platformUserId,
          roleId,
          "Token gate verification"
        );
        if (result.success) {
          added.push(roleId);
        }
      }
    }

    // Remove ineligible gate roles (only roles managed by gates)
    for (const roleId of currentRoles) {
      if (gateRoleIds.has(roleId) && !eligibleRoles.has(roleId)) {
        const result = await discordMessageSender.removeRole(
          connectionId,
          guildId,
          platformUserId,
          roleId,
          "Token gate requirement no longer met"
        );
        if (result.success) {
          removed.push(roleId);
        }
      }
    }

    // Update wallet records with assigned roles
    for (const wallet of wallets) {
      const assignedRoles = Array.from(eligibleRoles).filter((roleId) => {
        const gate = gates.find((g) => g.discord_role_id === roleId);
        return gate?.chain === wallet.chain;
      });
      await memberWalletsRepository.updateAssignedRoles(wallet.id, assignedRoles);
    }

    logger.info("[WalletVerification] Roles synced", {
      serverId,
      platformUserId,
      added,
      removed,
    });

    return { added, removed };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const walletVerificationService = WalletVerificationService.getInstance();

