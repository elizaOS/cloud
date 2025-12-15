import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Crypto payments table schema.
 *
 * Stores cryptocurrency payment records for credit purchases.
 */
export const cryptoPayments = pgTable(
  "crypto_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    wallet_address: text("wallet_address").notNull(),
    token_address: text("token_address").notNull(),
    token_symbol: text("token_symbol").notNull(),

    amount_crypto: text("amount_crypto").notNull(),
    amount_usd: numeric("amount_usd", { precision: 10, scale: 2 }).notNull(),
    amount_credits: integer("amount_credits").notNull(),

    chain_id: integer("chain_id").notNull(),
    transaction_hash: text("transaction_hash"),
    block_number: integer("block_number"),
    block_confirmations: integer("block_confirmations").default(0),

    status: text("status").notNull(),

    // Dedicated column for OxaPay tracking ID - used for webhook lookups and payment verification
    oxapay_track_id: text("oxapay_track_id"),

    wallet_type: text("wallet_type"),
    slippage_tolerance: numeric("slippage_tolerance", {
      precision: 3,
      scale: 1,
    }),

    created_at: timestamp("created_at").notNull().defaultNow(),
    confirmed_at: timestamp("confirmed_at"),
    expires_at: timestamp("expires_at").notNull(),

    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => ({
    org_idx: index("crypto_payments_organization_id_idx").on(
      table.organization_id
    ),
    user_idx: index("crypto_payments_user_id_idx").on(table.user_id),
    wallet_idx: index("crypto_payments_wallet_address_idx").on(
      table.wallet_address
    ),
    status_idx: index("crypto_payments_status_idx").on(table.status),
    tx_hash_idx: index("crypto_payments_transaction_hash_idx").on(
      table.transaction_hash
    ),
    chain_idx: index("crypto_payments_chain_id_idx").on(table.chain_id),
    created_idx: index("crypto_payments_created_at_idx").on(table.created_at),
    expires_idx: index("crypto_payments_expires_at_idx").on(table.expires_at),
    // Index for efficient OxaPay webhook lookups
    oxapay_track_idx: index("crypto_payments_oxapay_track_id_idx").on(
      table.oxapay_track_id
    ),
  })
);

export type CryptoPayment = InferSelectModel<typeof cryptoPayments>;
export type NewCryptoPayment = InferInsertModel<typeof cryptoPayments>;

