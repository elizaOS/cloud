/**
 * Database relations definitions.
 *
 * Defines relationships between tables for Drizzle ORM query building.
 */
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
import { tokenRedemptions, redemptionLimits } from "./token-redemptions";
import { appDomains } from "./app-domains";
import { appBundles } from "./app-bundles";
import { mediaCollections } from "./media-collections";
import { mediaCollectionItems } from "./media-collection-items";
import { mediaUploads } from "./media-uploads";
import { generations } from "./generations";
import { adAccounts } from "./ad-accounts";
import { adCampaigns } from "./ad-campaigns";
import { adCreatives } from "./ad-creatives";
import { adTransactions } from "./ad-transactions";
import { creditTransactions } from "./credit-transactions";
import { secrets } from "./secrets";
import {
  discordBotConnections,
  discordEventRoutes,
  discordEventQueue,
} from "./discord-gateway";
import { orgPlatformConnections } from "./org-platforms";
import { managedDomains } from "./managed-domains";
import { domainModerationEvents } from "./domain-moderation-events";
import { containers } from "./containers";
import { userMcps } from "./user-mcps";
import { n8nWorkflows } from "./n8n-workflows";
import { appAgents, appWorkflows, appServices } from "./app-integrations";
import { cryptoPayments } from "./crypto-payments";

/**
 * Organizations table relations.
 */
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  invites: many(organizationInvites),
  apps: many(apps),
}));

/**
 * Users table relations.
 */
export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organization_id],
    references: [organizations.id],
  }),
  conversations: many(conversations),
}));

/**
 * Conversations table relations.
 */
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

/**
 * Conversation messages table relations.
 */
export const conversationMessagesRelations = relations(
  conversationMessages,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationMessages.conversation_id],
      references: [conversations.id],
    }),
  }),
);

/**
 * User characters table relations.
 */
export const userCharactersRelations = relations(
  userCharacters,
  ({ one, many }) => ({
    user: one(users, {
      fields: [userCharacters.user_id],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [userCharacters.organization_id],
      references: [organizations.id],
    }),
    // Apps that use this agent
    appAgents: many(appAgents),
  }),
);

/**
 * Organization invites table relations.
 */
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

/**
 * Apps table relations.
 */
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
  domains: many(appDomains),
  bundles: many(appBundles),
  // App integrations (junction tables)
  agents: many(appAgents),
  workflows: many(appWorkflows),
  services: many(appServices),
}));

/**
 * App users table relations.
 */
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

/**
 * App analytics table relations.
 */
export const appAnalyticsRelations = relations(appAnalytics, ({ one }) => ({
  app: one(apps, {
    fields: [appAnalytics.app_id],
    references: [apps.id],
  }),
}));

/**
 * App credit balances table relations.
 */
export const appCreditBalancesRelations = relations(
  appCreditBalances,
  ({ one }) => ({
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
  }),
);

/**
 * App earnings table relations.
 */
export const appEarningsRelations = relations(appEarnings, ({ one }) => ({
  app: one(apps, {
    fields: [appEarnings.app_id],
    references: [apps.id],
  }),
}));

/**
 * App earnings transactions table relations.
 */
export const appEarningsTransactionsRelations = relations(
  appEarningsTransactions,
  ({ one }) => ({
    app: one(apps, {
      fields: [appEarningsTransactions.app_id],
      references: [apps.id],
    }),
    user: one(users, {
      fields: [appEarningsTransactions.user_id],
      references: [users.id],
    }),
  }),
);

/**
 * Token redemptions table relations.
 */
export const tokenRedemptionsRelations = relations(
  tokenRedemptions,
  ({ one }) => ({
    user: one(users, {
      fields: [tokenRedemptions.user_id],
      references: [users.id],
    }),
    app: one(apps, {
      fields: [tokenRedemptions.app_id],
      references: [apps.id],
    }),
    reviewer: one(users, {
      fields: [tokenRedemptions.reviewed_by],
      references: [users.id],
    }),
  }),
);

/**
 * Redemption limits table relations.
 */
export const redemptionLimitsRelations = relations(
  redemptionLimits,
  ({ one }) => ({
    user: one(users, {
      fields: [redemptionLimits.user_id],
      references: [users.id],
    }),
  }),
);

