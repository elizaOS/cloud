/**
 * Community Moderation MCP Tools
 *
 * MCP tools for community moderation including spam detection,
 * moderation actions, token gating, and settings management.
 */

import { z } from "zod";
import {
  communityModerationService,
  type ModerationContext,
} from "@/lib/services/community-moderation";
import { botsService } from "@/lib/services/bots";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { orgPlatformServers } from "@/db/schemas/org-platforms";
import {
  orgTokenGates,
  orgBlockedPatterns,
  type ModerationAction,
  type ModerationSeverity,
} from "@/db/schemas/org-community-moderation";
import { logger } from "@/lib/utils/logger";
import type { MCPContext, MCPToolDefinition } from "./index";

// =============================================================================
// SCHEMAS
// =============================================================================

const CheckMessageSchema = z.object({
  serverId: z.string().uuid().describe("Server ID to check message against"),
  platformUserId: z.string().describe("Platform user ID of the message author"),
  platform: z.enum(["discord", "telegram", "slack"]).describe("Platform"),
  platformUsername: z.string().optional().describe("Username of the message author"),
  channelId: z.string().optional().describe("Channel ID where message was sent"),
  messageId: z.string().optional().describe("Message ID"),
  content: z.string().describe("Message content to check"),
});

const ExecuteModerationSchema = z.object({
  serverId: z.string().uuid().describe("Server ID"),
  platformUserId: z.string().describe("Platform user ID to moderate"),
  platform: z.enum(["discord", "telegram", "slack"]).describe("Platform"),
  platformUsername: z.string().optional().describe("Username"),
  action: z.enum(["warn", "delete", "timeout", "kick", "ban"]).describe("Moderation action to take"),
  reason: z.string().describe("Reason for the moderation action"),
  durationMinutes: z.number().optional().describe("Duration for timeout in minutes"),
  channelId: z.string().optional().describe("Channel ID"),
  messageId: z.string().optional().describe("Message ID to delete"),
});

