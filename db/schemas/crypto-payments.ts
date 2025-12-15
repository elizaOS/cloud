import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const cryptoPayments = pgTable(
  "crypto_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    payment_address: text("payment_address").notNull(),
    expected_amount: numeric("expected_amount", {
      precision: 18,
      scale: 6,
    }).notNull(),
    received_amount: numeric("received_amount", { precision: 18, scale: 6 }),
    credits_to_add: numeric("credits_to_add", {
      precision: 10,
      scale: 2,
    }).notNull(),

    network: text("network").notNull(),
    token: text("token").notNull().default("USDC"),
    token_address: text("token_address"),

    status: text("status").notNull().default("pending"),
    transaction_hash: text("transaction_hash"),
    block_number: text("block_number"),
    confirmed_at: timestamp("confirmed_at"),

    expires_at: timestamp("expires_at").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    org_idx: index("crypto_payments_organization_idx").on(
      table.organization_id,
    ),
    user_idx: index("crypto_payments_user_idx").on(table.user_id),
    status_idx: index("crypto_payments_status_idx").on(table.status),
    payment_address_idx: index("crypto_payments_address_idx").on(
      table.payment_address,
    ),
    tx_hash_idx: index("crypto_payments_tx_hash_idx").on(
      table.transaction_hash,
    ),
    unique_tx_hash: unique("crypto_payments_tx_hash_unique").on(
      table.transaction_hash,
    ),
  }),
);

export type CryptoPayment = InferSelectModel<typeof cryptoPayments>;
export type NewCryptoPayment = InferInsertModel<typeof cryptoPayments>;
