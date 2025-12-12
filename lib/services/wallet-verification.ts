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

    // Store wallet link
    const walletData: NewOrgMemberWallet = {
      server_id: serverId,
      platform,
      platform_user_id: platformUserId,
      wallet_address: walletAddress,
      chain,
      verification_method: "signature",
      verification_signature: signature,
      verified_at: new Date(),
      is_primary: true, // First wallet is primary
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
    const rpcUrl = RPC_ENDPOINTS.solana;
    const connection = new Connection(rpcUrl);

    if (tokenType === "native") {
      // Check SOL balance
      const balance = await connection.getBalance(new PublicKey(walletAddress));
      return {
        hasBalance: balance > 0,
        balance: (balance / 1e9).toString(),
        chain: "solana",
      };
    }

    if (tokenType === "spl" || tokenType === "token") {
      // Check SPL token balance
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(walletAddress),
        { mint: new PublicKey(tokenAddress) }
      );

      let totalBalance = BigInt(0);
      for (const account of tokenAccounts.value) {
        const info = account.account.data.parsed?.info;
        if (info?.tokenAmount?.amount) {
          totalBalance += BigInt(info.tokenAmount.amount);
        }
      }

      return {
        hasBalance: totalBalance > 0,
        balance: totalBalance.toString(),
        tokenAddress,
        chain: "solana",
      };
    }

    if (tokenType === "nft") {
      // Check NFT ownership (by collection)
      // This is simplified - production would verify collection address
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(walletAddress),
        { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
      );

      // Look for NFTs (amount = 1, decimals = 0)
      const nfts = tokenAccounts.value.filter((account) => {
        const info = account.account.data.parsed?.info;
        return (
          info?.tokenAmount?.amount === "1" &&
          info?.tokenAmount?.decimals === 0
        );
      });

      return {
        hasBalance: nfts.length > 0,
        balance: nfts.length.toString(),
        tokenAddress,
        chain: "solana",
      };
    }

    return { hasBalance: false, balance: "0", chain: "solana" };
  }

  private async checkEvmTokenBalance(
    walletAddress: string,
    tokenAddress: string,
    chain: string,
    tokenType: OrgTokenGate["token_type"]
  ): Promise<TokenBalanceResult> {
    const rpcUrl = RPC_ENDPOINTS[chain] ?? RPC_ENDPOINTS.ethereum;
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    if (tokenType === "native") {
      // Check ETH/native balance
      const balance = await provider.getBalance(walletAddress);
      return {
        hasBalance: balance > 0n,
        balance: ethers.formatEther(balance),
        chain,
      };
    }

    if (tokenType === "erc20" || tokenType === "token") {
      // Check ERC20 balance
      const contract = new ethers.Contract(
        tokenAddress,
        ["function balanceOf(address) view returns (uint256)"],
        provider
      );
      const balance: bigint = await contract.balanceOf(walletAddress);

      return {
        hasBalance: balance > 0n,
        balance: balance.toString(),
        tokenAddress,
        chain,
      };
    }

    if (tokenType === "erc721" || tokenType === "nft") {
      // Check ERC721 ownership
      const contract = new ethers.Contract(
        tokenAddress,
        ["function balanceOf(address) view returns (uint256)"],
        provider
      );
      const balance: bigint = await contract.balanceOf(walletAddress);

      return {
        hasBalance: balance > 0n,
        balance: balance.toString(),
        tokenAddress,
        chain,
      };
    }

    if (tokenType === "erc1155") {
      // ERC1155 requires token ID
      // This is simplified - production would need token ID support
      return { hasBalance: false, balance: "0", chain };
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

      const requiredBalance = BigInt(gate.minimum_balance);
      const actualBalance = BigInt(balance.balance);
      const eligible = actualBalance >= requiredBalance;

      results.push({
        eligible,
        gateId: gate.id,
        gateName: gate.name,
        roleId: gate.role_id,
        balance: balance.balance,
        requiredBalance: gate.minimum_balance,
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
    const roleToGate = new Map<string, string>();

    for (const wallet of wallets) {
      for (const gate of gates) {
        if (gate.chain !== wallet.chain) continue;

        const balance = await this.checkTokenBalance(
          wallet.wallet_address,
          gate.token_address,
          gate.chain,
          gate.token_type
        );

        const required = BigInt(gate.minimum_balance);
        const actual = BigInt(balance.balance);

        if (actual >= required) {
          eligibleRoles.add(gate.role_id);
          roleToGate.set(gate.role_id, gate.id);
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
    const gateRoleIds = new Set(gates.map((g) => g.role_id));

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
        const gate = gates.find((g) => g.role_id === roleId);
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