/**
 * App domains table relations.
 */
export const appDomainsRelations = relations(appDomains, ({ one }) => ({
  app: one(apps, {
    fields: [appDomains.app_id],
    references: [apps.id],
  }),
}));

/**
 * App bundles table relations.
 */
export const appBundlesRelations = relations(appBundles, ({ one }) => ({
  app: one(apps, {
    fields: [appBundles.app_id],
    references: [apps.id],
  }),
}));

// ============================================
// Media Collections & Uploads Relations
// ============================================

/**
 * Media collections table relations.
 */
export const mediaCollectionsRelations = relations(
  mediaCollections,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [mediaCollections.organization_id],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [mediaCollections.user_id],
      references: [users.id],
    }),
    coverImage: one(generations, {
      fields: [mediaCollections.cover_image_id],
      references: [generations.id],
    }),
    items: many(mediaCollectionItems),
  }),
);

/**
 * Media collection items table relations.
 */
export const mediaCollectionItemsRelations = relations(
  mediaCollectionItems,
  ({ one }) => ({
    collection: one(mediaCollections, {
      fields: [mediaCollectionItems.collection_id],
      references: [mediaCollections.id],
    }),
    generation: one(generations, {
      fields: [mediaCollectionItems.generation_id],
      references: [generations.id],
    }),
    upload: one(mediaUploads, {
      fields: [mediaCollectionItems.upload_id],
      references: [mediaUploads.id],
    }),
  }),
);

/**
 * Media uploads table relations.
 */
export const mediaUploadsRelations = relations(mediaUploads, ({ one }) => ({
  organization: one(organizations, {
    fields: [mediaUploads.organization_id],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [mediaUploads.user_id],
    references: [users.id],
  }),
}));

// ============================================
// Advertising Relations
// ============================================

/**
 * Ad accounts table relations.
 */
export const adAccountsRelations = relations(adAccounts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [adAccounts.organization_id],
    references: [organizations.id],
  }),
  connectedBy: one(users, {
    fields: [adAccounts.connected_by_user_id],
    references: [users.id],
  }),
  accessTokenSecret: one(secrets, {
    fields: [adAccounts.access_token_secret_id],
    references: [secrets.id],
  }),
  refreshTokenSecret: one(secrets, {
    fields: [adAccounts.refresh_token_secret_id],
    references: [secrets.id],
  }),
  campaigns: many(adCampaigns),
}));

/**
 * Ad campaigns table relations.
 */
export const adCampaignsRelations = relations(adCampaigns, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [adCampaigns.organization_id],
    references: [organizations.id],
  }),
  adAccount: one(adAccounts, {
    fields: [adCampaigns.ad_account_id],
    references: [adAccounts.id],
  }),
  app: one(apps, {
    fields: [adCampaigns.app_id],
    references: [apps.id],
  }),
  creatives: many(adCreatives),
  transactions: many(adTransactions),
}));

/**
 * Ad creatives table relations.
 */
export const adCreativesRelations = relations(adCreatives, ({ one }) => ({
  campaign: one(adCampaigns, {
    fields: [adCreatives.campaign_id],
    references: [adCampaigns.id],
  }),
}));

/**
 * Ad transactions table relations.
 */
export const adTransactionsRelations = relations(adTransactions, ({ one }) => ({
  organization: one(organizations, {
    fields: [adTransactions.organization_id],
    references: [organizations.id],
  }),
  campaign: one(adCampaigns, {
    fields: [adTransactions.campaign_id],
    references: [adCampaigns.id],
  }),
  creditTransaction: one(creditTransactions, {
    fields: [adTransactions.credit_transaction_id],
    references: [creditTransactions.id],
  }),
}));

// ============================================
// Discord Gateway Relations
// ============================================

/**
 * Discord bot connections table relations.
 */
export const discordBotConnectionsRelations = relations(
  discordBotConnections,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [discordBotConnections.organization_id],
      references: [organizations.id],
    }),
    platformConnection: one(orgPlatformConnections, {
      fields: [discordBotConnections.platform_connection_id],
      references: [orgPlatformConnections.id],
    }),
    routes: many(discordEventRoutes),
  }),
);