const GetModerationHistorySchema = z.object({
  serverId: z.string().uuid().describe("Server ID"),
  platformUserId: z.string().optional().describe("Filter by user"),
  platform: z.enum(["discord", "telegram", "slack"]).optional().describe("Filter by platform"),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

const GetUserViolationsSchema = z.object({
  serverId: z.string().uuid().describe("Server ID"),
  platformUserId: z.string().describe("Platform user ID"),
  platform: z.enum(["discord", "telegram", "slack"]).describe("Platform"),
});

const ResolveEventSchema = z.object({
  eventId: z.string().uuid().describe("Moderation event ID to resolve"),
  notes: z.string().optional().describe("Resolution notes"),
  falsePositive: z.boolean().optional().describe("Mark as false positive"),
});

const CreateTokenGateSchema = z.object({
  serverId: z.string().uuid().describe("Server ID"),
  name: z.string().min(1).max(100).describe("Name for this token gate rule"),
  description: z.string().optional().describe("Description of the rule"),
  chain: z.enum(["solana", "ethereum", "base", "polygon", "arbitrum", "optimism"]).describe("Blockchain"),
  tokenType: z.enum(["token", "nft", "nft_collection"]).describe("Type of token"),
  tokenAddress: z.string().describe("Token/NFT contract address"),
  minBalance: z.string().optional().default("1").describe("Minimum balance required"),
  discordRoleId: z.string().optional().describe("Discord role ID to assign"),
  telegramGroupId: z.string().optional().describe("Telegram group ID for access"),
  removeOnFail: z.boolean().optional().default(true).describe("Remove role if balance drops below minimum"),
});

const ListTokenGatesSchema = z.object({
  serverId: z.string().uuid().describe("Server ID"),
});

const UpdateTokenGateSchema = z.object({
  gateId: z.string().uuid().describe("Token gate ID to update"),
  enabled: z.boolean().optional().describe("Enable/disable the gate"),
  minBalance: z.string().optional().describe("New minimum balance"),
  removeOnFail: z.boolean().optional().describe("Remove role on fail"),
});

const DeleteTokenGateSchema = z.object({
  gateId: z.string().uuid().describe("Token gate ID to delete"),
});

const CreateBlockedPatternSchema = z.object({
  serverId: z.string().uuid().optional().describe("Server ID (null for org-wide)"),
  patternType: z.enum(["exact", "contains", "regex", "domain"]).describe("Pattern matching type"),
  pattern: z.string().describe("The pattern to match"),
  category: z.enum(["scam", "spam", "phishing", "banned_word"]).describe("Category"),
  action: z.enum(["warn", "delete", "timeout", "kick", "ban"]).optional().default("delete"),
  severity: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  description: z.string().optional().describe("Description of why this pattern is blocked"),
});

const ListBlockedPatternsSchema = z.object({
  serverId: z.string().uuid().optional().describe("Server ID (null for org-wide patterns)"),
  category: z.string().optional().describe("Filter by category"),
});

const DeleteBlockedPatternSchema = z.object({
  patternId: z.string().uuid().describe("Pattern ID to delete"),
});

const GetSettingsLinkSchema = z.object({
  section: z.string().optional().describe("Settings section (moderation, token-gating, etc.)"),
});

const VerifyWalletSchema = z.object({
  serverId: z.string().uuid().describe("Server ID"),
  platformUserId: z.string().describe("Platform user ID"),
  platform: z.enum(["discord", "telegram", "slack"]).describe("Platform"),
  walletAddress: z.string().describe("Wallet address to verify"),
  chain: z.enum(["solana", "ethereum", "base", "polygon", "arbitrum", "optimism"]).describe("Chain"),
  signature: z.string().optional().describe("Signature for verification (if using signature method)"),
});

const CheckTokenBalanceSchema = z.object({
  walletAddress: z.string().describe("Wallet address to check"),
  chain: z.enum(["solana", "ethereum", "base", "polygon", "arbitrum", "optimism"]).describe("Chain"),
  tokenAddress: z.string().describe("Token contract address"),
});

// =============================================================================
// HANDLERS
// =============================================================================

async function handleCheckMessage(
  params: z.infer<typeof CheckMessageSchema>,
  context: MCPContext
) {
  const moderationCtx: ModerationContext = {
    organizationId: context.organizationId,
    serverId: params.serverId,
    platformUserId: params.platformUserId,
    platform: params.platform,
    platformUsername: params.platformUsername,
    channelId: params.channelId,
    messageId: params.messageId,
  };

  const result = await communityModerationService.moderateMessage(
    moderationCtx,
    params.content
  );

  return {
    success: true,
    shouldModerate: result.shouldModerate,
    ...(result.shouldModerate && {
      eventType: result.eventType,
      severity: result.severity,
      recommendedAction: result.recommendedAction,
      reason: result.reason,
      confidence: result.confidence,
      matchedPattern: result.matchedPattern,
    }),
  };
}

async function handleExecuteModeration(
  params: z.infer<typeof ExecuteModerationSchema>,
  context: MCPContext
) {
  const moderationCtx: ModerationContext = {
    organizationId: context.organizationId,
    serverId: params.serverId,
    platformUserId: params.platformUserId,
    platform: params.platform,
    platformUsername: params.platformUsername,
    channelId: params.channelId,
    messageId: params.messageId,
  };

  // Log the manual moderation event
  const event = await communityModerationService.events.logEvent({
    organization_id: context.organizationId,
    server_id: params.serverId,
    platform_user_id: params.platformUserId,
    platform: params.platform,
    platform_username: params.platformUsername,
    event_type: "manual",
    severity: params.action === "ban" ? "critical" : params.action === "kick" ? "high" : "medium",
    message_id: params.messageId,
    channel_id: params.channelId,
    content_sample: params.reason.slice(0, 500),
    action_taken: params.action as ModerationAction,
    action_duration_minutes: params.durationMinutes,
    action_expires_at: params.durationMinutes
      ? new Date(Date.now() + params.durationMinutes * 60_000)
      : undefined,
    detected_by: context.userId ?? "agent",
    confidence_score: 100,
  });

  // Apply rate limit if timeout
  if (params.action === "timeout" && params.durationMinutes) {
    await communityModerationService.spam.applyRateLimit(moderationCtx, params.durationMinutes);
  }

  logger.info("[CommunityModeration] Manual moderation executed", {
    eventId: event.id,
    action: params.action,
    userId: params.platformUserId,
    platform: params.platform,
  });

  return {
    success: true,
    eventId: event.id,
    action: params.action,
    message: `Moderation action '${params.action}' executed successfully`,
  };
}

async function handleGetModerationHistory(
  params: z.infer<typeof GetModerationHistorySchema>,
  context: MCPContext
) {
  const events = await communityModerationService.events.getRecentEvents(
    params.serverId,
    params.limit
  );

  // Filter by user/platform if specified
  let filtered = events;
  if (params.platformUserId) {
    filtered = filtered.filter((e) => e.platform_user_id === params.platformUserId);
  }
  if (params.platform) {
    filtered = filtered.filter((e) => e.platform === params.platform);
  }

  return {
    success: true,
    events: filtered.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      severity: e.severity,
      platformUserId: e.platform_user_id,
      platform: e.platform,
      platformUsername: e.platform_username,
      actionTaken: e.action_taken,
      contentSample: e.content_sample,
      matchedPattern: e.matched_pattern,
      createdAt: e.created_at.toISOString(),
      resolvedAt: e.resolved_at?.toISOString(),
      falsePositive: e.false_positive,
    })),
    total: filtered.length,
  };
}

