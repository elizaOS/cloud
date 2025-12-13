/**
 * Wallet Verification Service - signature verification and token balance checking for Solana/EVM.
 */

import { db } from "@/db";
import { eq } from "drizzle-orm";
import { orgPlatformServers } from "@/db/schemas/org-platforms";
import { logger } from "@/lib/utils/logger";
import { memberWalletsRepository, tokenGatesRepository } from "@/db/repositories/community-moderation";
import { discordMessageSender } from "./discord-gateway/message-sender";
import type { OrgTokenGate, OrgMemberWallet, NewOrgMemberWallet } from "@/db/schemas/org-community-moderation";
import nacl from "tweetnacl";
import { PublicKey, Connection } from "@solana/web3.js";
import { ethers } from "ethers";
import { Redis } from "@upstash/redis";

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
  roleId?: string;
  balance?: string;
  requiredBalance: string;
}

const RPC_ENDPOINTS: Record<string, string> = {
  solana: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  ethereum: process.env.ETHEREUM_RPC_URL ?? "https://eth.llamarpc.com",
  polygon: process.env.POLYGON_RPC_URL ?? "https://polygon.llamarpc.com",
  arbitrum: process.env.ARBITRUM_RPC_URL ?? "https://arbitrum.llamarpc.com",
  base: process.env.BASE_RPC_URL ?? "https://base.llamarpc.com",
};

const CHALLENGE_KEY_PREFIX = "wallet:challenge:";
const CHALLENGE_TTL_SECONDS = 600;

class WalletVerificationService {
  private static instance: WalletVerificationService;
  private redis: Redis | null = null;
  private memoryFallback = new Map<string, VerificationChallenge>();
  private redisInitialized = false;

  private constructor() {}

  static getInstance(): WalletVerificationService {
    return WalletVerificationService.instance ??= new WalletVerificationService();
  }

  private getRedis(): Redis | null {
    if (this.redisInitialized) return this.redis;
    this.redisInitialized = true;

    const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
    const restUrl = process.env.KV_REST_API_URL;
    const restToken = process.env.KV_REST_API_TOKEN;

    if (redisUrl) {
      this.redis = Redis.fromEnv();
      logger.info("[WalletVerification] Redis challenge store initialized (native)");
    } else if (restUrl && restToken) {
      this.redis = new Redis({ url: restUrl, token: restToken });
      logger.info("[WalletVerification] Redis challenge store initialized (REST)");
    } else {
      logger.warn("[WalletVerification] Redis not available, using in-memory fallback (not recommended for production)");
    }

    return this.redis;
  }

  generateChallenge(serverId: string, platformUserId: string, platform: string): VerificationChallenge {
    const nonce = this.generateNonce();
    const message = `Verify wallet ownership for community access.\n\nServer: ${serverId}\nUser: ${platformUserId}\nNonce: ${nonce}\n\nSigning this message does not incur any fees.`;
    const challenge: VerificationChallenge = { nonce, message, expiresAt: new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000) };

    const key = `${CHALLENGE_KEY_PREFIX}${serverId}:${platform}:${platformUserId}`;
    const redis = this.getRedis();

    if (redis) {
      redis.set(key, JSON.stringify(challenge), { ex: CHALLENGE_TTL_SECONDS }).catch((err) => {
        logger.error("[WalletVerification] Failed to store challenge in Redis", { error: err });
      });
    } else {
      this.memoryFallback.set(key, challenge);
      setTimeout(() => this.memoryFallback.delete(key), CHALLENGE_TTL_SECONDS * 1000);
    }

