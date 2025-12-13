/**
 * Slack Community Moderation Handler
 */

import { getServerSettings, pickMostSevereViolation, checkSpamViolation, checkLinksViolation, checkBadWordsViolation, type ModerationContext } from "../community-moderation";
import { moderationEventsRepository } from "@/db/repositories/community-moderation";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";

interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  channel: string;
  team?: string;
  bot_id?: string;
}

interface ModerationResult {
  handled: boolean;
  action?: string;
  shouldDelete?: boolean;
  reason?: string;
}

export class SlackModerationHandler {
  private static instance: SlackModerationHandler;
  private constructor() {}

  static getInstance(): SlackModerationHandler {
    return SlackModerationHandler.instance ??= new SlackModerationHandler();
  }

  async handleMessage(connectionId: string, message: SlackMessage): Promise<ModerationResult> {
    if (message.bot_id) return { handled: false };

    const serverData = await getServerSettings(connectionId, message.team ?? message.channel);
    if (!serverData) return { handled: false };

    const { serverId, organizationId, settings } = serverData;

    const ctx: ModerationContext = { organizationId, serverId, platformUserId: message.user, platform: "slack" };
    const results = await Promise.all([
      settings.antiSpamEnabled ? checkSpamViolation(ctx, message.text, settings) : null,
      settings.linkCheckingEnabled ? checkLinksViolation(message.text, settings) : null,
      settings.badWordFilterEnabled ? checkBadWordsViolation(message.text, settings) : null,
    ]);

    const action = pickMostSevereViolation(results);

    if (action.shouldAct) {
      await this.logModerationEvent(serverId, organizationId, message, action);
      return { handled: true, action: action.type, shouldDelete: true, reason: action.type };
    }

    return { handled: false };
  }

  private async logModerationEvent(serverId: string, organizationId: string, message: SlackMessage, action: { type: string; severity: number }): Promise<void> {
    await moderationEventsRepository.create({
      organization_id: organizationId,
      server_id: serverId,
      platform: "slack",
      platform_user_id: message.user,
      event_type: action.type === "spam" ? "spam" : action.type === "bad_word" ? "banned_word" : "malicious_link",
      severity: action.severity >= 4 ? "high" : action.severity >= 2 ? "medium" : "low",
      message_id: message.ts,
      channel_id: message.channel,
      content_sample: message.text.slice(0, 500),
      action_taken: "delete",
      detected_by: "auto",
      confidence_score: 90,
    });
  }
}

export const slackModerationHandler = SlackModerationHandler.getInstance();