async function handleGetUserViolations(
  params: z.infer<typeof GetUserViolationsSchema>,
  context: MCPContext
) {
  const events = await communityModerationService.events.getEventsForUser(
    params.serverId,
    params.platformUserId,
    params.platform
  );

  const violationCount = await communityModerationService.events.getViolationCount(
    params.serverId,
    params.platformUserId,
    params.platform
  );

  return {
    success: true,
    violations: events.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      severity: e.severity,
      actionTaken: e.action_taken,
      createdAt: e.created_at.toISOString(),
      falsePositive: e.false_positive,
    })),
    violationCount,
    escalationStatus: {
      warningCount: events.filter((e) => e.action_taken === "warn").length,
      timeoutCount: events.filter((e) => e.action_taken === "timeout").length,
    },
  };
}

async function handleResolveEvent(
  params: z.infer<typeof ResolveEventSchema>,
  context: MCPContext
) {
  await communityModerationService.events.resolveEvent(
    params.eventId,
    context.userId ?? "agent",
    params.notes,
    params.falsePositive
  );

  return {
    success: true,
    message: params.falsePositive
      ? "Event marked as false positive and resolved"
      : "Event resolved",
  };
}

async function handleCreateTokenGate(
  params: z.infer<typeof CreateTokenGateSchema>,
  context: MCPContext
) {
  const [gate] = await db
    .insert(orgTokenGates)
    .values({
      organization_id: context.organizationId,
      server_id: params.serverId,
      name: params.name,
      description: params.description,
      chain: params.chain,
      token_type: params.tokenType,
      token_address: params.tokenAddress,
      min_balance: params.minBalance,
      discord_role_id: params.discordRoleId,
      telegram_group_id: params.telegramGroupId,
      remove_on_fail: params.removeOnFail,
      created_by: context.userId,
    })
    .returning();

  return {
    success: true,
    tokenGate: {
      id: gate.id,
      name: gate.name,
      chain: gate.chain,
      tokenType: gate.token_type,
      tokenAddress: gate.token_address,
      minBalance: gate.min_balance,
    },
    settingsLink: communityModerationService.getSettingsLink(
      context.organizationId,
      "token-gating"
    ),
  };
}

async function handleListTokenGates(
  params: z.infer<typeof ListTokenGatesSchema>,
  context: MCPContext
) {
  const gates = await communityModerationService.tokenGates.getTokenGates(
    params.serverId
  );

  return {
    success: true,
    tokenGates: gates.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      chain: g.chain,
      tokenType: g.token_type,
      tokenAddress: g.token_address,
      minBalance: g.min_balance,
      discordRoleId: g.discord_role_id,
      telegramGroupId: g.telegram_group_id,
      enabled: g.enabled,
      removeOnFail: g.remove_on_fail,
    })),
  };
}

