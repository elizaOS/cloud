import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { organizationInvites } from "./organization-invites";
import { users } from "./users";
import { conversations, conversationMessages } from "./conversations";
import { userCharacters } from "./user-characters";
import { apps, appUsers, appAnalytics } from "./apps";
import { apiKeys } from "./api-keys";
import { appCreditBalances } from "./app-credit-balances";
import { appEarnings, appEarningsTransactions } from "./app-earnings";

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  invites: many(organizationInvites),
  apps: many(apps),
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

export const userCharactersRelations = relations(userCharacters, ({ one }) => ({
  user: one(users, {
    fields: [userCharacters.user_id],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userCharacters.organization_id],
    references: [organizations.id],
  }),
}));

export const organizationInvitesRelations = relations(
  organizationInvites,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationInvites.organization_id],
      references: [organizations.id],
    }),
    inviter: one(users, {
      fields: [organizationInvites.inviter_user_id],
      references: [users.id],
    }),
    acceptedBy: one(users, {
      fields: [organizationInvites.accepted_by_user_id],
      references: [users.id],
    }),
  }),
);

export const appsRelations = relations(apps, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [apps.organization_id],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [apps.created_by_user_id],
    references: [users.id],
  }),
  apiKey: one(apiKeys, {
    fields: [apps.api_key_id],
    references: [apiKeys.id],
  }),
  users: many(appUsers),
  analytics: many(appAnalytics),
  creditBalances: many(appCreditBalances),
  earningsTransactions: many(appEarningsTransactions),
}));

export const appUsersRelations = relations(appUsers, ({ one }) => ({
  app: one(apps, {
    fields: [appUsers.app_id],
    references: [apps.id],
  }),
  user: one(users, {
    fields: [appUsers.user_id],
    references: [users.id],
  }),
}));

export const appAnalyticsRelations = relations(appAnalytics, ({ one }) => ({
  app: one(apps, {
    fields: [appAnalytics.app_id],
    references: [apps.id],
  }),
}));

// App Credit Balances Relations
export const appCreditBalancesRelations = relations(appCreditBalances, ({ one }) => ({
  app: one(apps, {
    fields: [appCreditBalances.app_id],
    references: [apps.id],
  }),
  user: one(users, {
    fields: [appCreditBalances.user_id],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [appCreditBalances.organization_id],
    references: [organizations.id],
  }),
}));

// App Earnings Relations
export const appEarningsRelations = relations(appEarnings, ({ one }) => ({
  app: one(apps, {
    fields: [appEarnings.app_id],
    references: [apps.id],
  }),
}));

// App Earnings Transactions Relations
export const appEarningsTransactionsRelations = relations(appEarningsTransactions, ({ one }) => ({
  app: one(apps, {
    fields: [appEarningsTransactions.app_id],
    references: [apps.id],
  }),
  user: one(users, {
    fields: [appEarningsTransactions.user_id],
    references: [users.id],
  }),
}));
