/**
 * Community Moderation MCP Tools
 */

import { z } from "zod";
import { communityModerationService, type ModerationContext } from "@/lib/services/community-moderation";
import { walletVerificationService } from "@/lib/services/wallet-verification";
import { memberWalletsRepository } from "@/db/repositories/community-moderation";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { orgTokenGates, orgBlockedPatterns, type ModerationAction, type ModerationSeverity } from "@/db/schemas/org-community-moderation";
import { logger } from "@/lib/utils/logger";
import type { MCPContext, MCPToolDefinition } from "./index";

const platformEnum = z.enum(["discord", "telegram", "slack"]);
const chainEnum = z.enum(["solana", "ethereum", "base", "polygon", "arbitrum", "optimism"]);
const actionEnum = z.enum(["warn", "delete", "timeout", "kick", "ban"]);
const severityEnum = z.enum(["low", "medium", "high", "critical"]);

const CheckMessageSchema = z.object({
  serverId: z.string().uuid(),
  platformUserId: z.string(),
  platform: platformEnum,
  platformUsername: z.string().optional(),
  channelId: z.string().optional(),
  messageId: z.string().optional(),
  content: z.string(),
});

const ExecuteModerationSchema = z.object({
  serverId: z.string().uuid(),
  platformUserId: z.string(),
  platform: platformEnum,
  platformUsername: z.string().optional(),
  action: actionEnum,
  reason: z.string(),
  durationMinutes: z.number().optional(),
  channelId: z.string().optional(),
  messageId: z.string().optional(),
});

