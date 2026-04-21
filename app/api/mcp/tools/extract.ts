// @ts-nocheck — MCP tool types cause exponential type inference
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import { extractHostedPage } from "@/lib/services/browser-tools";
import { getAuthContext } from "../lib/context";
import { errorResponse, jsonResponse } from "../lib/responses";

export function registerExtractTools(server: McpServer): void {
  server.registerTool(
    "extract_page",
    {
      description:
        "Extract page content through the hosted Firecrawl extract API. Returns cleaned markdown, optional HTML, links, screenshot data, and metadata.",
      inputSchema: {
        url: z.string().trim().url().max(2_000).describe("Page URL to extract"),
        formats: z
          .array(z.enum(["html", "links", "markdown", "screenshot"]))
          .max(4)
          .optional()
          .describe("Requested output formats"),
        onlyMainContent: z
          .boolean()
          .optional()
          .describe("Prefer primary article/page content only"),
        timeoutMs: z
          .number()
          .int()
          .min(1_000)
          .max(120_000)
          .optional()
          .describe("Maximum extract timeout in milliseconds"),
        waitFor: z
          .number()
          .int()
          .min(0)
          .max(120_000)
          .optional()
          .describe("Wait this long before extracting, in milliseconds"),
      },
    },
    async ({ formats, onlyMainContent, timeoutMs, url, waitFor }) => {
      try {
        const { user, apiKey } = getAuthContext();
        const result = await extractHostedPage(
          {
            formats,
            onlyMainContent,
            timeoutMs,
            url,
            waitFor,
          },
          {
            apiKeyId: apiKey?.id ?? null,
            organizationId: user.organization_id,
            requestSource: "mcp",
            userId: user.id,
          },
        );

        return jsonResponse(result);
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : "Extract failed");
      }
    },
  );
}
