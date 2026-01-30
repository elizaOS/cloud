/**
 * OAUTH_LIST Action
 *
 * Lists all OAuth connections for the user.
 * Shows platform, status, and email/username.
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

export const oauthListAction: ActionWithParams = {
  name: "OAUTH_LIST",
  similes: [
    "LIST_CONNECTIONS",
    "SHOW_CONNECTIONS",
    "MY_ACCOUNTS",
    "CONNECTED_APPS",
    "WHAT_IS_CONNECTED",
    "MY_INTEGRATIONS",
    "SHOW_INTEGRATIONS",
  ],
  description:
    "List all OAuth connections for the user. Shows which platforms are connected and their status.",

  parameters: {},

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<boolean> => {
    if (!message.entityId) {
      logger.warn("[OAUTH_LIST] No entityId in message");
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
    logger.info(`[OAUTH_LIST] Listing connections for entityId: ${message.entityId}`);

    const user = await usersRepository.findWithOrganization(message.entityId as string);

    if (!user) {
      logger.error(`[OAUTH_LIST] User not found for entityId: ${message.entityId}`);
      return {
        text: "I couldn't find your account. Please try again or contact support.",
        success: false,
        error: "USER_NOT_FOUND",
        data: { actionName: "OAUTH_LIST" },
      };
    }

    if (!user.organization_id) {
      logger.error(`[OAUTH_LIST] User ${user.id} has no organization`);
      return {
        text: "Your account isn't set up correctly. Please contact support.",
        success: false,
        error: "NO_ORGANIZATION",
        data: { actionName: "OAUTH_LIST" },
      };
    }

    const organizationId = user.organization_id;
    const connections = await oauthService.listConnections({ organizationId });

    if (connections.length === 0) {
      const responseText =
        "You don't have any connected accounts yet. Say 'connect google' to get started.";

      if (callback) {
        await callback({
          text: responseText,
          actions: ["OAUTH_LIST"],
        });
      }

      return {
        text: responseText,
        success: true,
        values: { count: 0, platforms: [] },
        data: { actionName: "OAUTH_LIST", connections: [] },
      };
    }

    const connectionLines = connections.map((c) => {
      const platformName = c.platform.charAt(0).toUpperCase() + c.platform.slice(1);
      const identifier = c.email || c.displayName || c.username || "";
      const status = c.status === "active" ? "active" : c.status;

      if (identifier) {
        return `• ${platformName}: ${identifier} (${status})`;
      }
      return `• ${platformName}: ${status}`;
    });

    const activeCount = connections.filter((c) => c.status === "active").length;
    const header =
      activeCount === connections.length
        ? "Your connected accounts:"
        : `Your connections (${activeCount} active):`;

    const responseText = `${header}\n${connectionLines.join("\n")}`;

    logger.info(`[OAUTH_LIST] Found ${connections.length} connections for org ${organizationId}`);

    if (callback) {
      await callback({
        text: responseText,
        actions: ["OAUTH_LIST"],
      });
    }

    return {
      text: responseText,
      success: true,
      values: {
        count: connections.length,
        activeCount,
        platforms: connections.map((c) => c.platform),
      },
      data: {
        actionName: "OAUTH_LIST",
        connections: connections.map((c) => ({
          id: c.id,
          platform: c.platform,
          email: c.email,
          username: c.username,
          displayName: c.displayName,
          status: c.status,
          linkedAt: c.linkedAt,
        })),
      },
    };
  },

  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "what accounts are connected?" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Your connected accounts:\n• Google: user@gmail.com (active)",
          actions: ["OAUTH_LIST"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "show my connections" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Your connected accounts:\n• Google: user@gmail.com (active)",
          actions: ["OAUTH_LIST"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "list my integrations" },
      },
      {
        name: "{{name2}}",
        content: {
          text: "You don't have any connected accounts yet. Say 'connect google' to get started.",
          actions: ["OAUTH_LIST"],
        },
      },
    ],
  ] as ActionExample[][],
};