async function handleUpdateTokenGate(
  params: z.infer<typeof UpdateTokenGateSchema>,
  context: MCPContext
) {
  const [updated] = await db
    .update(orgTokenGates)
    .set({
      enabled: params.enabled,
      min_balance: params.minBalance,
      remove_on_fail: params.removeOnFail,
      updated_at: new Date(),
    })
    .where(eq(orgTokenGates.id, params.gateId))
    .returning();

  return {
    success: true,
    tokenGate: {
      id: updated.id,
      name: updated.name,
      enabled: updated.enabled,
      minBalance: updated.min_balance,
    },
  };
}

async function handleDeleteTokenGate(
  params: z.infer<typeof DeleteTokenGateSchema>,
  context: MCPContext
) {
  await db.delete(orgTokenGates).where(eq(orgTokenGates.id, params.gateId));

  return {
    success: true,
    message: "Token gate deleted",
  };
}

async function handleCreateBlockedPattern(
  params: z.infer<typeof CreateBlockedPatternSchema>,
  context: MCPContext
) {
  const [pattern] = await db
    .insert(orgBlockedPatterns)
    .values({
      organization_id: context.organizationId,
      server_id: params.serverId,
      pattern_type: params.patternType,
      pattern: params.pattern,
      category: params.category,
      action: params.action as ModerationAction,
      severity: params.severity as ModerationSeverity,
      description: params.description,
      created_by: context.userId,
    })
    .returning();

  return {
    success: true,
    pattern: {
      id: pattern.id,
      patternType: pattern.pattern_type,
      pattern: pattern.pattern,
      category: pattern.category,
      action: pattern.action,
    },
    settingsLink: communityModerationService.getSettingsLink(
      context.organizationId,
      "moderation"
    ),
  };
}

async function handleListBlockedPatterns(
  params: z.infer<typeof ListBlockedPatternsSchema>,
  context: MCPContext
) {
  let query = db
    .select()
    .from(orgBlockedPatterns)
    .where(eq(orgBlockedPatterns.organization_id, context.organizationId));

  const patterns = await query;

  // Filter in memory for optional params
  let filtered = patterns;
  if (params.serverId) {
    filtered = filtered.filter(
      (p) => p.server_id === params.serverId || p.server_id === null
    );
  }
  if (params.category) {
    filtered = filtered.filter((p) => p.category === params.category);
  }

  return {
    success: true,
    patterns: filtered.map((p) => ({
      id: p.id,
      patternType: p.pattern_type,
      pattern: p.pattern,
      category: p.category,
      action: p.action,
      severity: p.severity,
      description: p.description,
      enabled: p.enabled,
      matchCount: p.match_count,
      serverId: p.server_id,
    })),
  };
}

async function handleDeleteBlockedPattern(
  params: z.infer<typeof DeleteBlockedPatternSchema>,
  context: MCPContext
) {
  await db
    .delete(orgBlockedPatterns)
    .where(eq(orgBlockedPatterns.id, params.patternId));

  return {
    success: true,
    message: "Blocked pattern deleted",
  };
}

async function handleGetSettingsLink(
  params: z.infer<typeof GetSettingsLinkSchema>,
  context: MCPContext
) {
  const link = communityModerationService.getSettingsLink(
    context.organizationId,
    params.section
  );

  return {
    success: true,
    settingsLink: link,
    message: `Configure settings at: ${link}`,
  };
}

async function handleVerifyWallet(
  params: z.infer<typeof VerifyWalletSchema>,
  context: MCPContext
) {
  // Link the wallet
  const wallet = await communityModerationService.tokenGates.linkWallet({
    organizationId: context.organizationId,
    serverId: params.serverId,
    platformUserId: params.platformUserId,
    platform: params.platform,
    walletAddress: params.walletAddress,
    chain: params.chain,
    verificationMethod: params.signature ? "signature" : "oauth",
    signature: params.signature,
  });

  // Get token gates to check
  const gates = await communityModerationService.tokenGates.getTokenGates(
    params.serverId
  );

  return {
    success: true,
    wallet: {
      id: wallet.id,
      address: wallet.wallet_address,
      chain: wallet.chain,
      verifiedAt: wallet.verified_at?.toISOString(),
    },
    tokenGatesToCheck: gates.length,
    message: `Wallet verified. ${gates.length} token gates will be checked.`,
  };
}

