import {
  date,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const freeModelUsage = pgTable(
  "free_model_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    model: varchar("model", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 100 }).notNull(),
    request_count: integer("request_count").default(1).notNull(),
    token_count: integer("token_count").default(0).notNull(),
    date: date("date").notNull().defaultNow(),
    hour: integer("hour").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    org_user_model_date_hour_idx: index(
      "free_model_usage_org_user_model_date_hour_idx"
    ).on(
      table.organization_id,
      table.user_id,
      table.model,
      table.provider,
      table.date,
      table.hour
    ),
    org_date_idx: index("free_model_usage_org_date_idx").on(
      table.organization_id,
      table.date
    ),
    user_date_idx: index("free_model_usage_user_date_idx").on(
      table.user_id,
      table.date
    ),
    model_idx: index("free_model_usage_model_idx").on(table.model),
  })
);

export type FreeModelUsage = InferSelectModel<typeof freeModelUsage>;
export type NewFreeModelUsage = InferInsertModel<typeof freeModelUsage>;