    return challenge;
  }

  async getChallenge(serverId: string, platformUserId: string, platform: string): Promise<VerificationChallenge | null> {
    const key = `${CHALLENGE_KEY_PREFIX}${serverId}:${platform}:${platformUserId}`;
    const redis = this.getRedis();

    if (redis) {
      const data = await redis.get<string>(key);
      if (!data) return null;
      const challenge: VerificationChallenge = JSON.parse(data);
      challenge.expiresAt = new Date(challenge.expiresAt);
      if (challenge.expiresAt < new Date()) {
        await redis.del(key);
        return null;
      }
      return challenge;
    }

    const challenge = this.memoryFallback.get(key);
    if (!challenge || challenge.expiresAt < new Date()) {
      this.memoryFallback.delete(key);
      return null;
    }
    return challenge;
  }

  async deleteChallenge(serverId: string, platformUserId: string, platform: string): Promise<void> {
    const key = `${CHALLENGE_KEY_PREFIX}${serverId}:${platform}:${platformUserId}`;
    const redis = this.getRedis();

    if (redis) {
      await redis.del(key);
    } else {
      this.memoryFallback.delete(key);
    }
  }

  async verifyAndLinkWallet(serverId: string, platformUserId: string, platform: string, walletAddress: string, signature: string, chain: OrgMemberWallet["chain"]): Promise<VerificationResult & { wallet?: OrgMemberWallet }> {
    const challenge = await this.getChallenge(serverId, platformUserId, platform);
    if (!challenge) return { verified: false, error: "Challenge expired or not found" };

    const verified = chain === "solana"
      ? this.verifySolanaSignature(challenge.message, signature, walletAddress)
      : this.verifyEvmSignature(challenge.message, signature, walletAddress);

    if (!verified) return { verified: false, error: "Invalid signature" };

    await this.deleteChallenge(serverId, platformUserId, platform);

    const [server] = await db.select({ organization_id: orgPlatformServers.organization_id }).from(orgPlatformServers).where(eq(orgPlatformServers.id, serverId)).limit(1);
    if (!server) return { verified: false, error: "Server not found" };

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

    const wallet = await memberWalletsRepository.upsert(walletData);
    logger.info("[WalletVerification] Wallet verified", { serverId, platformUserId, wallet: walletAddress.slice(0, 8), chain });

    return { verified: true, walletAddress, chain, wallet };
  }

  private verifySolanaSignature(message: string, signature: string, walletAddress: string): boolean {
    try {
      return nacl.sign.detached.verify(
        new TextEncoder().encode(message),
        Buffer.from(signature, "base64"),
        new PublicKey(walletAddress).toBytes()
      );
    } catch (e) {
      logger.error("[WalletVerification] Solana verify failed", { error: e });
      return false;
    }
  }

  private verifyEvmSignature(message: string, signature: string, walletAddress: string): boolean {
    try {
      return ethers.verifyMessage(message, signature).toLowerCase() === walletAddress.toLowerCase();
    } catch (e) {
      logger.error("[WalletVerification] EVM verify failed", { error: e });
      return false;
    }
  }

  async checkTokenBalance(walletAddress: string, tokenAddress: string, chain: string, tokenType: OrgTokenGate["token_type"]): Promise<TokenBalanceResult> {
    return chain === "solana"
      ? this.checkSolanaBalance(walletAddress, tokenAddress, tokenType)
      : this.checkEvmBalance(walletAddress, tokenAddress, chain, tokenType);
  }

  private async checkSolanaBalance(walletAddress: string, tokenAddress: string, tokenType: OrgTokenGate["token_type"]): Promise<TokenBalanceResult> {
    const connection = new Connection(RPC_ENDPOINTS.solana);
    const pubkey = new PublicKey(walletAddress);

    if (tokenType === "token") {
      const accounts = await connection.getParsedTokenAccountsByOwner(pubkey, { mint: new PublicKey(tokenAddress) });
      let total = BigInt(0);
      for (const acc of accounts.value) {
        const amount = acc.account.data.parsed?.info?.tokenAmount?.amount;
        if (amount) total += BigInt(amount);
      }
      return { hasBalance: total > 0, balance: total.toString(), tokenAddress, chain: "solana" };
    }

    if (tokenType === "nft" || tokenType === "nft_collection") {
      const accounts = await connection.getParsedTokenAccountsByOwner(pubkey, { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") });
      const nftCount = accounts.value.filter((a) => {
        const info = a.account.data.parsed?.info?.tokenAmount;
        return info?.amount === "1" && info?.decimals === 0;
      }).length;
      return { hasBalance: nftCount > 0, balance: nftCount.toString(), tokenAddress, chain: "solana" };
    }

    return { hasBalance: false, balance: "0", chain: "solana" };
  }

  private async checkEvmBalance(walletAddress: string, tokenAddress: string, chain: string, tokenType: OrgTokenGate["token_type"]): Promise<TokenBalanceResult> {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain] ?? RPC_ENDPOINTS.ethereum);

    if (tokenType === "token" || tokenType === "nft" || tokenType === "nft_collection") {
      const contract = new ethers.Contract(tokenAddress, ["function balanceOf(address) view returns (uint256)"], provider);
      const balance: bigint = await contract.balanceOf(walletAddress);
      return { hasBalance: balance > 0n, balance: balance.toString(), tokenAddress, chain };
    }

    return { hasBalance: false, balance: "0", chain };
  }

  async checkGates(serverId: string, walletAddress: string, chain: OrgMemberWallet["chain"]): Promise<GateCheckResult[]> {
    const gates = await tokenGatesRepository.findEnabledByServer(serverId);
    const results: GateCheckResult[] = [];

    for (const gate of gates) {
      if (gate.chain !== chain) continue;

      const balance = await this.checkTokenBalance(walletAddress, gate.token_address, gate.chain, gate.token_type);
      const eligible = BigInt(balance.balance) >= BigInt(gate.min_balance);

      results.push({
        eligible,
        gateId: gate.id,
        gateName: gate.name,
        ...(gate.discord_role_id && { roleId: gate.discord_role_id }),
        balance: balance.balance,
        requiredBalance: gate.min_balance,
      });
    }

    return results;
  }

  async syncRoles(serverId: string, platformUserId: string, platform: string, connectionId: string, guildId: string): Promise<{ added: string[]; removed: string[] }> {
    const wallets = await memberWalletsRepository.findByPlatformUser(serverId, platformUserId, platform);
    if (wallets.length === 0) return { added: [], removed: [] };

    const gates = await tokenGatesRepository.findEnabledByServer(serverId);
    const eligibleRoles = new Set<string>();

    for (const wallet of wallets) {
      for (const gate of gates) {
        if (gate.chain !== wallet.chain || !gate.discord_role_id) continue;

        const balance = await this.checkTokenBalance(wallet.wallet_address, gate.token_address, gate.chain, gate.token_type);
        if (BigInt(balance.balance) >= BigInt(gate.min_balance)) {
          eligibleRoles.add(gate.discord_role_id);
        }
      }
    }

    const member = await discordMessageSender.getGuildMember(connectionId, guildId, platformUserId);
    if (!member) return { added: [], removed: [] };

    const currentRoles = new Set(member.roles);
    const gateRoleIds = new Set(gates.map((g) => g.discord_role_id).filter((id): id is string => Boolean(id)));
    const added: string[] = [];
    const removed: string[] = [];

    for (const roleId of eligibleRoles) {
      if (!currentRoles.has(roleId)) {
        const result = await discordMessageSender.addRole(connectionId, guildId, platformUserId, roleId, "Token gate");
        if (result.success) added.push(roleId);
      }
    }

    for (const roleId of currentRoles) {
      if (gateRoleIds.has(roleId) && !eligibleRoles.has(roleId)) {
        const result = await discordMessageSender.removeRole(connectionId, guildId, platformUserId, roleId, "Token gate no longer met");
        if (result.success) removed.push(roleId);
      }
    }

    for (const wallet of wallets) {
      const assignedRoles = Array.from(eligibleRoles).filter((roleId) => {
        const gate = gates.find((g) => g.discord_role_id === roleId);
        return gate?.chain === wallet.chain;
      });
      await memberWalletsRepository.updateAssignedRoles(wallet.id, assignedRoles);
    }

    logger.info("[WalletVerification] Roles synced", { serverId, platformUserId, added, removed });
    return { added, removed };
  }

  private generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

export const walletVerificationService = WalletVerificationService.getInstance();
