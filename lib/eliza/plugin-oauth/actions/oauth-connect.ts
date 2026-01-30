/**
 * OAUTH_CONNECT Action
 *
 * Initiates OAuth flow for a platform.
 * Returns authorization URL for user to complete OAuth.
 */

import {
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type ActionResult,
  logger,
} from "@elizaos/core";
import { usersRepository } from "@/db/repositories/users";
import { oauthService } from "@/lib/services/oauth";
import type { ActionWithParams } from "../../plugin-cloud-bootstrap/types";

const SUPPORTED_PLATFORMS = ["google"] as const;
type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

function isSupportedPlatform(platform: string): platform is SupportedPlatform {
  return SUPPORTED_PLATFORMS.includes(platform.toLowerCase() as SupportedPlatform);
}

function extractParams(message: Memory, state?: State): Record<string, unknown> {
  const content = message.content as Record<string, unknown>;
  return (
    content.actionParams ||
    content.actionInput ||
    state?.data?.actionParams ||
    state?.data?.oauthconnect ||
    {}
  ) as Record<string, unknown>;
}

export const oauthConnectAction: ActionWithParams = {
  name: "OAUTH_CONNECT",
  similes: [
    "CONNECT_PLATFORM",
    "LINK_ACCOUNT",
    "CONNECT_GOOGLE",
    "CONNECT_GMAIL",
    "ADD_INTEGRATION",
    "SETUP_CONNECTION",
    "LINK_GOOGLE",
    "AUTHENTICATE",
  ],
  description:
    "Connect an OAuth platform (Google) for the user. Returns an authorization URL. After user completes OAuth in browser, they should say 'done' to verify the connection.",

  parameters: {
    platform: {
      type: "string",
      description: "Platform to connect. Available: 'google'. Example: 'google'",
      required: true,
    },
  },

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<boolean> => {
    if (!message.entityId) {
      logger.warn("[OAUTH_CONNECT] No entityId in message");
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: unknown,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const params = extractParams(message, state);
    const platform = (params.platform as string)?.toLowerCase()?.trim();

    logger.info(`[OAUTH_CONNECT] Starting OAuth connect for platform: ${platform}, entityId: ${message.entityId}`);

    if (!platform) {
      return {
        text: "Which platform do you want to connect? Currently available: Google",
        success: false,
        error: "MISSING_PLATFORM",
        values: { availablePlatforms: SUPPORTED_PLATFORMS },
        data: { actionName: "OAUTH_CONNECT" },
      };
    }

    if (!isSupportedPlatform(platform)) {
      return {
        text: `Platform '${platform}' is not available yet. Currently supported: ${SUPPORTED_PLATFORMS.join(", ")}`,
        success: false,
        error: "UNSUPPORTED_PLATFORM",
        values: { requestedPlatform: platform, availablePlatforms: SUPPORTED_PLATFORMS },
        data: { actionName: "OAUTH_CONNECT" },
      };
    }

    const user = await usersRepository.findWithOrganization(message.entityId as string);

    if (!user) {
      logger.error(`[OAUTH_CONNECT] User not found for entityId: ${message.entityId}`);
      return {
        text: "I couldn't find your account. Please try again or contact support.",
        success: false,
        error: "USER_NOT_FOUND",
        data: { actionName: "OAUTH_CONNECT" },
      };
    }

    if (!user.organization_id) {
      logger.error(`[OAUTH_CONNECT] User ${user.id} has no organization`);
      return {
        text: "Your account isn't set up correctly. Please contact support.",
        success: false,
        error: "NO_ORGANIZATION",
        data: { actionName: "OAUTH_CONNECT" },
      };
    }

    const organizationId = user.organization_id;

    const isAlreadyConnected = await oauthService.isPlatformConnected(organizationId, platform);

    if (isAlreadyConnected) {
      const connections = await oauthService.listConnections({ organizationId, platform });
      const activeConnection = connections.find((c) => c.status === "active");
      const email = activeConnection?.email || activeConnection?.username || "";

      logger.info(`[OAUTH_CONNECT] Platform ${platform} already connected for org ${organizationId}`);

      return {
        text: `Your ${platform.charAt(0).toUpperCase() + platform.slice(1)} account is already connected${email ? ` (${email})` : ""}.`,
        success: true,
        values: { platform, alreadyConnected: true, email },
        data: { actionName: "OAUTH_CONNECT", platform, alreadyConnected: true },
      };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
    const redirectUrl = `${baseUrl}/auth/success`;

    const result = await oauthService.initiateAuth({
      organizationId,
      platform,
      redirectUrl,
    });

    if (!result.authUrl) {
      logger.error(`[OAUTH_CONNECT] Failed to generate auth URL for ${platform}`);
      return {
        text: `Failed to generate authorization link for ${platform}. Please try again.`,
        success: false,
        error: "AUTH_URL_GENERATION_FAILED",
        data: { actionName: "OAUTH_CONNECT", platform },
      };
    }

    logger.info(`[OAUTH_CONNECT] Generated auth URL for ${platform}, org ${organizationId}`);

    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
    const responseText = `Connect ${platformName}: ${result.authUrl}\n\nWhen you've finished authorizing, come back and say "done" and I'll verify the connection.`;

    if (callback) {
      await callback({
        text: responseText,
        actions: ["OAUTH_CONNECT"],
      });
    }

    return {
      text: responseText,
      success: true,
      values: {
        platform,
        authUrl: result.authUrl,
        state: result.state,
        pendingVerification: true,
      },
      data: {
        actionName: "OAUTH_CONNECT",
        platform,
        authUrl: result.authUrl,
        organizationId,
      },
    };
  },

  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "connect my google account" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Connect Google: https://accounts.google.com/...\n\nWhen you've finished authorizing, come back and say \"done\" and I'll verify the connection.",
          actions: ["OAUTH_CONNECT"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "I want to link my Gmail" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Connect Google: https://accounts.google.com/...\n\nWhen you've finished authorizing, come back and say \"done\" and I'll verify the connection.",
          actions: ["OAUTH_CONNECT"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "connect google" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Connect Google: https://accounts.google.com/...\n\nWhen you've finished authorizing, come back and say \"done\" and I'll verify the connection.",
          actions: ["OAUTH_CONNECT"],
        },
      },
    ],
  ] as ActionExample[][],
};
