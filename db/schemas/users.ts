import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workos_user_id: text("workos_user_id").unique(),
    email: text("email").notNull().unique(),
    email_verified: boolean("email_verified").notNull().default(false),
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
    organization_idx: index("users_organization_idx").on(table.organization_id),
    is_active_idx: index("users_is_active_idx").on(table.is_active),
    workos_user_id_idx: index("users_workos_user_id_idx").on(
      table.workos_user_id,
    ),
  }),
);

