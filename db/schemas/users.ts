import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    privy_user_id: text("privy_user_id").notNull().unique(),
    email: text("email").unique(),
    email_verified: boolean("email_verified").default(false),
    wallet_address: text("wallet_address").unique(),
    wallet_chain_type: text("wallet_chain_type"),
    wallet_verified: boolean("wallet_verified").default(false).notNull(),
    name: text("name"),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    avatar: text("avatar"),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    email_idx: index("users_email_idx").on(table.email),
    wallet_address_idx: index("users_wallet_address_idx").on(table.wallet_address),
    wallet_chain_type_idx: index("users_wallet_chain_type_idx").on(table.wallet_chain_type),
    organization_idx: index("users_organization_idx").on(table.organization_id),
    is_active_idx: index("users_is_active_idx").on(table.is_active),
    privy_user_id_idx: index("users_privy_user_id_idx").on(table.privy_user_id),
  }),
);

// Type inference
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
