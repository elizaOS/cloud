import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { conversations, conversationMessages } from "./conversations";
import { userCharacters } from "./user-characters";

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organization_id],
    references: [organizations.id],
  }),
  conversations: many(conversations),
}));

export const conversationsRelations = relations(
  conversations,
  ({ many, one }) => ({
    messages: many(conversationMessages),
    user: one(users, {
      fields: [conversations.user_id],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [conversations.organization_id],
      references: [organizations.id],
    }),
  }),
);

export const conversationMessagesRelations = relations(
  conversationMessages,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationMessages.conversation_id],
      references: [conversations.id],
    }),
  }),
);

export const userCharactersRelations = relations(
  userCharacters,
  ({ one }) => ({
    user: one(users, {
      fields: [userCharacters.user_id],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [userCharacters.organization_id],
      references: [organizations.id],
    }),
  }),
);
