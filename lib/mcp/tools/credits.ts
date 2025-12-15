/**
 * MCP Tools: Credits & Billing
 *
 * Tools for checking credit balance, transactions, and billing usage.
 */

import { z } from "zod";
import { creditsService } from "@/lib/services/credits";
import { organizationsService } from "@/lib/services/organizations";
import { usageService } from "@/lib/services/usage";
import {
  successResponse,
  errorResponse,
  type AuthResultWithOrg,
} from "./types";
import type { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * Register all credit-related tools
 */
export function registerCreditTools(
  server: McpServer,
  getAuthContext: () => AuthResultWithOrg,
) {
  // Tool: Check Credits - View balance and recent transactions
  server.registerTool(
    "check_credits",
    {
      description:
        "Check balance and recent transactions for your organization",
      inputSchema: {
        includeTransactions: z
          .boolean()
          .optional()
          .describe("Include recent transactions in the response"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .default(5)
          .describe("Number of recent transactions to include"),
      },
    },
    async ({ includeTransactions = false, limit = 5 }) => {
      const { user } = getAuthContext();
      const org = await organizationsService.getById(user.organization_id);

      if (!org) {
        return errorResponse(new Error("Organization not found"));
      }

      const response: {
        balance: number;
        organizationId: string;
        organizationName: string;
        transactions?: Array<{
          id: string;
          amount: number;
          type: string;
          description: string;
          createdAt: string;
        }>;
      } = {
        balance: Number(org.credit_balance),
        organizationId: org.id,
        organizationName: org.name,
      };

      if (includeTransactions) {
        const transactions =
          await creditsService.listTransactionsByOrganization(
            user.organization_id,
            limit,
          );
        response.transactions = transactions.map((t) => ({
          id: t.id,
          amount: Number(t.amount),
          type: t.type,
          description: t.description || "No description",
          createdAt: t.created_at.toISOString(),
        }));
      }

      return successResponse(response);
    },
  );

  // Tool: Get Credit Summary
  server.registerTool(
    "get_credit_summary",
    {
      description:
        "Get detailed credit summary including balance and usage breakdown",
      inputSchema: {
        period: z
          .enum(["day", "week", "month"])
          .optional()
          .default("month")
          .describe("Time period for usage breakdown"),
      },
    },
    async ({ period = "month" }) => {
      const { user } = getAuthContext();
      const org = await organizationsService.getById(user.organization_id);

      if (!org) {
        return errorResponse(new Error("Organization not found"));
      }

      // Calculate date range
      const now = new Date();
      const startDate = new Date();
      switch (period) {
        case "day":
          startDate.setDate(now.getDate() - 1);
          break;
        case "week":
          startDate.setDate(now.getDate() - 7);
          break;
        case "month":
          startDate.setMonth(now.getMonth() - 1);
          break;
      }

      const usage = await usageService.getUsageStats(
        user.organization_id,
        startDate,
        now,
      );

      return successResponse({
        balance: Number(org.credit_balance),
        period,
        usage: {
          totalCost: usage.totalCost,
          requestCount: usage.requestCount,
          breakdown: usage.breakdown,
        },
      });
    },
  );

  // Tool: List Credit Transactions
  server.registerTool(
    "list_credit_transactions",
    {
      description: "List credit transactions for the organization",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe("Maximum number of transactions to return"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .default(0)
          .describe("Number of transactions to skip"),
        type: z
          .enum(["credit", "debit", "refund", "purchase"])
          .optional()
          .describe("Filter by transaction type"),
      },
    },
    async ({ limit = 20, offset = 0, type }) => {
      const { user } = getAuthContext();

      const transactions = await creditsService.listTransactionsByOrganization(
        user.organization_id,
        limit,
        offset,
        type,
      );

      return successResponse({
        transactions: transactions.map((t) => ({
          id: t.id,
          amount: Number(t.amount),
          type: t.type,
          description: t.description,
          createdAt: t.created_at.toISOString(),
          metadata: t.metadata,
        })),
        pagination: { limit, offset, count: transactions.length },
      });
    },
  );

  // Tool: List Credit Packs
  server.registerTool(
    "list_credit_packs",
    {
      description: "List available credit packs for purchase",
      inputSchema: {},
    },
    async () => {
      const packs = await creditsService.listCreditPacks();

      return successResponse({
        packs: packs.map((p) => ({
          id: p.id,
          name: p.name,
          credits: Number(p.credits),
          price: Number(p.price_usd),
          bonus: p.bonus_credits ? Number(p.bonus_credits) : 0,
          popular: p.is_popular,
        })),
      });
    },
  );

  // Tool: Get Billing Usage
  server.registerTool(
    "get_billing_usage",
    {
      description: "Get detailed billing and usage statistics",
      inputSchema: {
        startDate: z.string().optional().describe("Start date (ISO format)"),
        endDate: z.string().optional().describe("End date (ISO format)"),
      },
    },
    async ({ startDate, endDate }) => {
      const { user } = getAuthContext();

      const start = startDate
        ? new Date(startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const usage = await usageService.getUsageStats(
        user.organization_id,
        start,
        end,
      );

      return successResponse({
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        usage: {
          totalCost: usage.totalCost,
          requestCount: usage.requestCount,
          breakdown: usage.breakdown,
        },
      });
    },
  );
}
