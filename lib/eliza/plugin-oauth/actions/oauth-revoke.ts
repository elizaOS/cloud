/**
 * OAUTH_REVOKE Action
 *
 * Disconnects/revokes an OAuth connection.
 * Removes stored tokens and revokes access.
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
    state?.data?.oauthrevoke ||
    {}
  ) as Record<string, unknown>;
}

export const oauthRevokeAction: ActionWithParams = {
  name: "OAUTH_REVOKE",
  similes: [
    "DISCONNECT",
    "REMOVE_CONNECTION",
    "UNLINK",
    "REVOKE_ACCESS",
    "DELETE_CONNECTION",
    "DISCONNECT_GOOGLE",
    "REMOVE_GOOGLE",
    "UNLINK_ACCOUNT",
  ],
  description:
    "Disconnect an OAuth platform. Removes stored tokens and revokes access. Use when user wants to unlink or remove a connected account.",

  parameters: {
    platform: {
      type: "string",
      description: "Platform to disconnect: 'google'",
      required: true,
    },
  },

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<boolean> => {
    if (!message.entityId) {
      logger.warn("[OAUTH_REVOKE] No entityId in message");
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

    logger.info(
      `[OAUTH_REVOKE] Revoking connection for platform: ${platform}, entityId: ${message.entityId}`
    );

    if (!platform) {
      return {
        text: "Which platform do you want to disconnect? Currently available: Google",
        success: false,
        error: "MISSING_PLATFORM",
        values: { availablePlatforms: SUPPORTED_PLATFORMS },
        data: { actionName: "OAUTH_REVOKE" },
      };
    }

    if (!isSupportedPlatform(platform)) {
      return {
        text: `Platform '${platform}' is not recognized. Currently supported: ${SUPPORTED_PLATFORMS.join(", ")}`,
        success: false,
        error: "UNSUPPORTED_PLATFORM",
        values: { requestedPlatform: platform, availablePlatforms: SUPPORTED_PLATFORMS },
        data: { actionName: "OAUTH_REVOKE" },
      };
    }

    const user = await usersRepository.findWithOrganization(message.entityId as string);

    if (!user) {
      logger.error(`[OAUTH_REVOKE] User not found for entityId: ${message.entityId}`);
      return {
        text: "I couldn't find your account. Please try again or contact support.",
        success: false,
        error: "USER_NOT_FOUND",
        data: { actionName: "OAUTH_REVOKE" },
      };
    }

    if (!user.organization_id) {
      logger.error(`[OAUTH_REVOKE] User ${user.id} has no organization`);
      return {
        text: "Your account isn't set up correctly. Please contact support.",
        success: false,
        error: "NO_ORGANIZATION",
        data: { actionName: "OAUTH_REVOKE" },
      };
    }

    const organizationId = user.organization_id;

    const connections = await oauthService.listConnections({ organizationId, platform });
    const activeConnection = connections.find((c) => c.status === "active");

    if (!activeConnection) {
      const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
      const responseText = `${platformName} wasn't connected.`;

      if (callback) {
        await callback({
          text: responseText,
          actions: ["OAUTH_REVOKE"],
        });
      }

      return {
        text: responseText,
        success: true,
        values: { platform, wasConnected: false },
        data: { actionName: "OAUTH_REVOKE", platform, wasConnected: false },
      };
    }

    const email = activeConnection.email || activeConnection.username || "";

    await oauthService.revokeConnection({
      organizationId,
      connectionId: activeConnection.id,
    });

    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
    const responseText = email
      ? `${platformName} (${email}) has been disconnected.`
      : `${platformName} has been disconnected.`;

    logger.info(
      `[OAUTH_REVOKE] Revoked connection ${activeConnection.id} for platform ${platform}, org ${organizationId}`
    );

    if (callback) {
      await callback({
        text: responseText,
        actions: ["OAUTH_REVOKE"],
      });
    }

    return {
      text: responseText,
      success: true,
      values: {
        platform,
        wasConnected: true,
        revokedConnectionId: activeConnection.id,
        email,
      },
      data: {
        actionName: "OAUTH_REVOKE",
        platform,
        revokedConnection: {
          id: activeConnection.id,
          email: activeConnection.email,
          username: activeConnection.username,
        },
      },
    };
  },

  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "disconnect google" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Google (user@gmail.com) has been disconnected.",
          actions: ["OAUTH_REVOKE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "remove my gmail connection" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Google (user@gmail.com) has been disconnected.",
          actions: ["OAUTH_REVOKE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "unlink google" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Google has been disconnected.",
          actions: ["OAUTH_REVOKE"],
        },
      },
    ],
  ] as ActionExample[][],
};
