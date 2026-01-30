/**
 * OAUTH_GET Action
 *
 * Checks status of an OAuth connection.
 * Used to verify if OAuth completed (when user says "done").
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

function extractParams(message: Memory, state?: State): Record<string, unknown> {
  const content = message.content as Record<string, unknown>;
  return (
    content.actionParams ||
    content.actionInput ||
    state?.data?.actionParams ||
    state?.data?.oauthget ||
    {}
  ) as Record<string, unknown>;
}

export const oauthGetAction: ActionWithParams = {
  name: "OAUTH_GET",
  similes: [
    "CHECK_CONNECTION",
    "VERIFY_CONNECTION",
    "CONNECTION_STATUS",
    "IS_CONNECTED",
    "DONE",
    "FINISHED",
    "COMPLETED",
    "DID_IT_WORK",
    "CHECK_GOOGLE",
  ],
  description:
    "Check status of an OAuth connection. Use when user says 'done' after connecting, or asks about a specific platform's connection status.",

  parameters: {
    platform: {
      type: "string",
      description:
        "Platform to check: 'google'. If not specified, checks all connected platforms.",
      required: false,
    },
  },

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<boolean> => {
    if (!message.entityId) {
      logger.warn("[OAUTH_GET] No entityId in message");
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
      `[OAUTH_GET] Checking connection status for platform: ${platform || "all"}, entityId: ${message.entityId}`
    );

    const user = await usersRepository.findWithOrganization(message.entityId as string);

    if (!user) {
      logger.error(`[OAUTH_GET] User not found for entityId: ${message.entityId}`);
      return {
        text: "I couldn't find your account. Please try again or contact support.",
        success: false,
        error: "USER_NOT_FOUND",
        data: { actionName: "OAUTH_GET" },
      };
    }

    if (!user.organization_id) {
      logger.error(`[OAUTH_GET] User ${user.id} has no organization`);
      return {
        text: "Your account isn't set up correctly. Please contact support.",
        success: false,
        error: "NO_ORGANIZATION",
        data: { actionName: "OAUTH_GET" },
      };
    }

    const organizationId = user.organization_id;

    if (platform) {
      const isConnected = await oauthService.isPlatformConnected(organizationId, platform);

      if (isConnected) {
        const connections = await oauthService.listConnections({ organizationId, platform });
        const activeConnection = connections.find((c) => c.status === "active");
        const email = activeConnection?.email || "";
        const displayName = activeConnection?.displayName || "";
        const identifier = email || displayName || activeConnection?.username || "";

        const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
        const responseText = identifier
          ? `${platformName} connected successfully! Logged in as ${identifier}.`
          : `${platformName} connected successfully!`;

        logger.info(`[OAUTH_GET] Platform ${platform} is connected for org ${organizationId}`);

        if (callback) {
          await callback({
            text: responseText,
            actions: ["OAUTH_GET"],
          });
        }

        return {
          text: responseText,
          success: true,
          values: {
            platform,
            connected: true,
            email,
            displayName,
            connectionId: activeConnection?.id,
          },
          data: {
            actionName: "OAUTH_GET",
            platform,
            connected: true,
            connection: activeConnection,
          },
        };
      } else {
        const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
        const responseText = `${platformName} is not connected yet. Make sure you completed the authorization in your browser. Want me to send the link again?`;

        logger.info(`[OAUTH_GET] Platform ${platform} is NOT connected for org ${organizationId}`);

        if (callback) {
          await callback({
            text: responseText,
            actions: ["OAUTH_GET"],
          });
        }

        return {
          text: responseText,
          success: true,
          values: { platform, connected: false },
          data: { actionName: "OAUTH_GET", platform, connected: false },
        };
      }
    }

    const connections = await oauthService.listConnections({ organizationId });
    const activeConnections = connections.filter((c) => c.status === "active");

    if (activeConnections.length === 0) {
      const responseText =
        "You don't have any connected accounts yet. Say 'connect google' to get started.";

      if (callback) {
        await callback({
          text: responseText,
          actions: ["OAUTH_GET"],
        });
      }

      return {
        text: responseText,
        success: true,
        values: { connected: false, platforms: [] },
        data: { actionName: "OAUTH_GET", connections: [] },
      };
    }

    const platformList = activeConnections
      .map((c) => {
        const name = c.platform.charAt(0).toUpperCase() + c.platform.slice(1);
        const identifier = c.email || c.displayName || c.username || "";
        return identifier ? `${name} (${identifier})` : name;
      })
      .join(", ");

    const responseText = `Connected accounts: ${platformList}`;

    logger.info(`[OAUTH_GET] Found ${activeConnections.length} active connections for org ${organizationId}`);

    if (callback) {
      await callback({
        text: responseText,
        actions: ["OAUTH_GET"],
      });
    }

    return {
      text: responseText,
      success: true,
      values: {
        connected: true,
        platforms: activeConnections.map((c) => c.platform),
        count: activeConnections.length,
      },
      data: {
        actionName: "OAUTH_GET",
        connections: activeConnections,
      },
    };
  },

  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "done" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Google connected successfully! Logged in as user@gmail.com.",
          actions: ["OAUTH_GET"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "I finished connecting" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Google connected successfully! Logged in as user@gmail.com.",
          actions: ["OAUTH_GET"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "is my google connected?" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Google connected successfully! Logged in as user@gmail.com.",
          actions: ["OAUTH_GET"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "check connection status" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Connected accounts: Google (user@gmail.com)",
          actions: ["OAUTH_GET"],
        },
      },
    ],
  ] as ActionExample[][],
};
