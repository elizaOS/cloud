import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { miladySandboxes } from "./milady-sandboxes";
import { organizations } from "./organizations";
import { users } from "./users";

export const miladyPairingTokens = pgTable(
  "milady_pairing_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token_hash: text("token_hash").notNull().unique(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agent_id: uuid("agent_id")
      .notNull()
      .references(() => miladySandboxes.id, { onDelete: "cascade" }),
    instance_url: text("instance_url").notNull(),
    expected_origin: text("expected_origin").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    used_at: timestamp("used_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIdx: index("milady_pairing_tokens_token_hash_idx").on(table.token_hash),
    expiresAtIdx: index("milady_pairing_tokens_expires_at_idx").on(table.expires_at),
    agentIdx: index("milady_pairing_tokens_agent_id_idx").on(table.agent_id),
  }),
);

export type MiladyPairingToken = InferSelectModel<typeof miladyPairingTokens>;
export type NewMiladyPairingToken = InferInsertModel<typeof miladyPairingTokens>;