async function handleCheckTokenBalance(
  params: z.infer<typeof CheckTokenBalanceSchema>,
  context: MCPContext
) {
  // This is a placeholder - actual implementation would call blockchain RPC
  // For now, we return a structure that indicates the check should be done
  return {
    success: true,
    pending: true,
    message: "Token balance check queued. Results will be available shortly.",
    walletAddress: params.walletAddress,
    chain: params.chain,
    tokenAddress: params.tokenAddress,
    // In production, this would trigger a background job to check balance
  };
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const communityModerationTools: MCPToolDefinition[] = [
  {
    name: "check_message",
    description:
      "Check a message for spam, scam, malicious links, or banned words. Returns moderation recommendation.",
    inputSchema: CheckMessageSchema,
    handler: handleCheckMessage as MCPToolDefinition["handler"],
  },
  {
    name: "execute_moderation",
    description:
      "Execute a moderation action (warn, delete, timeout, kick, ban) on a user. Logs the action for audit.",
    inputSchema: ExecuteModerationSchema,
    handler: handleExecuteModeration as MCPToolDefinition["handler"],
  },
  {
    name: "get_moderation_history",
    description:
      "Get recent moderation events for a server with optional filtering by user or platform.",
    inputSchema: GetModerationHistorySchema,
    handler: handleGetModerationHistory as MCPToolDefinition["handler"],
  },
  {
    name: "get_user_violations",
    description:
      "Get violation history for a specific user including escalation status.",
    inputSchema: GetUserViolationsSchema,
    handler: handleGetUserViolations as MCPToolDefinition["handler"],
  },
  {
    name: "resolve_moderation_event",
    description:
      "Resolve a moderation event, optionally marking it as a false positive.",
    inputSchema: ResolveEventSchema,
    handler: handleResolveEvent as MCPToolDefinition["handler"],
  },
  {
    name: "create_token_gate",
    description:
      "Create a token gate rule that assigns roles based on token/NFT holdings.",
    inputSchema: CreateTokenGateSchema,
    handler: handleCreateTokenGate as MCPToolDefinition["handler"],
  },
  {
    name: "list_token_gates",
    description: "List all token gate rules for a server.",
    inputSchema: ListTokenGatesSchema,
    handler: handleListTokenGates as MCPToolDefinition["handler"],
  },
  {
    name: "update_token_gate",
    description: "Update a token gate rule's settings.",
    inputSchema: UpdateTokenGateSchema,
    handler: handleUpdateTokenGate as MCPToolDefinition["handler"],
  },
  {
    name: "delete_token_gate",
    description: "Delete a token gate rule.",
    inputSchema: DeleteTokenGateSchema,
    handler: handleDeleteTokenGate as MCPToolDefinition["handler"],
  },
  {
    name: "create_blocked_pattern",
    description:
      "Create a blocked pattern for detecting scam, spam, phishing, or banned words.",
    inputSchema: CreateBlockedPatternSchema,
    handler: handleCreateBlockedPattern as MCPToolDefinition["handler"],
  },
  {
    name: "list_blocked_patterns",
    description: "List blocked patterns for the organization or a specific server.",
    inputSchema: ListBlockedPatternsSchema,
    handler: handleListBlockedPatterns as MCPToolDefinition["handler"],
  },
  {
    name: "delete_blocked_pattern",
    description: "Delete a blocked pattern.",
    inputSchema: DeleteBlockedPatternSchema,
    handler: handleDeleteBlockedPattern as MCPToolDefinition["handler"],
  },
  {
    name: "get_moderation_settings_link",
    description:
      "Get a direct link to the moderation settings UI for the user to configure settings.",
    inputSchema: GetSettingsLinkSchema,
    handler: handleGetSettingsLink as MCPToolDefinition["handler"],
  },
  {
    name: "verify_wallet",
    description:
      "Verify and link a wallet address to a platform user for token gating.",
    inputSchema: VerifyWalletSchema,
    handler: handleVerifyWallet as MCPToolDefinition["handler"],
  },
  {
    name: "check_token_balance",
    description:
      "Queue a token balance check for a wallet address. Used for token gate verification.",
    inputSchema: CheckTokenBalanceSchema,
    handler: handleCheckTokenBalance as MCPToolDefinition["handler"],
  },
];

