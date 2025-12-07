/**
 * Service Layer - Business Logic
 *
 * Architecture Overview:
 *
 * 1. **Character Services** (lib/services/characters/)
 *    - User-created character definitions (user_characters table)
 *    - Marketplace, templates, CRUD operations
 *
 * 2. **Deployment Services** (lib/services/deployments/)
 *    - Character deployment discovery
 *    - Infrastructure lifecycle
 *
 * 3. **Agent Services** (lib/services/agents/)
 *    - Runtime agent operations (agents table - ElizaOS)
 *    - Rooms, messages, conversations
 *
 * 4. **Core Platform Services** (lib/services/)
 *    - Organizations, users, credits, etc.
 */

// ============================================
// Core Platform Services
// ============================================
export * from "./organizations";
export * from "./users";
export * from "./user-sessions";
export * from "./anonymous-sessions";
export { invitesService } from "./invites";
export * from "./api-keys";
export * from "./cli-auth-sessions";
export * from "./credits";
export * from "./usage";
export { usageQuotasService } from "./usage-quotas";
export type { CreateQuotaParams, QuotaCheckResult } from "./usage-quotas";
export * from "./provider-health";
export * from "./analytics";

// ============================================
// Character Domain Services
// ============================================
export * from "./characters";
export { charactersService, characterMarketplaceService } from "./characters";

// ============================================
// Deployment Domain Services
// ============================================
export * from "./deployments";
export {
  characterDeploymentDiscoveryService,
  deploymentDiscoveryService,
} from "./deployments";

// ============================================
// Agent Runtime Services (ElizaOS)
// ============================================
export * from "./agents/agents";
export * from "./agents/rooms";
export { agentsService, agentService } from "./agents/agents";
export { roomsService } from "./agents/rooms";

// ============================================
// Infrastructure Services
// ============================================
export * from "./containers";
export * from "./generations";
export * from "./conversations";
export * from "./container-quota";
export * from "./memory";

// ============================================
// App Domain Services
// ============================================
export { appsService } from "./apps";
export { appAnalyticsService } from "./app-analytics";
export { appSignupTrackingService } from "./app-signup-tracking";
export { appCreditsService } from "./app-credits";
export { appEarningsService } from "./app-earnings";

// AWS Infrastructure services
export * from "./ecr";
export * from "./cloudformation";
export * from "./alb-priority-manager";

// ============================================
// External Integration Services
// ============================================

// Agent0 (ERC-8004) services
export { agent0Service } from "./agent0";
export type { Agent0Agent, Agent0SearchFilters } from "./agent0";

// Agent Registry (ERC-8004 on-chain registration for public agents)
export { agentRegistryService } from "./agent-registry";
export type {
  AgentRegistrationParams,
  AgentRegistrationResult,
  AgentCardData,
} from "./agent-registry";

// User MCPs (Monetizable MCP Servers)
export { userMcpsService } from "./user-mcps";
export type { CreateMcpParams, UpdateMcpParams, UseMcpParams, UseMcpResult } from "./user-mcps";

// Voice services
export { voiceCloningService } from "./voice-cloning";

// Email services
export { emailService } from "./email";

// Discord services
export { discordService } from "./discord";

// Payment services
export { paymentMethodsService } from "./payment-methods";
export { purchasesService, PURCHASE_LIMITS } from "./purchases";
export { autoTopUpService, AUTO_TOP_UP_LIMITS } from "./auto-top-up";
export { invoicesService } from "./invoices";

// Token Redemption services
export { elizaTokenPriceService, ELIZA_TOKEN_ADDRESSES } from "./eliza-token-price";
export type { SupportedNetwork } from "./eliza-token-price";
export { tokenRedemptionService } from "./token-redemption";
export { secureTokenRedemptionService } from "./token-redemption-secure";
export { payoutProcessorService } from "./payout-processor";
export { twapPriceOracle, TWAP_CONFIG, SYSTEM_LIMITS } from "./twap-price-oracle";
export { payoutAlertsService } from "./payout-alerts";
export { redeemableEarningsService } from "./redeemable-earnings";
export { agentMonetizationService } from "./agent-monetization";
export { agentBudgetService } from "./agent-budgets";
export { payoutStatusService } from "./payout-status";

// Referral & rewards services
export { referralsService, socialRewardsService, REWARDS } from "./referrals";

// Abuse detection
export { abuseDetectionService } from "./abuse-detection";
export type { AbuseCheckResult, SignupContext } from "./abuse-detection";

// Content moderation (async, non-blocking)
export { contentModerationService } from "./content-moderation";
export type {
  AsyncModerationResult,
  ModerationViolation as ContentModerationViolation,
  CriticalCategory,
} from "./content-moderation";

// Admin service
export { adminService } from "./admin";

// Agent reputation (ERC-8004/A2A)
export { agentReputationService } from "./agent-reputation";

// Agent monitoring
export { agentMonitoringService } from "./agent-monitoring";
export type {
  AgentStatus,
  AgentLogEntry,
  AgentStatusResponse,
  AgentEventResponse,
} from "./agent-monitoring";

// ============================================
// Backward Compatibility (Deprecated)
// Will be removed in future version
// ============================================
/** @deprecated Use characterMarketplaceService instead */
export { characterMarketplaceService as marketplaceService } from "./characters";
/** @deprecated Use characterMarketplaceService instead */
export { characterMarketplaceService as myAgentsService } from "./characters";
/** @deprecated Use characterDeploymentDiscoveryService instead */
export { characterDeploymentDiscoveryService as agentDiscoveryService } from "./deployments";
