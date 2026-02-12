/**
 * OAUTH_CONNECT - Initiates OAuth flow for a platform.
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
import { oauthService } from "@/lib/services/oauth";
import type { ActionWithParams } from "../../plugin-cloud-bootstrap/types";
import {
  getSupportedPlatforms,
  isSupportedPlatform,
  extractPlatform,
  extractParams,
  lookupUser,
  isUserLookupError,
  capitalize,
} from "../utils";

export const oauthConnectAction: ActionWithParams = {
  name: "OAUTH_CONNECT",
  similes: [
    "CONNECT_PLATFORM", "LINK_ACCOUNT", "CONNECT_GOOGLE", "CONNECT_GMAIL",
    "CONNECT_LINEAR", "CONNECT_SLACK", "CONNECT_GITHUB", "CONNECT_NOTION",
    "CONNECT_MICROSOFT", "CONNECT_OUTLOOK", "CONNECT_BLUESKY", "CONNECT_BSKY",
    "ADD_INTEGRATION", "SETUP_CONNECTION", "LINK_GOOGLE", "AUTHENTICATE",
    "LINK_LINEAR", "LINK_SLACK", "LINK_GITHUB", "LINK_NOTION", "LINK_MICROSOFT",
    "LINK_OUTLOOK", "LINK_BLUESKY", "LINK_BSKY",
    "CONNECT_ASANA", "LINK_ASANA", "CONNECT_DROPBOX", "LINK_DROPBOX",
    "CONNECT_SALESFORCE", "LINK_SALESFORCE", "CONNECT_AIRTABLE", "LINK_AIRTABLE",
    "CONNECT_ZOOM", "LINK_ZOOM",
    "CONNECT_JIRA", "LINK_JIRA", "CONNECT_LINKEDIN", "LINK_LINKEDIN",
  ],
  description:
    "Connect an OAuth platform for the user. Returns an authorization URL. After user completes OAuth in browser, they should say 'done' to verify the connection. Available: google, linear, slack, github, notion, microsoft, bluesky, asana, dropbox, salesforce, airtable, zoom, jira, linkedin. For Bluesky, the user must provide their handle (e.g., alice.bsky.social).",

  parameters: {
    platform: {
      type: "string",
      description: "Platform to connect. Available: google, linear, slack, github, notion, microsoft, bluesky, asana, dropbox, salesforce, airtable, zoom, jira, linkedin",
      required: true,
    },
    handle: {
      type: "string",
      description: "User's handle on the platform. Required for Bluesky (e.g., alice.bsky.social).",
      required: false,
    },
  },

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    return !!message.entityId;
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: unknown,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const platform = extractPlatform(message, state);
    const actionName = "OAUTH_CONNECT";

    logger.info(`[${actionName}] platform=${platform}, entityId=${message.entityId}`);

    if (!platform) {
      const supported = getSupportedPlatforms();
      return {
        text: `Which platform do you want to connect? Currently available: ${supported.map(capitalize).join(", ") || "none configured"}`,
        success: false,
        error: "MISSING_PLATFORM",
        data: { actionName },
      };
    }

    if (!isSupportedPlatform(platform)) {
      const supported = getSupportedPlatforms();
      return {
        text: `Platform '${platform}' is not available. Supported: ${supported.length > 0 ? supported.join(", ") : "none configured"}`,
        success: false,
        error: "UNSUPPORTED_PLATFORM",
        data: { actionName },
      };
    }

    // Extract handle parameter (required for Bluesky)
    const params = extractParams(message, state);
    const handle = (params.handle as string)?.trim();

    if (platform === "bluesky" && !handle) {
      return {
        text: "To connect Bluesky, I need your handle. Please provide it like: \"connect bluesky alice.bsky.social\"",
        success: false,
        error: "MISSING_HANDLE",
        data: { actionName },
      };
    }

    const userResult = await lookupUser(message.entityId as string, actionName);
    if (isUserLookupError(userResult)) return userResult;

    const { organizationId, user } = userResult;
    const platformName = capitalize(platform);

    if (await oauthService.isPlatformConnected(organizationId, platform)) {
      const connections = await oauthService.listConnections({ organizationId, platform });
      const identifier = connections.find((c) => c.status === "active")?.email
        || connections.find((c) => c.status === "active")?.username || "";
      return {
        text: `Your ${platformName} account is already connected${identifier ? ` (${identifier})` : ""}.`,
        success: true,
        data: { actionName, alreadyConnected: true },
      };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

    let result;
    try {
      result = await oauthService.initiateAuth({
        organizationId,
        userId: user.id,
        platform,
        handle,
        redirectUrl: `${baseUrl}/auth/success`,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[${actionName}] OAuth initiation failed: ${errMsg} (platform=${platform}, org=${organizationId})`);
      return {
        text: `Failed to start ${platformName} connection. Please try again later.`,
        success: false,
        error: "OAUTH_INITIATION_FAILED",
        data: { actionName },
      };
    }

    if (!result.authUrl) {
      logger.error(`[${actionName}] Failed to generate auth URL`);
      return {
        text: `Failed to generate authorization link. Please try again.`,
        success: false,
        error: "AUTH_URL_GENERATION_FAILED",
        data: { actionName },
      };
    }

    const text = `Connect ${platformName}: ${result.authUrl}\n\nWhen you've finished authorizing, say "done" and I'll verify the connection.`;

    if (callback) await callback({ text, actions: [actionName] });

    return { text, success: true, data: { actionName, authUrl: result.authUrl } };
  },

  examples: [
    [
      { name: "{{name1}}", content: { text: "connect my google account" } },
      { name: "{{name2}}", content: { text: "Connect Google: https://accounts.google.com/...", actions: ["OAUTH_CONNECT"] } },
    ],
    [
      { name: "{{name1}}", content: { text: "link gmail" } },
      { name: "{{name2}}", content: { text: "Connect Google: https://accounts.google.com/...", actions: ["OAUTH_CONNECT"] } },
    ],
    [
      { name: "{{name1}}", content: { text: "connect bluesky alice.bsky.social" } },
      { name: "{{name2}}", content: { text: "Connect Bluesky: https://bsky.social/oauth/authorize?...", actions: ["OAUTH_CONNECT"] } },
    ],
  ] as ActionExample[][],
};
