// @ts-nocheck — MCP tool types cause exponential type inference
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import { executeHostedGoogleSearch } from "@/lib/services/google-search";
import { getAuthContext } from "../lib/context";
import { errorResponse, jsonResponse } from "../lib/responses";

const timeRangeSchema = z.enum(["day", "week", "month", "year", "d", "w", "m", "y"]);

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    "search_web",
    {
      description:
        "Search the web using hosted Google Search grounding via Gemini. Returns a grounded answer, citations, and search metadata.",
      inputSchema: {
        query: z.string().min(1).max(2_000).describe("What to search for"),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Maximum number of cited results to return"),
        model: z
          .string()
          .min(1)
          .max(128)
          .optional()
          .describe("Optional Gemini model override"),
        source: z
          .string()
          .min(1)
          .max(255)
          .optional()
          .describe("Optional preferred source domain, e.g. reuters.com"),
        topic: z
          .enum(["general", "finance"])
          .optional()
          .describe("Use finance for market and crypto queries"),
        timeRange: timeRangeSchema.optional().describe("Prefer recent coverage within a time window"),
        startDate: z
          .string()
          .min(1)
          .max(32)
          .optional()
          .describe("Prefer sources on or after this date (YYYY-MM-DD)"),
        endDate: z
          .string()
          .min(1)
          .max(32)
          .optional()
          .describe("Prefer sources on or before this date (YYYY-MM-DD)"),
      },
    },
    async ({ query, maxResults, model, source, topic, timeRange, startDate, endDate }) => {
      try {
        const { user, apiKey } = getAuthContext();
        const result = await executeHostedGoogleSearch(
          {
            query,
            maxResults,
            model,
            source,
            topic,
            timeRange,
            startDate,
            endDate,
          },
          {
            organizationId: user.organization_id,
            userId: user.id,
            apiKeyId: apiKey?.id ?? null,
            requestSource: "mcp",
          },
        );

        return jsonResponse(result);
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : "Search failed");
      }
    },
  );
}
