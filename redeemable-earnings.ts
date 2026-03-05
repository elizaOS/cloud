import { dbRead, dbWrite } from "@/db/client";
import {
  redeemableEarnings,
  redeemableEarningsLedger,
  type RedeemableEarnings,
  type NewRedeemableEarningsLedger,
} from "@/db/schemas/redeemable-earnings";
import { eq, sql } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import Decimal from "decimal.js";

type EarningsSource =
  | "miniapp"
  | "agent"
  | "mcp"
  | "affiliate"
  | "app_owner_revenue_share"
  | "creator_revenue_share";

interface AddEarningsParams {
  userId: string;
  amount: number;
  source: EarningsSource;
  sourceId: string;
  description: string;
  metadata?: Record<string, unknown>;
}

interface AddEarningsResult {
  success: boolean;
  newBalance: number;
  ledgerEntryId: string;
  error?: string;
}

const normalizeLedgerMetadata = (
  metadata?: Record<string, unknown>
): Record<string, unknown> => {
  if (!metadata) return {};
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    switch (key) {
      case "appId":
        mapped.app_id = value;
        break;
      case "earningsType":
        mapped.earnings_type = value;
        break;
      default:
        mapped[key] = value;
        break;
    }
  }
  return mapped;
};

class RedeemableEarningsService {
  async addEarnings(params: AddEarningsParams): Promise<AddEarningsResult> {
    const { userId, amount, source, sourceId, description, metadata } = params;

    if (amount <= 0) {
      return {
        success: false,
        newBalance: 0,
        ledgerEntryId: "",
        error: "Amount must be positive",
      };
    }

    const amountDecimal = new Decimal(amount).toFixed(4);

    const result = await dbWrite.transaction(async (tx) => {
      const [earnings] = await tx
        .select()
        .from(redeemableEarnings)
        .where(eq(redeemableEarnings.user_id, userId))
        .for("update");

      if (!earnings) {
        const sourceColumnInsert = {
          earned_from_miniapps: "0.0000",
          earned_from_agents: "0.0000",
          earned_from_mcps: "0.0000",
          earned_from_affiliates: "0.0000",
          earned_from_app_owner_shares: "0.0000",
          earned_from_creator_shares: "0.0000",
          [`earned_from_${source}`]: amountDecimal,
        };
        
        [earnings] = await tx
          .insert(redeemableEarnings)
          .values({
            user_id: userId,
            total_earned: amountDecimal,
            available_balance: amountDecimal,
            last_earning_at: new Date(),
            ...sourceColumnInsert,
          })
          .returning();
      } else {
        const sourceColumn = {
          miniapp: redeemableEarnings.earned_from_miniapps,
          agent: redeemableEarnings.earned_from_agents,
          mcp: redeemableEarnings.earned_from_mcps,
          affiliate: redeemableEarnings.earned_from_affiliates,
          app_owner_revenue_share:
            redeemableEarnings.earned_from_app_owner_shares,
          creator_revenue_share:
            redeemableEarnings.earned_from_creator_shares,
        }[source];

        [earnings] = await tx
          .update(redeemableEarnings)
          .set({
            total_earned: sql`${redeemableEarnings.total_earned} + ${amountDecimal}`,
            available_balance: sql`${redeemableEarnings.available_balance} + ${amountDecimal}`,
            [sourceColumn.name]: sql`${sourceColumn} + ${amountDecimal}`,
            last_earning_at: new Date(),
            version: sql`${redeemableEarnings.version} + 1`,
            updated_at: new Date(),
          })
          .where(eq(redeemableEarnings.user_id, userId))
          .returning();
      }

      const [ledgerEntry] = await tx
        .insert(redeemableEarningsLedger)
        .values({
          user_id: userId,
          entry_type: "earning",
          amount: amountDecimal,
          balance_after: earnings.available_balance,
          earnings_source: source,
          source_id: sourceId,
          description,
          metadata: normalizeLedgerMetadata(metadata),
        })
        .returning();

      return {
        earnings,
        ledgerEntryId: ledgerEntry.id,
      };
    });

    logger.info("[RedeemableEarnings] Added earnings", {
      userId: userId.slice(0, 8) + "...",
      amount,
      source,
      sourceId: sourceId.slice(0, 8) + "...",
      newBalance: Number(result.earnings.available_balance),
    });

    return {
      success: true,
      newBalance: Number(result.earnings.available_balance),
      ledgerEntryId: result.ledgerEntryId,
    };
  }
}

export const redeemableEarningsService = new RedeemableEarningsService();