const GetModerationHistorySchema = z.object({
  serverId: z.string().uuid(),
  platformUserId: z.string().optional(),
  platform: platformEnum.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

const GetUserViolationsSchema = z.object({
  serverId: z.string().uuid(),
  platformUserId: z.string(),
  platform: platformEnum,
});

const ResolveEventSchema = z.object({
  eventId: z.string().uuid(),
  notes: z.string().optional(),
  falsePositive: z.boolean().optional(),
});

const CreateTokenGateSchema = z.object({
  serverId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  chain: chainEnum,
  tokenType: z.enum(["token", "nft", "nft_collection"]),
  tokenAddress: z.string(),
  minBalance: z.string().default("1"),
  discordRoleId: z.string().optional(),
  telegramGroupId: z.string().optional(),
  removeOnFail: z.boolean().default(true),
});

const ListTokenGatesSchema = z.object({ serverId: z.string().uuid() });
const UpdateTokenGateSchema = z.object({ gateId: z.string().uuid(), enabled: z.boolean().optional(), minBalance: z.string().optional(), removeOnFail: z.boolean().optional() });
const DeleteTokenGateSchema = z.object({ gateId: z.string().uuid() });

const CreateBlockedPatternSchema = z.object({
  serverId: z.string().uuid().optional(),
  patternType: z.enum(["exact", "contains", "regex", "domain"]),
  pattern: z.string(),
  category: z.enum(["scam", "spam", "phishing", "banned_word"]),
  action: actionEnum.default("delete"),
  severity: severityEnum.default("medium"),
  description: z.string().optional(),
});

const ListBlockedPatternsSchema = z.object({ serverId: z.string().uuid().optional(), category: z.string().optional() });
const DeleteBlockedPatternSchema = z.object({ patternId: z.string().uuid() });
const GetSettingsLinkSchema = z.object({ section: z.string().optional() });

const VerifyWalletSchema = z.object({
  serverId: z.string().uuid(),
  platformUserId: z.string(),
  platform: platformEnum,
  walletAddress: z.string(),
  chain: chainEnum,
  signature: z.string().describe("Base64-encoded signature of the challenge message"),
});

const CheckTokenBalanceSchema = z.object({ walletAddress: z.string(), chain: chainEnum, tokenAddress: z.string() });
const GetVerificationChallengeSchema = z.object({ serverId: z.string().uuid(), platformUserId: z.string(), platform: platformEnum });
const SyncUserRolesSchema = z.object({ serverId: z.string().uuid(), platformUserId: z.string(), platform: platformEnum, connectionId: z.string().uuid(), guildId: z.string() });
const ListUserWalletsSchema = z.object({ serverId: z.string().uuid(), platformUserId: z.string(), platform: platformEnum });

async function handleCheckMessage(params: z.infer<typeof CheckMessageSchema>, context: MCPContext) {
  const ctx: ModerationContext = { organizationId: context.organizationId, serverId: params.serverId, platformUserId: params.platformUserId, platform: params.platform, platformUsername: params.platformUsername, channelId: params.channelId, messageId: params.messageId };
  const result = await communityModerationService.moderateMessage(ctx, params.content);
  return { success: true, shouldModerate: result.shouldModerate, ...(result.shouldModerate && { eventType: result.eventType, severity: result.severity, recommendedAction: result.recommendedAction, reason: result.reason, confidence: result.confidence, matchedPattern: result.matchedPattern }) };
}

async function handleExecuteModeration(params: z.infer<typeof ExecuteModerationSchema>, context: MCPContext) {
  const ctx: ModerationContext = { organizationId: context.organizationId, serverId: params.serverId, platformUserId: params.platformUserId, platform: params.platform, platformUsername: params.platformUsername, channelId: params.channelId, messageId: params.messageId };

  const event = await communityModerationService.events.logEvent({
    organization_id: context.organizationId, server_id: params.serverId, platform_user_id: params.platformUserId, platform: params.platform, platform_username: params.platformUsername,
    event_type: "manual", severity: params.action === "ban" ? "critical" : params.action === "kick" ? "high" : "medium",
    message_id: params.messageId, channel_id: params.channelId, content_sample: params.reason.slice(0, 500),
    action_taken: params.action as ModerationAction, action_duration_minutes: params.durationMinutes,
    action_expires_at: params.durationMinutes ? new Date(Date.now() + params.durationMinutes * 60_000) : undefined,
    detected_by: context.userId ?? "agent", confidence_score: 100,
  });

  if (params.action === "timeout" && params.durationMinutes) {
    await communityModerationService.spam.applyRateLimit(ctx, params.durationMinutes);
  }

  logger.info("[Moderation] Manual action", { eventId: event.id, action: params.action, userId: params.platformUserId });
  return { success: true, eventId: event.id, action: params.action };
}

async function handleGetModerationHistory(params: z.infer<typeof GetModerationHistorySchema>, _context: MCPContext) {
  let events = await communityModerationService.events.getRecentEvents(params.serverId, params.limit);
  if (params.platformUserId) events = events.filter((e) => e.platform_user_id === params.platformUserId);
  if (params.platform) events = events.filter((e) => e.platform === params.platform);

  return {
    success: true,
    events: events.map((e) => ({ id: e.id, eventType: e.event_type, severity: e.severity, platformUserId: e.platform_user_id, platform: e.platform, actionTaken: e.action_taken, createdAt: e.created_at.toISOString(), resolvedAt: e.resolved_at?.toISOString(), falsePositive: e.false_positive })),
    total: events.length,
  };
}

async function handleGetUserViolations(params: z.infer<typeof GetUserViolationsSchema>, _context: MCPContext) {
  const events = await communityModerationService.events.getEventsForUser(params.serverId, params.platformUserId, params.platform);
  const count = await communityModerationService.events.getViolationCount(params.serverId, params.platformUserId, params.platform);
  return {
    success: true,
    violations: events.map((e) => ({ id: e.id, eventType: e.event_type, severity: e.severity, actionTaken: e.action_taken, createdAt: e.created_at.toISOString(), falsePositive: e.false_positive })),
    violationCount: count,
    escalationStatus: { warningCount: events.filter((e) => e.action_taken === "warn").length, timeoutCount: events.filter((e) => e.action_taken === "timeout").length },
  };
}

async function handleResolveEvent(params: z.infer<typeof ResolveEventSchema>, context: MCPContext) {
  await communityModerationService.events.resolveEvent(params.eventId, context.userId ?? "agent", params.notes, params.falsePositive);
  return { success: true, message: params.falsePositive ? "Marked false positive" : "Resolved" };
}

async function handleCreateTokenGate(params: z.infer<typeof CreateTokenGateSchema>, context: MCPContext) {
  const [gate] = await db.insert(orgTokenGates).values({
    organization_id: context.organizationId, server_id: params.serverId, name: params.name, description: params.description,
    chain: params.chain, token_type: params.tokenType, token_address: params.tokenAddress, min_balance: params.minBalance,
    discord_role_id: params.discordRoleId, telegram_group_id: params.telegramGroupId, remove_on_fail: params.removeOnFail, created_by: context.userId,
  }).returning();
  return { success: true, tokenGate: { id: gate.id, name: gate.name, chain: gate.chain, tokenType: gate.token_type, tokenAddress: gate.token_address, minBalance: gate.min_balance }, settingsLink: communityModerationService.getSettingsLink(context.organizationId, "token-gating") };
}

async function handleListTokenGates(params: z.infer<typeof ListTokenGatesSchema>, _context: MCPContext) {
  const gates = await communityModerationService.tokenGates.getTokenGates(params.serverId);
  return { success: true, tokenGates: gates.map((g) => ({ id: g.id, name: g.name, chain: g.chain, tokenType: g.token_type, tokenAddress: g.token_address, minBalance: g.min_balance, discordRoleId: g.discord_role_id, enabled: g.enabled, removeOnFail: g.remove_on_fail })) };
}

async function handleUpdateTokenGate(params: z.infer<typeof UpdateTokenGateSchema>, _context: MCPContext) {
  const [updated] = await db.update(orgTokenGates).set({ enabled: params.enabled, min_balance: params.minBalance, remove_on_fail: params.removeOnFail, updated_at: new Date() }).where(eq(orgTokenGates.id, params.gateId)).returning();
  return { success: true, tokenGate: { id: updated.id, name: updated.name, enabled: updated.enabled, minBalance: updated.min_balance } };
}

async function handleDeleteTokenGate(params: z.infer<typeof DeleteTokenGateSchema>, _context: MCPContext) {
  await db.delete(orgTokenGates).where(eq(orgTokenGates.id, params.gateId));
  return { success: true };
}

async function handleCreateBlockedPattern(params: z.infer<typeof CreateBlockedPatternSchema>, context: MCPContext) {
  const [pattern] = await db.insert(orgBlockedPatterns).values({
    organization_id: context.organizationId, server_id: params.serverId, pattern_type: params.patternType, pattern: params.pattern,
    category: params.category, action: params.action as ModerationAction, severity: params.severity as ModerationSeverity, description: params.description, created_by: context.userId,
  }).returning();
  return { success: true, pattern: { id: pattern.id, patternType: pattern.pattern_type, pattern: pattern.pattern, category: pattern.category, action: pattern.action }, settingsLink: communityModerationService.getSettingsLink(context.organizationId, "moderation") };
}

async function handleListBlockedPatterns(params: z.infer<typeof ListBlockedPatternsSchema>, context: MCPContext) {
  let patterns = await db.select().from(orgBlockedPatterns).where(eq(orgBlockedPatterns.organization_id, context.organizationId));
  if (params.serverId) patterns = patterns.filter((p) => p.server_id === params.serverId || p.server_id === null);
  if (params.category) patterns = patterns.filter((p) => p.category === params.category);
  return { success: true, patterns: patterns.map((p) => ({ id: p.id, patternType: p.pattern_type, pattern: p.pattern, category: p.category, action: p.action, severity: p.severity, enabled: p.enabled, matchCount: p.match_count, serverId: p.server_id })) };
}

async function handleDeleteBlockedPattern(params: z.infer<typeof DeleteBlockedPatternSchema>, _context: MCPContext) {
  await db.delete(orgBlockedPatterns).where(eq(orgBlockedPatterns.id, params.patternId));
  return { success: true };
}

async function handleGetSettingsLink(params: z.infer<typeof GetSettingsLinkSchema>, context: MCPContext) {
  return { success: true, settingsLink: communityModerationService.getSettingsLink(context.organizationId, params.section) };
}

async function handleVerifyWallet(params: z.infer<typeof VerifyWalletSchema>, _context: MCPContext) {
  const result = await walletVerificationService.verifyAndLinkWallet(params.serverId, params.platformUserId, params.platform, params.walletAddress, params.signature, params.chain);
  if (!result.verified) return { success: false, error: result.error };
  return { success: true, wallet: { address: result.walletAddress, chain: result.chain, verified: true } };
}

async function handleCheckTokenBalance(params: z.infer<typeof CheckTokenBalanceSchema>, _context: MCPContext) {
  const result = await walletVerificationService.checkTokenBalance(params.walletAddress, params.tokenAddress, params.chain, "token");
  return { success: true, walletAddress: params.walletAddress, chain: params.chain, tokenAddress: params.tokenAddress, hasBalance: result.hasBalance, balance: result.balance };
}

function handleGetVerificationChallenge(params: z.infer<typeof GetVerificationChallengeSchema>, _context: MCPContext) {
  const challenge = walletVerificationService.generateChallenge(params.serverId, params.platformUserId, params.platform);
  return { success: true, challenge: { nonce: challenge.nonce, message: challenge.message, expiresAt: challenge.expiresAt.toISOString() } };
}

async function handleSyncUserRoles(params: z.infer<typeof SyncUserRolesSchema>, _context: MCPContext) {
  const result = await walletVerificationService.syncRoles(params.serverId, params.platformUserId, params.platform, params.connectionId, params.guildId);
  return { success: true, rolesAdded: result.added, rolesRemoved: result.removed };
}

async function handleListUserWallets(params: z.infer<typeof ListUserWalletsSchema>, _context: MCPContext) {
  const wallets = await memberWalletsRepository.findByPlatformUser(params.serverId, params.platformUserId, params.platform);
  return { success: true, wallets: wallets.map((w) => ({ id: w.id, address: w.wallet_address, chain: w.chain, isPrimary: w.is_primary, verifiedAt: w.verified_at?.toISOString(), assignedRoles: w.assigned_roles })), total: wallets.length };
}

export const communityModerationTools: MCPToolDefinition[] = [
  { name: "check_message", description: "Check message for spam/scam/malicious links", inputSchema: CheckMessageSchema, handler: handleCheckMessage as MCPToolDefinition["handler"] },
  { name: "execute_moderation", description: "Execute moderation action on user", inputSchema: ExecuteModerationSchema, handler: handleExecuteModeration as MCPToolDefinition["handler"] },
  { name: "get_moderation_history", description: "Get recent moderation events", inputSchema: GetModerationHistorySchema, handler: handleGetModerationHistory as MCPToolDefinition["handler"] },
  { name: "get_user_violations", description: "Get user violation history", inputSchema: GetUserViolationsSchema, handler: handleGetUserViolations as MCPToolDefinition["handler"] },
  { name: "resolve_moderation_event", description: "Resolve a moderation event", inputSchema: ResolveEventSchema, handler: handleResolveEvent as MCPToolDefinition["handler"] },
  { name: "create_token_gate", description: "Create token gate rule", inputSchema: CreateTokenGateSchema, handler: handleCreateTokenGate as MCPToolDefinition["handler"] },
  { name: "list_token_gates", description: "List token gate rules", inputSchema: ListTokenGatesSchema, handler: handleListTokenGates as MCPToolDefinition["handler"] },
  { name: "update_token_gate", description: "Update token gate", inputSchema: UpdateTokenGateSchema, handler: handleUpdateTokenGate as MCPToolDefinition["handler"] },
  { name: "delete_token_gate", description: "Delete token gate", inputSchema: DeleteTokenGateSchema, handler: handleDeleteTokenGate as MCPToolDefinition["handler"] },
  { name: "create_blocked_pattern", description: "Create blocked pattern", inputSchema: CreateBlockedPatternSchema, handler: handleCreateBlockedPattern as MCPToolDefinition["handler"] },
  { name: "list_blocked_patterns", description: "List blocked patterns", inputSchema: ListBlockedPatternsSchema, handler: handleListBlockedPatterns as MCPToolDefinition["handler"] },
  { name: "delete_blocked_pattern", description: "Delete blocked pattern", inputSchema: DeleteBlockedPatternSchema, handler: handleDeleteBlockedPattern as MCPToolDefinition["handler"] },
  { name: "get_moderation_settings_link", description: "Get settings UI link", inputSchema: GetSettingsLinkSchema, handler: handleGetSettingsLink as MCPToolDefinition["handler"] },
  { name: "verify_wallet", description: "Verify wallet ownership via signature and link to user. Requires prior challenge from get_verification_challenge.", inputSchema: VerifyWalletSchema, handler: handleVerifyWallet as MCPToolDefinition["handler"] },
  { name: "check_token_balance", description: "Check wallet token balance", inputSchema: CheckTokenBalanceSchema, handler: handleCheckTokenBalance as MCPToolDefinition["handler"] },
  { name: "get_verification_challenge", description: "Generate wallet verification challenge", inputSchema: GetVerificationChallengeSchema, handler: handleGetVerificationChallenge as MCPToolDefinition["handler"] },
  { name: "sync_user_roles", description: "Sync roles based on token gates", inputSchema: SyncUserRolesSchema, handler: handleSyncUserRoles as MCPToolDefinition["handler"] },
  { name: "list_user_wallets", description: "List user's verified wallets", inputSchema: ListUserWalletsSchema, handler: handleListUserWallets as MCPToolDefinition["handler"] },
];
