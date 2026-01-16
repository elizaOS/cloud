/**
 * Token redemption tools
 */

import type { McpServer } from "mcp-handler";
import { z } from "zod3";
import { secureTokenRedemptionService } from "@/lib/services/token-redemption-secure";
import { getAuthContext } from "../lib/context";
import { jsonResponse, errorResponse } from "../lib/responses";

export function registerRedemptionTools(server: McpServer): void {
  server.registerTool(
    "get_redemption_balance",
    {
      description: "Get redeemable token balance. FREE tool.",
      inputSchema: {},
    },
    async () => {
      try {
        const { user } = getAuthContext();
        const balance = await secureTokenRedemptionService.getEarnedBalance(
          user.organization_id,
        );

        return jsonResponse({
          success: true,
          balance,
          organizationId: user.organization_id,
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error.message : "Failed to get balance",
        );
      }
    },
  );

  server.registerTool(
    "get_redemption_quote",
    {
      description: "Get token redemption quote. FREE tool.",
      inputSchema: {
        pointsAmount: z
          .number()
          .int()
          .min(100)
          .max(100000)
          .describe("Points to redeem"),
        network: z
          .enum(["ethereum", "base", "bnb", "solana"])
          .describe("Payout network"),
      },
    },
    async ({ pointsAmount, network }) => {
      try {
        const quote = await secureTokenRedemptionService.getRedemptionQuote(
          pointsAmount,
          network,
        );
        return jsonResponse({ success: true, quote });
      } catch (error) {
        return errorResponse(
          error instanceof Error
            ? error.message
            : "Failed to get redemption quote",
        );
      }
    },
  );
}
