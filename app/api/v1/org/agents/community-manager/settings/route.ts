/**
 * Community Manager Settings API
 *
 * GET  /api/v1/org/agents/community-manager/settings - Get settings
 * PUT  /api/v1/org/agents/community-manager/settings - Update settings
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { agentLifecycleService } from "@/lib/services/agent-lifecycle";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { orgAgentConfigs } from "@/db/schemas/org-agents";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";
import { logger } from "@/lib/utils/logger";

const UpdateSettingsSchema = z.object({
  serverId: z.string().uuid().optional(),
  settings: z.object({
    // Welcome
    greetNewMembers: z.boolean().optional(),
    greetingMessage: z.string().optional(),
    greetingChannelId: z.string().optional(),
    welcomeRoleId: z.string().optional(),

    // Anti-spam
    antiSpamEnabled: z.boolean().optional(),
    maxMessagesPerMinute: z.number().optional(),
    duplicateMessageThreshold: z.number().optional(),
    spamAction: z.enum(["warn", "delete", "timeout"]).optional(),
    spamTimeoutMinutes: z.number().optional(),

    // Anti-scam
    antiScamEnabled: z.boolean().optional(),
    blockKnownScamLinks: z.boolean().optional(),
    blockSuspiciousDomains: z.boolean().optional(),
    scamAction: z.enum(["warn", "delete", "timeout", "ban"]).optional(),

    // Link checking
    linkCheckingEnabled: z.boolean().optional(),
    allowedDomains: z.array(z.string()).optional(),
    blockedDomains: z.array(z.string()).optional(),
    checkLinksWithSafeBrowsing: z.boolean().optional(),
    linkAction: z.enum(["warn", "delete"]).optional(),

    // Word filtering
    badWordFilterEnabled: z.boolean().optional(),
    banWords: z.array(z.string()).optional(),
    filterAction: z.enum(["delete", "warn", "timeout"]).optional(),

    // Raid protection
    raidProtectionEnabled: z.boolean().optional(),
    joinRateLimitPerMinute: z.number().optional(),
    autoLockdownThreshold: z.number().optional(),
    lockdownDurationMinutes: z.number().optional(),

    // Content moderation
    contentModerationEnabled: z.boolean().optional(),
    moderateNsfw: z.boolean().optional(),
    moderateHarassment: z.boolean().optional(),

    // Escalation
    escalationEnabled: z.boolean().optional(),
    warnAfterViolations: z.number().optional(),
    timeoutAfterViolations: z.number().optional(),
    banAfterViolations: z.number().optional(),
    defaultTimeoutMinutes: z.number().optional(),

    // Token gating
    tokenGatingEnabled: z.boolean().optional(),
    verificationChannelId: z.string().optional(),
    verifiedRoleId: z.string().optional(),
    unverifiedRoleId: z.string().optional(),
    verificationMessage: z.string().optional(),

    // Logging
    logChannelId: z.string().optional(),
    logModerationActions: z.boolean().optional(),
    logMemberJoins: z.boolean().optional(),
    logMemberLeaves: z.boolean().optional(),
  }),
});

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const instance = await agentLifecycleService.getInstance(
    user.organization_id,
    "community-manager"
  );

  if (!instance) {
    return NextResponse.json({
      settings: {} as CommunityModerationSettings,
    });
  }

  const config = await agentLifecycleService.getConfig(instance.id);

  return NextResponse.json({
    settings: (config?.community_settings as CommunityModerationSettings) ?? {},
  });
}

export async function PUT(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const parsed = UpdateSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { settings } = parsed.data;

  // Get or create instance
  let instance = await agentLifecycleService.getInstance(
    user.organization_id,
    "community-manager"
  );

  if (!instance) {
    instance = await agentLifecycleService.createInstance({
      organizationId: user.organization_id,
      agentType: "community-manager",
      createdBy: user.id,
      enabledPlatforms: [],
    });
  }

  // Get existing config
  const existingConfig = await agentLifecycleService.getConfig(instance.id);
  const existingSettings = (existingConfig?.community_settings as CommunityModerationSettings) ?? {};

  // Merge settings
  const mergedSettings: CommunityModerationSettings = {
    ...existingSettings,
    ...settings,
  };

  // Update config
  if (existingConfig) {
    await db
      .update(orgAgentConfigs)
      .set({
        community_settings: mergedSettings,
        updated_at: new Date(),
      })
      .where(eq(orgAgentConfigs.instance_id, instance.id));
  } else {
    await agentLifecycleService.createConfig(instance.id, {
      customSettings: { community_settings: mergedSettings },
    });
  }

  logger.info("[Community Manager] Settings updated", {
    organizationId: user.organization_id,
    instanceId: instance.id,
  });

  return NextResponse.json({
    success: true,
    settings: mergedSettings,
  });
}

