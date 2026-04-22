// @ts-nocheck — MCP tool types cause exponential type inference
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import {
  createHostedBrowserSession,
  deleteHostedBrowserSession,
  executeHostedBrowserCommand,
  getHostedBrowserSession,
  getHostedBrowserSnapshot,
  listHostedBrowserSessions,
  navigateHostedBrowserSession,
} from "@/lib/services/browser-tools";
import { getAuthContext } from "../lib/context";
import { errorResponse, jsonResponse } from "../lib/responses";

const browserOperationSchema = z.enum([
  "list",
  "create",
  "get",
  "delete",
  "navigate",
  "snapshot",
  "command",
]);

const browserCommandSchema = z.enum([
  "back",
  "click",
  "eval",
  "forward",
  "get",
  "navigate",
  "press",
  "reload",
  "scroll",
  "state",
  "type",
  "wait",
]);

export function registerBrowserTools(server: McpServer): void {
  server.registerTool(
    "browser_session",
    {
      description:
        "Create, inspect, and control hosted browser sessions through Eliza Cloud. Supports session listing, navigation, screenshots, and structured browser commands.",
      inputSchema: {
        operation: browserOperationSchema.describe("Browser operation to perform"),
        sessionId: z
          .string()
          .trim()
          .optional()
          .describe("Session id for get/delete/navigate/snapshot/command"),
        url: z.string().trim().url().max(2_000).optional().describe("Initial or navigation URL"),
        title: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .optional()
          .describe("Optional session title override"),
        ttl: z.number().int().min(30).max(3_600).optional().describe("Session ttl in seconds"),
        activityTtl: z
          .number()
          .int()
          .min(10)
          .max(3_600)
          .optional()
          .describe("Idle session ttl in seconds"),
        subaction: browserCommandSchema.optional().describe("Browser command subaction"),
        selector: z.string().trim().optional().describe("Selector for click/type/wait"),
        text: z.string().optional().describe("Text payload for type"),
        key: z.string().trim().optional().describe("Keyboard key for press"),
        pixels: z
          .number()
          .int()
          .min(-5_000)
          .max(5_000)
          .optional()
          .describe("Scroll distance in pixels"),
        timeoutMs: z
          .number()
          .int()
          .min(1)
          .max(300_000)
          .optional()
          .describe("Timeout for wait or command execution"),
        script: z.string().optional().describe("Page script for eval"),
      },
    },
    async ({
      activityTtl,
      key,
      operation,
      pixels,
      script,
      selector,
      sessionId,
      subaction,
      text,
      timeoutMs,
      title,
      ttl,
      url,
    }) => {
      try {
        const { user, apiKey } = getAuthContext();
        const auth = {
          apiKeyId: apiKey?.id ?? null,
          organizationId: user.organization_id,
          requestSource: "mcp" as const,
          userId: user.id,
        };

        switch (operation) {
          case "list":
            return jsonResponse({ sessions: await listHostedBrowserSessions(auth) });
          case "create":
            return jsonResponse({
              session: await createHostedBrowserSession(
                {
                  activityTtl,
                  title,
                  ttl,
                  url,
                },
                auth,
              ),
            });
          case "get":
            if (!sessionId) {
              return errorResponse("sessionId is required for browser get");
            }
            return jsonResponse({ session: await getHostedBrowserSession(sessionId, auth) });
          case "delete":
            if (!sessionId) {
              return errorResponse("sessionId is required for browser delete");
            }
            return jsonResponse({
              closed: (await deleteHostedBrowserSession(sessionId, auth)).success === true,
            });
          case "navigate":
            if (!sessionId) {
              return errorResponse("sessionId is required for browser navigate");
            }
            if (!url) {
              return errorResponse("url is required for browser navigate");
            }
            return jsonResponse({
              session: await navigateHostedBrowserSession(sessionId, url, auth),
            });
          case "snapshot":
            if (!sessionId) {
              return errorResponse("sessionId is required for browser snapshot");
            }
            return jsonResponse({
              session: await getHostedBrowserSession(sessionId, auth),
              snapshot: await getHostedBrowserSnapshot(sessionId, auth),
            });
          case "command":
            if (!sessionId) {
              return errorResponse("sessionId is required for browser command");
            }
            if (!subaction) {
              return errorResponse("subaction is required for browser command");
            }
            return jsonResponse(
              await executeHostedBrowserCommand(
                sessionId,
                {
                  id: sessionId,
                  key,
                  pixels,
                  script,
                  selector,
                  subaction,
                  text,
                  timeoutMs,
                  url,
                },
                auth,
              ),
            );
        }
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : "Browser session failed");
      }
    },
  );
}