/**
 * Discord event routes table relations.
 */
export const discordEventRoutesRelations = relations(
  discordEventRoutes,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [discordEventRoutes.organization_id],
      references: [organizations.id],
    }),
    platformConnection: one(orgPlatformConnections, {
      fields: [discordEventRoutes.platform_connection_id],
      references: [orgPlatformConnections.id],
    }),
    queueItems: many(discordEventQueue),
  }),
);

/**
 * Discord event queue table relations.
 */
export const discordEventQueueRelations = relations(
  discordEventQueue,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [discordEventQueue.organization_id],
      references: [organizations.id],
    }),
    route: one(discordEventRoutes, {
      fields: [discordEventQueue.route_id],
      references: [discordEventRoutes.id],
    }),
  }),
);

/**
 * Managed domains table relations.
 */
export const managedDomainsRelations = relations(
  managedDomains,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [managedDomains.organizationId],
      references: [organizations.id],
    }),
    app: one(apps, {
      fields: [managedDomains.appId],
      references: [apps.id],
    }),
    container: one(containers, {
      fields: [managedDomains.containerId],
      references: [containers.id],
    }),
    agent: one(userCharacters, {
      fields: [managedDomains.agentId],
      references: [userCharacters.id],
    }),
    mcp: one(userMcps, {
      fields: [managedDomains.mcpId],
      references: [userMcps.id],
    }),
    moderationEvents: many(domainModerationEvents),
  }),
);

/**
 * Domain moderation events table relations.
 */
export const domainModerationEventsRelations = relations(
  domainModerationEvents,
  ({ one }) => ({
    domain: one(managedDomains, {
      fields: [domainModerationEvents.domainId],
      references: [managedDomains.id],
    }),
    adminUser: one(users, {
      fields: [domainModerationEvents.adminUserId],
      references: [users.id],
    }),
    resolvedByUser: one(users, {
      fields: [domainModerationEvents.resolvedBy],
      references: [users.id],
    }),
  }),
);

// ============================================
// App Integration Junction Table Relations
// ============================================

/**
 * App agents junction table relations.
 */
export const appAgentsRelations = relations(appAgents, ({ one }) => ({
  app: one(apps, {
    fields: [appAgents.app_id],
    references: [apps.id],
  }),
  agent: one(userCharacters, {
    fields: [appAgents.agent_id],
    references: [userCharacters.id],
  }),
}));

/**
 * App workflows junction table relations.
 */
export const appWorkflowsRelations = relations(appWorkflows, ({ one }) => ({
  app: one(apps, {
    fields: [appWorkflows.app_id],
    references: [apps.id],
  }),
  workflow: one(n8nWorkflows, {
    fields: [appWorkflows.workflow_id],
    references: [n8nWorkflows.id],
  }),
}));

/**
 * App services junction table relations.
 */
export const appServicesRelations = relations(appServices, ({ one }) => ({
  app: one(apps, {
    fields: [appServices.app_id],
    references: [apps.id],
  }),
  service: one(userMcps, {
    fields: [appServices.service_id],
    references: [userMcps.id],
  }),
}));

/**
 * N8N workflows table relations.
 */
export const n8nWorkflowsRelations = relations(
  n8nWorkflows,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [n8nWorkflows.organization_id],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [n8nWorkflows.user_id],
      references: [users.id],
    }),
    // Apps that use this workflow
    appWorkflows: many(appWorkflows),
  }),
);

/**
 * User MCPs (services) table relations.
 */
export const userMcpsRelations = relations(userMcps, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [userMcps.organization_id],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [userMcps.created_by_user_id],
    references: [users.id],
  }),
  container: one(containers, {
    fields: [userMcps.container_id],
    references: [containers.id],
  }),
  // Apps that use this service
  appServices: many(appServices),
}));

/**
 * Crypto payments table relations.
 */
export const cryptoPaymentsRelations = relations(cryptoPayments, ({ one }) => ({
  organization: one(organizations, {
    fields: [cryptoPayments.organization_id],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [cryptoPayments.user_id],
    references: [users.id],
  }),
}));
