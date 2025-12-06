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
export { 
  charactersService,
  characterMarketplaceService,
} from "./characters";

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

// Referral & rewards services
export { referralsService, socialRewardsService, REWARDS } from "./referrals";

// Abuse detection
export { abuseDetectionService } from "./abuse-detection";
export type { AbuseCheckResult, SignupContext } from "./abuse-detection";

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
