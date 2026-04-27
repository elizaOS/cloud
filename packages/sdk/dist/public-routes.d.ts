import type { ElizaCloudClient } from "./client.js";
import type { CloudRequestOptions } from "./types.js";
export declare const ELIZA_CLOUD_PUBLIC_ENDPOINTS: {
    readonly "DELETE /api/elevenlabs/voices/{id}": {
        readonly method: "DELETE";
        readonly path: "/api/elevenlabs/voices/{id}";
        readonly methodName: "deleteApiElevenlabsVoicesById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/elevenlabs/voices/[id]/route.ts";
    };
    readonly "DELETE /api/v1/admin/docker-nodes/{nodeId}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/admin/docker-nodes/{nodeId}";
        readonly methodName: "deleteApiV1AdminDockerNodesByNodeId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["nodeId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/docker-nodes/[nodeId]/route.ts";
    };
    readonly "DELETE /api/v1/admin/orgs/{orgId}/rate-limits": {
        readonly method: "DELETE";
        readonly path: "/api/v1/admin/orgs/{orgId}/rate-limits";
        readonly methodName: "deleteApiV1AdminOrgsByOrgIdRateLimits";
        readonly responseMode: "json";
        readonly pathParams: readonly ["orgId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/orgs/[orgId]/rate-limits/route.ts";
    };
    readonly "DELETE /api/v1/advertising/accounts/{id}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/advertising/accounts/{id}";
        readonly methodName: "deleteApiV1AdvertisingAccountsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/accounts/[id]/route.ts";
    };
    readonly "DELETE /api/v1/advertising/campaigns/{id}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/advertising/campaigns/{id}";
        readonly methodName: "deleteApiV1AdvertisingCampaignsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/campaigns/[id]/route.ts";
    };
    readonly "DELETE /api/v1/agents/{agentId}/n8n/{path}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/agents/{agentId}/n8n/{path}";
        readonly methodName: "deleteApiV1AgentsByAgentIdN8nByPath";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId", "path"];
        readonly catchAllPathParams: readonly ["path"];
        readonly file: "app/api/v1/agents/[agentId]/n8n/[...path]/route.ts";
    };
    readonly "DELETE /api/v1/agents/{agentId}/publish": {
        readonly method: "DELETE";
        readonly path: "/api/v1/agents/{agentId}/publish";
        readonly methodName: "deleteApiV1AgentsByAgentIdPublish";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/[agentId]/publish/route.ts";
    };
    readonly "DELETE /api/v1/api-keys/{id}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/api-keys/{id}";
        readonly methodName: "deleteApiV1ApiKeysById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/api-keys/[id]/route.ts";
    };
    readonly "DELETE /api/v1/app-builder/sessions/{sessionId}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}";
        readonly methodName: "deleteApiV1AppBuilderSessionsBySessionId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/route.ts";
    };
    readonly "DELETE /api/v1/apps/{id}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/apps/{id}";
        readonly methodName: "deleteApiV1AppsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/route.ts";
    };
    readonly "DELETE /api/v1/apps/{id}/discord-automation": {
        readonly method: "DELETE";
        readonly path: "/api/v1/apps/{id}/discord-automation";
        readonly methodName: "deleteApiV1AppsByIdDiscordAutomation";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/discord-automation/route.ts";
    };
    readonly "DELETE /api/v1/apps/{id}/domains": {
        readonly method: "DELETE";
        readonly path: "/api/v1/apps/{id}/domains";
        readonly methodName: "deleteApiV1AppsByIdDomains";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/domains/route.ts";
    };
    readonly "DELETE /api/v1/apps/{id}/telegram-automation": {
        readonly method: "DELETE";
        readonly path: "/api/v1/apps/{id}/telegram-automation";
        readonly methodName: "deleteApiV1AppsByIdTelegramAutomation";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/telegram-automation/route.ts";
    };
    readonly "DELETE /api/v1/apps/{id}/twitter-automation": {
        readonly method: "DELETE";
        readonly path: "/api/v1/apps/{id}/twitter-automation";
        readonly methodName: "deleteApiV1AppsByIdTwitterAutomation";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/twitter-automation/route.ts";
    };
    readonly "DELETE /api/v1/blooio/disconnect": {
        readonly method: "DELETE";
        readonly path: "/api/v1/blooio/disconnect";
        readonly methodName: "deleteApiV1BlooioDisconnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/blooio/disconnect/route.ts";
    };
    readonly "DELETE /api/v1/browser/sessions/{id}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/browser/sessions/{id}";
        readonly methodName: "deleteApiV1BrowserSessionsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/browser/sessions/[id]/route.ts";
    };
    readonly "DELETE /api/v1/connections/{platform}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/connections/{platform}";
        readonly methodName: "deleteApiV1ConnectionsByPlatform";
        readonly responseMode: "json";
        readonly pathParams: readonly ["platform"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/connections/[platform]/route.ts";
    };
    readonly "DELETE /api/v1/containers/{id}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/containers/{id}";
        readonly methodName: "deleteApiV1ContainersById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/[id]/route.ts";
    };
    readonly "DELETE /api/v1/discord/connections/{id}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/discord/connections/{id}";
        readonly methodName: "deleteApiV1DiscordConnectionsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/connections/[id]/route.ts";
    };
    readonly "DELETE /api/v1/knowledge/{id}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/knowledge/{id}";
        readonly methodName: "deleteApiV1KnowledgeById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/knowledge/[id]/route.ts";
    };
    readonly "DELETE /api/v1/knowledge/pre-upload": {
        readonly method: "DELETE";
        readonly path: "/api/v1/knowledge/pre-upload";
        readonly methodName: "deleteApiV1KnowledgePreUpload";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/knowledge/pre-upload/route.ts";
    };
    readonly "DELETE /api/v1/mcps/{mcpId}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/mcps/{mcpId}";
        readonly methodName: "deleteApiV1McpsByMcpId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["mcpId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/mcps/[mcpId]/route.ts";
    };
    readonly "DELETE /api/v1/mcps/{mcpId}/publish": {
        readonly method: "DELETE";
        readonly path: "/api/v1/mcps/{mcpId}/publish";
        readonly methodName: "deleteApiV1McpsByMcpIdPublish";
        readonly responseMode: "json";
        readonly pathParams: readonly ["mcpId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/mcps/[mcpId]/publish/route.ts";
    };
    readonly "DELETE /api/v1/milady/agents/{agentId}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/milady/agents/{agentId}";
        readonly methodName: "deleteApiV1MiladyAgentsByAgentId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/route.ts";
    };
    readonly "DELETE /api/v1/milady/agents/{agentId}/discord": {
        readonly method: "DELETE";
        readonly path: "/api/v1/milady/agents/{agentId}/discord";
        readonly methodName: "deleteApiV1MiladyAgentsByAgentIdDiscord";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/discord/route.ts";
    };
    readonly "DELETE /api/v1/milady/agents/{agentId}/github": {
        readonly method: "DELETE";
        readonly path: "/api/v1/milady/agents/{agentId}/github";
        readonly methodName: "deleteApiV1MiladyAgentsByAgentIdGithub";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/github/route.ts";
    };
    readonly "DELETE /api/v1/milady/gateway-relay/sessions/{sessionId}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/milady/gateway-relay/sessions/{sessionId}";
        readonly methodName: "deleteApiV1MiladyGatewayRelaySessionsBySessionId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/gateway-relay/sessions/[sessionId]/route.ts";
    };
    readonly "DELETE /api/v1/milady/google/calendar/events/{eventId}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/milady/google/calendar/events/{eventId}";
        readonly methodName: "deleteApiV1MiladyGoogleCalendarEventsByEventId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["eventId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/calendar/events/[eventId]/route.ts";
    };
    readonly "DELETE /api/v1/oauth/connections/{id}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/oauth/connections/{id}";
        readonly methodName: "deleteApiV1OauthConnectionsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/connections/[id]/route.ts";
    };
    readonly "DELETE /api/v1/telegram/disconnect": {
        readonly method: "DELETE";
        readonly path: "/api/v1/telegram/disconnect";
        readonly methodName: "deleteApiV1TelegramDisconnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/telegram/disconnect/route.ts";
    };
    readonly "DELETE /api/v1/twilio/disconnect": {
        readonly method: "DELETE";
        readonly path: "/api/v1/twilio/disconnect";
        readonly methodName: "deleteApiV1TwilioDisconnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/twilio/disconnect/route.ts";
    };
    readonly "DELETE /api/v1/twitter/disconnect": {
        readonly method: "DELETE";
        readonly path: "/api/v1/twitter/disconnect";
        readonly methodName: "deleteApiV1TwitterDisconnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/twitter/disconnect/route.ts";
    };
    readonly "DELETE /api/v1/voice/{id}": {
        readonly method: "DELETE";
        readonly path: "/api/v1/voice/{id}";
        readonly methodName: "deleteApiV1VoiceById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/voice/[id]/route.ts";
    };
    readonly "DELETE /api/v1/whatsapp/disconnect": {
        readonly method: "DELETE";
        readonly path: "/api/v1/whatsapp/disconnect";
        readonly methodName: "deleteApiV1WhatsappDisconnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/whatsapp/disconnect/route.ts";
    };
    readonly "GET /api/elevenlabs/voices": {
        readonly method: "GET";
        readonly path: "/api/elevenlabs/voices";
        readonly methodName: "getApiElevenlabsVoices";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/elevenlabs/voices/route.ts";
    };
    readonly "GET /api/elevenlabs/voices/{id}": {
        readonly method: "GET";
        readonly path: "/api/elevenlabs/voices/{id}";
        readonly methodName: "getApiElevenlabsVoicesById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/elevenlabs/voices/[id]/route.ts";
    };
    readonly "GET /api/elevenlabs/voices/jobs": {
        readonly method: "GET";
        readonly path: "/api/elevenlabs/voices/jobs";
        readonly methodName: "getApiElevenlabsVoicesJobs";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/elevenlabs/voices/jobs/route.ts";
    };
    readonly "GET /api/elevenlabs/voices/user": {
        readonly method: "GET";
        readonly path: "/api/elevenlabs/voices/user";
        readonly methodName: "getApiElevenlabsVoicesUser";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/elevenlabs/voices/user/route.ts";
    };
    readonly "GET /api/elevenlabs/voices/verify/{id}": {
        readonly method: "GET";
        readonly path: "/api/elevenlabs/voices/verify/{id}";
        readonly methodName: "getApiElevenlabsVoicesVerifyById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/elevenlabs/voices/verify/[id]/route.ts";
    };
    readonly "GET /api/v1/admin/ai-pricing": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ai-pricing";
        readonly methodName: "getApiV1AdminAiPricing";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/ai-pricing/route.ts";
    };
    readonly "GET /api/v1/admin/docker-containers": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/docker-containers";
        readonly methodName: "getApiV1AdminDockerContainers";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/docker-containers/route.ts";
    };
    readonly "GET /api/v1/admin/docker-containers/{id}/logs": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/docker-containers/{id}/logs";
        readonly methodName: "getApiV1AdminDockerContainersByIdLogs";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/docker-containers/[id]/logs/route.ts";
    };
    readonly "GET /api/v1/admin/docker-nodes": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/docker-nodes";
        readonly methodName: "getApiV1AdminDockerNodes";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/docker-nodes/route.ts";
    };
    readonly "GET /api/v1/admin/docker-nodes/{nodeId}": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/docker-nodes/{nodeId}";
        readonly methodName: "getApiV1AdminDockerNodesByNodeId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["nodeId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/docker-nodes/[nodeId]/route.ts";
    };
    readonly "GET /api/v1/admin/headscale": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/headscale";
        readonly methodName: "getApiV1AdminHeadscale";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/headscale/route.ts";
    };
    readonly "GET /api/v1/admin/infrastructure": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/infrastructure";
        readonly methodName: "getApiV1AdminInfrastructure";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/infrastructure/route.ts";
    };
    readonly "GET /api/v1/admin/metrics": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/metrics";
        readonly methodName: "getApiV1AdminMetrics";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/metrics/route.ts";
    };
    readonly "GET /api/v1/admin/moderation": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/moderation";
        readonly methodName: "getApiV1AdminModeration";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/moderation/route.ts";
    };
    readonly "GET /api/v1/admin/orgs/{orgId}/rate-limits": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/orgs/{orgId}/rate-limits";
        readonly methodName: "getApiV1AdminOrgsByOrgIdRateLimits";
        readonly responseMode: "json";
        readonly pathParams: readonly ["orgId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/orgs/[orgId]/rate-limits/route.ts";
    };
    readonly "GET /api/v1/admin/service-pricing": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/service-pricing";
        readonly methodName: "getApiV1AdminServicePricing";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/service-pricing/route.ts";
    };
    readonly "GET /api/v1/admin/service-pricing/audit": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/service-pricing/audit";
        readonly methodName: "getApiV1AdminServicePricingAudit";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/service-pricing/audit/route.ts";
    };
    readonly "GET /api/v1/admin/users/{userId}/billing/breakdown": {
        readonly method: "GET";
        readonly path: "/api/v1/admin/users/{userId}/billing/breakdown";
        readonly methodName: "getApiV1AdminUsersByUserIdBillingBreakdown";
        readonly responseMode: "json";
        readonly pathParams: readonly ["userId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/users/[userId]/billing/breakdown/route.ts";
    };
    readonly "GET /api/v1/advertising/accounts": {
        readonly method: "GET";
        readonly path: "/api/v1/advertising/accounts";
        readonly methodName: "getApiV1AdvertisingAccounts";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/accounts/route.ts";
    };
    readonly "GET /api/v1/advertising/accounts/{id}": {
        readonly method: "GET";
        readonly path: "/api/v1/advertising/accounts/{id}";
        readonly methodName: "getApiV1AdvertisingAccountsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/accounts/[id]/route.ts";
    };
    readonly "GET /api/v1/advertising/campaigns": {
        readonly method: "GET";
        readonly path: "/api/v1/advertising/campaigns";
        readonly methodName: "getApiV1AdvertisingCampaigns";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/campaigns/route.ts";
    };
    readonly "GET /api/v1/advertising/campaigns/{id}": {
        readonly method: "GET";
        readonly path: "/api/v1/advertising/campaigns/{id}";
        readonly methodName: "getApiV1AdvertisingCampaignsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/campaigns/[id]/route.ts";
    };
    readonly "GET /api/v1/advertising/campaigns/{id}/analytics": {
        readonly method: "GET";
        readonly path: "/api/v1/advertising/campaigns/{id}/analytics";
        readonly methodName: "getApiV1AdvertisingCampaignsByIdAnalytics";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/campaigns/[id]/analytics/route.ts";
    };
    readonly "GET /api/v1/advertising/campaigns/{id}/creatives": {
        readonly method: "GET";
        readonly path: "/api/v1/advertising/campaigns/{id}/creatives";
        readonly methodName: "getApiV1AdvertisingCampaignsByIdCreatives";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/campaigns/[id]/creatives/route.ts";
    };
    readonly "GET /api/v1/affiliates": {
        readonly method: "GET";
        readonly path: "/api/v1/affiliates";
        readonly methodName: "getApiV1Affiliates";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/affiliates/route.ts";
    };
    readonly "GET /api/v1/agents/{agentId}": {
        readonly method: "GET";
        readonly path: "/api/v1/agents/{agentId}";
        readonly methodName: "getApiV1AgentsByAgentId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/[agentId]/route.ts";
    };
    readonly "GET /api/v1/agents/{agentId}/logs": {
        readonly method: "GET";
        readonly path: "/api/v1/agents/{agentId}/logs";
        readonly methodName: "getApiV1AgentsByAgentIdLogs";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/[agentId]/logs/route.ts";
    };
    readonly "GET /api/v1/agents/{agentId}/monetization": {
        readonly method: "GET";
        readonly path: "/api/v1/agents/{agentId}/monetization";
        readonly methodName: "getApiV1AgentsByAgentIdMonetization";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/[agentId]/monetization/route.ts";
    };
    readonly "GET /api/v1/agents/{agentId}/n8n/{path}": {
        readonly method: "GET";
        readonly path: "/api/v1/agents/{agentId}/n8n/{path}";
        readonly methodName: "getApiV1AgentsByAgentIdN8nByPath";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId", "path"];
        readonly catchAllPathParams: readonly ["path"];
        readonly file: "app/api/v1/agents/[agentId]/n8n/[...path]/route.ts";
    };
    readonly "GET /api/v1/agents/{agentId}/status": {
        readonly method: "GET";
        readonly path: "/api/v1/agents/{agentId}/status";
        readonly methodName: "getApiV1AgentsByAgentIdStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/[agentId]/status/route.ts";
    };
    readonly "GET /api/v1/agents/{agentId}/usage": {
        readonly method: "GET";
        readonly path: "/api/v1/agents/{agentId}/usage";
        readonly methodName: "getApiV1AgentsByAgentIdUsage";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/[agentId]/usage/route.ts";
    };
    readonly "GET /api/v1/agents/by-token": {
        readonly method: "GET";
        readonly path: "/api/v1/agents/by-token";
        readonly methodName: "getApiV1AgentsByToken";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/by-token/route.ts";
    };
    readonly "GET /api/v1/api-keys": {
        readonly method: "GET";
        readonly path: "/api/v1/api-keys";
        readonly methodName: "getApiV1ApiKeys";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/api-keys/route.ts";
    };
    readonly "GET /api/v1/api-keys/explorer": {
        readonly method: "GET";
        readonly path: "/api/v1/api-keys/explorer";
        readonly methodName: "getApiV1ApiKeysExplorer";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/api-keys/explorer/route.ts";
    };
    readonly "GET /api/v1/app-auth/session": {
        readonly method: "GET";
        readonly path: "/api/v1/app-auth/session";
        readonly methodName: "getApiV1AppAuthSession";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-auth/session/route.ts";
    };
    readonly "GET /api/v1/app-builder": {
        readonly method: "GET";
        readonly path: "/api/v1/app-builder";
        readonly methodName: "getApiV1AppBuilder";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/route.ts";
    };
    readonly "GET /api/v1/app-builder/sessions/{sessionId}": {
        readonly method: "GET";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}";
        readonly methodName: "getApiV1AppBuilderSessionsBySessionId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/route.ts";
    };
    readonly "GET /api/v1/app-builder/sessions/{sessionId}/commit": {
        readonly method: "GET";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/commit";
        readonly methodName: "getApiV1AppBuilderSessionsBySessionIdCommit";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/commit/route.ts";
    };
    readonly "GET /api/v1/app-builder/sessions/{sessionId}/files": {
        readonly method: "GET";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/files";
        readonly methodName: "getApiV1AppBuilderSessionsBySessionIdFiles";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/files/route.ts";
    };
    readonly "GET /api/v1/app-builder/sessions/{sessionId}/history": {
        readonly method: "GET";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/history";
        readonly methodName: "getApiV1AppBuilderSessionsBySessionIdHistory";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/history/route.ts";
    };
    readonly "GET /api/v1/app-builder/sessions/{sessionId}/logs": {
        readonly method: "GET";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/logs";
        readonly methodName: "getApiV1AppBuilderSessionsBySessionIdLogs";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/logs/route.ts";
    };
    readonly "GET /api/v1/app-builder/sessions/{sessionId}/prompts/stream": {
        readonly method: "GET";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/prompts/stream";
        readonly methodName: "getApiV1AppBuilderSessionsBySessionIdPromptsStream";
        readonly responseMode: "stream";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/prompts/stream/route.ts";
    };
    readonly "GET /api/v1/app-builder/sessions/{sessionId}/snapshots": {
        readonly method: "GET";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/snapshots";
        readonly methodName: "getApiV1AppBuilderSessionsBySessionIdSnapshots";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/snapshots/route.ts";
    };
    readonly "GET /api/v1/app-builder/sessions/{sessionId}/terminal": {
        readonly method: "GET";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/terminal";
        readonly methodName: "getApiV1AppBuilderSessionsBySessionIdTerminal";
        readonly responseMode: "stream";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/terminal/route.ts";
    };
    readonly "GET /api/v1/app-credits/balance": {
        readonly method: "GET";
        readonly path: "/api/v1/app-credits/balance";
        readonly methodName: "getApiV1AppCreditsBalance";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-credits/balance/route.ts";
    };
    readonly "GET /api/v1/app-credits/verify": {
        readonly method: "GET";
        readonly path: "/api/v1/app-credits/verify";
        readonly methodName: "getApiV1AppCreditsVerify";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-credits/verify/route.ts";
    };
    readonly "GET /api/v1/apps": {
        readonly method: "GET";
        readonly path: "/api/v1/apps";
        readonly methodName: "getApiV1Apps";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/route.ts";
    };
    readonly "GET /api/v1/apps/{id}": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}";
        readonly methodName: "getApiV1AppsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/analytics": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/analytics";
        readonly methodName: "getApiV1AppsByIdAnalytics";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/analytics/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/analytics/requests": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/analytics/requests";
        readonly methodName: "getApiV1AppsByIdAnalyticsRequests";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/analytics/requests/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/characters": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/characters";
        readonly methodName: "getApiV1AppsByIdCharacters";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/characters/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/deploy": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/deploy";
        readonly methodName: "getApiV1AppsByIdDeploy";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/deploy/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/discord-automation": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/discord-automation";
        readonly methodName: "getApiV1AppsByIdDiscordAutomation";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/discord-automation/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/domains": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/domains";
        readonly methodName: "getApiV1AppsByIdDomains";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/domains/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/earnings": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/earnings";
        readonly methodName: "getApiV1AppsByIdEarnings";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/earnings/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/earnings/history": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/earnings/history";
        readonly methodName: "getApiV1AppsByIdEarningsHistory";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/earnings/history/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/monetization": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/monetization";
        readonly methodName: "getApiV1AppsByIdMonetization";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/monetization/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/promote": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/promote";
        readonly methodName: "getApiV1AppsByIdPromote";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/promote/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/promote/analytics": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/promote/analytics";
        readonly methodName: "getApiV1AppsByIdPromoteAnalytics";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/promote/analytics/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/promote/assets": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/promote/assets";
        readonly methodName: "getApiV1AppsByIdPromoteAssets";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/promote/assets/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/public": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/public";
        readonly methodName: "getApiV1AppsByIdPublic";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/public/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/telegram-automation": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/telegram-automation";
        readonly methodName: "getApiV1AppsByIdTelegramAutomation";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/telegram-automation/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/twitter-automation": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/twitter-automation";
        readonly methodName: "getApiV1AppsByIdTwitterAutomation";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/twitter-automation/route.ts";
    };
    readonly "GET /api/v1/apps/{id}/users": {
        readonly method: "GET";
        readonly path: "/api/v1/apps/{id}/users";
        readonly methodName: "getApiV1AppsByIdUsers";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/users/route.ts";
    };
    readonly "GET /api/v1/billing/settings": {
        readonly method: "GET";
        readonly path: "/api/v1/billing/settings";
        readonly methodName: "getApiV1BillingSettings";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/billing/settings/route.ts";
    };
    readonly "GET /api/v1/blooio/status": {
        readonly method: "GET";
        readonly path: "/api/v1/blooio/status";
        readonly methodName: "getApiV1BlooioStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/blooio/status/route.ts";
    };
    readonly "GET /api/v1/browser/sessions": {
        readonly method: "GET";
        readonly path: "/api/v1/browser/sessions";
        readonly methodName: "getApiV1BrowserSessions";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/browser/sessions/route.ts";
    };
    readonly "GET /api/v1/browser/sessions/{id}": {
        readonly method: "GET";
        readonly path: "/api/v1/browser/sessions/{id}";
        readonly methodName: "getApiV1BrowserSessionsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/browser/sessions/[id]/route.ts";
    };
    readonly "GET /api/v1/browser/sessions/{id}/snapshot": {
        readonly method: "GET";
        readonly path: "/api/v1/browser/sessions/{id}/snapshot";
        readonly methodName: "getApiV1BrowserSessionsByIdSnapshot";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/browser/sessions/[id]/snapshot/route.ts";
    };
    readonly "GET /api/v1/chain/nfts/{chain}/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/chain/nfts/{chain}/{address}";
        readonly methodName: "getApiV1ChainNftsByChainByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain", "address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/chain/nfts/[chain]/[address]/route.ts";
    };
    readonly "GET /api/v1/chain/tokens/{chain}/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/chain/tokens/{chain}/{address}";
        readonly methodName: "getApiV1ChainTokensByChainByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain", "address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/chain/tokens/[chain]/[address]/route.ts";
    };
    readonly "GET /api/v1/chain/transfers/{chain}/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/chain/transfers/{chain}/{address}";
        readonly methodName: "getApiV1ChainTransfersByChainByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain", "address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/chain/transfers/[chain]/[address]/route.ts";
    };
    readonly "GET /api/v1/containers": {
        readonly method: "GET";
        readonly path: "/api/v1/containers";
        readonly methodName: "getApiV1Containers";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/route.ts";
    };
    readonly "GET /api/v1/containers/{id}": {
        readonly method: "GET";
        readonly path: "/api/v1/containers/{id}";
        readonly methodName: "getApiV1ContainersById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/[id]/route.ts";
    };
    readonly "GET /api/v1/containers/{id}/deployments": {
        readonly method: "GET";
        readonly path: "/api/v1/containers/{id}/deployments";
        readonly methodName: "getApiV1ContainersByIdDeployments";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/[id]/deployments/route.ts";
    };
    readonly "GET /api/v1/containers/{id}/health": {
        readonly method: "GET";
        readonly path: "/api/v1/containers/{id}/health";
        readonly methodName: "getApiV1ContainersByIdHealth";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/[id]/health/route.ts";
    };
    readonly "GET /api/v1/containers/{id}/logs": {
        readonly method: "GET";
        readonly path: "/api/v1/containers/{id}/logs";
        readonly methodName: "getApiV1ContainersByIdLogs";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/[id]/logs/route.ts";
    };
    readonly "GET /api/v1/containers/{id}/logs/stream": {
        readonly method: "GET";
        readonly path: "/api/v1/containers/{id}/logs/stream";
        readonly methodName: "getApiV1ContainersByIdLogsStream";
        readonly responseMode: "stream";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/[id]/logs/stream/route.ts";
    };
    readonly "GET /api/v1/containers/{id}/metrics": {
        readonly method: "GET";
        readonly path: "/api/v1/containers/{id}/metrics";
        readonly methodName: "getApiV1ContainersByIdMetrics";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/[id]/metrics/route.ts";
    };
    readonly "GET /api/v1/containers/quota": {
        readonly method: "GET";
        readonly path: "/api/v1/containers/quota";
        readonly methodName: "getApiV1ContainersQuota";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/quota/route.ts";
    };
    readonly "GET /api/v1/credits/balance": {
        readonly method: "GET";
        readonly path: "/api/v1/credits/balance";
        readonly methodName: "getApiV1CreditsBalance";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/credits/balance/route.ts";
    };
    readonly "GET /api/v1/credits/summary": {
        readonly method: "GET";
        readonly path: "/api/v1/credits/summary";
        readonly methodName: "getApiV1CreditsSummary";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/credits/summary/route.ts";
    };
    readonly "GET /api/v1/credits/verify": {
        readonly method: "GET";
        readonly path: "/api/v1/credits/verify";
        readonly methodName: "getApiV1CreditsVerify";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/credits/verify/route.ts";
    };
    readonly "GET /api/v1/cron/deployment-monitor": {
        readonly method: "GET";
        readonly path: "/api/v1/cron/deployment-monitor";
        readonly methodName: "getApiV1CronDeploymentMonitor";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/cron/deployment-monitor/route.ts";
    };
    readonly "GET /api/v1/cron/health-check": {
        readonly method: "GET";
        readonly path: "/api/v1/cron/health-check";
        readonly methodName: "getApiV1CronHealthCheck";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/cron/health-check/route.ts";
    };
    readonly "GET /api/v1/cron/process-provisioning-jobs": {
        readonly method: "GET";
        readonly path: "/api/v1/cron/process-provisioning-jobs";
        readonly methodName: "getApiV1CronProcessProvisioningJobs";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/cron/process-provisioning-jobs/route.ts";
    };
    readonly "GET /api/v1/cron/refresh-model-catalog": {
        readonly method: "GET";
        readonly path: "/api/v1/cron/refresh-model-catalog";
        readonly methodName: "getApiV1CronRefreshModelCatalog";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/cron/refresh-model-catalog/route.ts";
    };
    readonly "GET /api/v1/cron/refresh-pricing": {
        readonly method: "GET";
        readonly path: "/api/v1/cron/refresh-pricing";
        readonly methodName: "getApiV1CronRefreshPricing";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/cron/refresh-pricing/route.ts";
    };
    readonly "GET /api/v1/dashboard": {
        readonly method: "GET";
        readonly path: "/api/v1/dashboard";
        readonly methodName: "getApiV1Dashboard";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/dashboard/route.ts";
    };
    readonly "GET /api/v1/device-bus/devices/{deviceId}/intents": {
        readonly method: "GET";
        readonly path: "/api/v1/device-bus/devices/{deviceId}/intents";
        readonly methodName: "getApiV1DeviceBusDevicesByDeviceIdIntents";
        readonly responseMode: "json";
        readonly pathParams: readonly ["deviceId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/device-bus/devices/[deviceId]/intents/route.ts";
    };
    readonly "GET /api/v1/discord/callback": {
        readonly method: "GET";
        readonly path: "/api/v1/discord/callback";
        readonly methodName: "getApiV1DiscordCallback";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/callback/route.ts";
    };
    readonly "GET /api/v1/discord/channels": {
        readonly method: "GET";
        readonly path: "/api/v1/discord/channels";
        readonly methodName: "getApiV1DiscordChannels";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/channels/route.ts";
    };
    readonly "GET /api/v1/discord/connections": {
        readonly method: "GET";
        readonly path: "/api/v1/discord/connections";
        readonly methodName: "getApiV1DiscordConnections";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/connections/route.ts";
    };
    readonly "GET /api/v1/discord/connections/{id}": {
        readonly method: "GET";
        readonly path: "/api/v1/discord/connections/{id}";
        readonly methodName: "getApiV1DiscordConnectionsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/connections/[id]/route.ts";
    };
    readonly "GET /api/v1/discord/guilds": {
        readonly method: "GET";
        readonly path: "/api/v1/discord/guilds";
        readonly methodName: "getApiV1DiscordGuilds";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/guilds/route.ts";
    };
    readonly "GET /api/v1/discord/oauth": {
        readonly method: "GET";
        readonly path: "/api/v1/discord/oauth";
        readonly methodName: "getApiV1DiscordOauth";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/oauth/route.ts";
    };
    readonly "GET /api/v1/discord/status": {
        readonly method: "GET";
        readonly path: "/api/v1/discord/status";
        readonly methodName: "getApiV1DiscordStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/status/route.ts";
    };
    readonly "GET /api/v1/discovery": {
        readonly method: "GET";
        readonly path: "/api/v1/discovery";
        readonly methodName: "getApiV1Discovery";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discovery/route.ts";
    };
    readonly "GET /api/v1/eliza/launch-sessions/{sessionId}": {
        readonly method: "GET";
        readonly path: "/api/v1/eliza/launch-sessions/{sessionId}";
        readonly methodName: "getApiV1ElizaLaunchSessionsBySessionId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/eliza/launch-sessions/[sessionId]/route.ts";
    };
    readonly "GET /api/v1/gallery": {
        readonly method: "GET";
        readonly path: "/api/v1/gallery";
        readonly methodName: "getApiV1Gallery";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/gallery/route.ts";
    };
    readonly "GET /api/v1/jobs/{jobId}": {
        readonly method: "GET";
        readonly path: "/api/v1/jobs/{jobId}";
        readonly methodName: "getApiV1JobsByJobId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["jobId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/jobs/[jobId]/route.ts";
    };
    readonly "GET /api/v1/knowledge": {
        readonly method: "GET";
        readonly path: "/api/v1/knowledge";
        readonly methodName: "getApiV1Knowledge";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/knowledge/route.ts";
    };
    readonly "GET /api/v1/knowledge/check": {
        readonly method: "GET";
        readonly path: "/api/v1/knowledge/check";
        readonly methodName: "getApiV1KnowledgeCheck";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/knowledge/check/route.ts";
    };
    readonly "GET /api/v1/market/candles/{chain}/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/market/candles/{chain}/{address}";
        readonly methodName: "getApiV1MarketCandlesByChainByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain", "address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/market/candles/[chain]/[address]/route.ts";
    };
    readonly "GET /api/v1/market/portfolio/{chain}/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/market/portfolio/{chain}/{address}";
        readonly methodName: "getApiV1MarketPortfolioByChainByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain", "address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/market/portfolio/[chain]/[address]/route.ts";
    };
    readonly "GET /api/v1/market/preview/portfolio/{chain}/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/market/preview/portfolio/{chain}/{address}";
        readonly methodName: "getApiV1MarketPreviewPortfolioByChainByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain", "address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/market/preview/portfolio/[chain]/[address]/route.ts";
    };
    readonly "GET /api/v1/market/preview/predictions": {
        readonly method: "GET";
        readonly path: "/api/v1/market/preview/predictions";
        readonly methodName: "getApiV1MarketPreviewPredictions";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/market/preview/predictions/route.ts";
    };
    readonly "GET /api/v1/market/preview/price/{chain}/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/market/preview/price/{chain}/{address}";
        readonly methodName: "getApiV1MarketPreviewPriceByChainByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain", "address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/market/preview/price/[chain]/[address]/route.ts";
    };
    readonly "GET /api/v1/market/preview/token/{chain}/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/market/preview/token/{chain}/{address}";
        readonly methodName: "getApiV1MarketPreviewTokenByChainByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain", "address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/market/preview/token/[chain]/[address]/route.ts";
    };
    readonly "GET /api/v1/market/preview/wallet-overview": {
        readonly method: "GET";
        readonly path: "/api/v1/market/preview/wallet-overview";
        readonly methodName: "getApiV1MarketPreviewWalletOverview";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/market/preview/wallet-overview/route.ts";
    };
    readonly "GET /api/v1/market/price/{chain}/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/market/price/{chain}/{address}";
        readonly methodName: "getApiV1MarketPriceByChainByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain", "address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/market/price/[chain]/[address]/route.ts";
    };
    readonly "GET /api/v1/market/token/{chain}/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/market/token/{chain}/{address}";
        readonly methodName: "getApiV1MarketTokenByChainByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain", "address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/market/token/[chain]/[address]/route.ts";
    };
    readonly "GET /api/v1/market/trades/{chain}/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/market/trades/{chain}/{address}";
        readonly methodName: "getApiV1MarketTradesByChainByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain", "address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/market/trades/[chain]/[address]/route.ts";
    };
    readonly "GET /api/v1/mcps": {
        readonly method: "GET";
        readonly path: "/api/v1/mcps";
        readonly methodName: "getApiV1Mcps";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/mcps/route.ts";
    };
    readonly "GET /api/v1/mcps/{mcpId}": {
        readonly method: "GET";
        readonly path: "/api/v1/mcps/{mcpId}";
        readonly methodName: "getApiV1McpsByMcpId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["mcpId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/mcps/[mcpId]/route.ts";
    };
    readonly "GET /api/v1/milady/agents": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/agents";
        readonly methodName: "getApiV1MiladyAgents";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/route.ts";
    };
    readonly "GET /api/v1/milady/agents/{agentId}": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/agents/{agentId}";
        readonly methodName: "getApiV1MiladyAgentsByAgentId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/route.ts";
    };
    readonly "GET /api/v1/milady/agents/{agentId}/api/wallet/{path}": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/agents/{agentId}/api/wallet/{path}";
        readonly methodName: "getApiV1MiladyAgentsByAgentIdApiWalletByPath";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId", "path"];
        readonly catchAllPathParams: readonly ["path"];
        readonly file: "app/api/v1/milady/agents/[agentId]/api/wallet/[...path]/route.ts";
    };
    readonly "GET /api/v1/milady/agents/{agentId}/backups": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/agents/{agentId}/backups";
        readonly methodName: "getApiV1MiladyAgentsByAgentIdBackups";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/backups/route.ts";
    };
    readonly "GET /api/v1/milady/agents/{agentId}/discord": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/agents/{agentId}/discord";
        readonly methodName: "getApiV1MiladyAgentsByAgentIdDiscord";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/discord/route.ts";
    };
    readonly "GET /api/v1/milady/agents/{agentId}/github": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/agents/{agentId}/github";
        readonly methodName: "getApiV1MiladyAgentsByAgentIdGithub";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/github/route.ts";
    };
    readonly "GET /api/v1/milady/agents/{agentId}/github/token": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/agents/{agentId}/github/token";
        readonly methodName: "getApiV1MiladyAgentsByAgentIdGithubToken";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/github/token/route.ts";
    };
    readonly "GET /api/v1/milady/agents/{agentId}/lifeops/schedule/merged-state": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/agents/{agentId}/lifeops/schedule/merged-state";
        readonly methodName: "getApiV1MiladyAgentsByAgentIdLifeopsScheduleMergedState";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/lifeops/schedule/merged-state/route.ts";
    };
    readonly "GET /api/v1/milady/agents/{agentId}/wallet": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/agents/{agentId}/wallet";
        readonly methodName: "getApiV1MiladyAgentsByAgentIdWallet";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/wallet/route.ts";
    };
    readonly "GET /api/v1/milady/gateway-relay/sessions/{sessionId}/next": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/gateway-relay/sessions/{sessionId}/next";
        readonly methodName: "getApiV1MiladyGatewayRelaySessionsBySessionIdNext";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/gateway-relay/sessions/[sessionId]/next/route.ts";
    };
    readonly "GET /api/v1/milady/github-oauth-complete": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/github-oauth-complete";
        readonly methodName: "getApiV1MiladyGithubOauthComplete";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/github-oauth-complete/route.ts";
    };
    readonly "GET /api/v1/milady/google/accounts": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/google/accounts";
        readonly methodName: "getApiV1MiladyGoogleAccounts";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/accounts/route.ts";
    };
    readonly "GET /api/v1/milady/google/calendar/feed": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/google/calendar/feed";
        readonly methodName: "getApiV1MiladyGoogleCalendarFeed";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/calendar/feed/route.ts";
    };
    readonly "GET /api/v1/milady/google/gmail/read": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/google/gmail/read";
        readonly methodName: "getApiV1MiladyGoogleGmailRead";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/gmail/read/route.ts";
    };
    readonly "GET /api/v1/milady/google/gmail/search": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/google/gmail/search";
        readonly methodName: "getApiV1MiladyGoogleGmailSearch";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/gmail/search/route.ts";
    };
    readonly "GET /api/v1/milady/google/gmail/subscription-headers": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/google/gmail/subscription-headers";
        readonly methodName: "getApiV1MiladyGoogleGmailSubscriptionHeaders";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/gmail/subscription-headers/route.ts";
    };
    readonly "GET /api/v1/milady/google/gmail/triage": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/google/gmail/triage";
        readonly methodName: "getApiV1MiladyGoogleGmailTriage";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/gmail/triage/route.ts";
    };
    readonly "GET /api/v1/milady/google/status": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/google/status";
        readonly methodName: "getApiV1MiladyGoogleStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/status/route.ts";
    };
    readonly "GET /api/v1/milady/launch-sessions/{sessionId}": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/launch-sessions/{sessionId}";
        readonly methodName: "getApiV1MiladyLaunchSessionsBySessionId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/launch-sessions/[sessionId]/route.ts";
    };
    readonly "GET /api/v1/milady/lifeops/github-complete": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/lifeops/github-complete";
        readonly methodName: "getApiV1MiladyLifeopsGithubComplete";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/lifeops/github-complete/route.ts";
    };
    readonly "GET /api/v1/milady/paypal/popup-callback": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/paypal/popup-callback";
        readonly methodName: "getApiV1MiladyPaypalPopupCallback";
        readonly responseMode: "text";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/paypal/popup-callback/route.ts";
    };
    readonly "GET /api/v1/milady/paypal/status": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/paypal/status";
        readonly methodName: "getApiV1MiladyPaypalStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/paypal/status/route.ts";
    };
    readonly "GET /api/v1/milady/plaid/status": {
        readonly method: "GET";
        readonly path: "/api/v1/milady/plaid/status";
        readonly methodName: "getApiV1MiladyPlaidStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/plaid/status/route.ts";
    };
    readonly "GET /api/v1/models": {
        readonly method: "GET";
        readonly path: "/api/v1/models";
        readonly methodName: "getApiV1Models";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/models/route.ts";
    };
    readonly "GET /api/v1/models/{model}": {
        readonly method: "GET";
        readonly path: "/api/v1/models/{model}";
        readonly methodName: "getApiV1ModelsByModel";
        readonly responseMode: "json";
        readonly pathParams: readonly ["model"];
        readonly catchAllPathParams: readonly ["model"];
        readonly file: "app/api/v1/models/[...model]/route.ts";
    };
    readonly "GET /api/v1/oauth/{platform}/callback": {
        readonly method: "GET";
        readonly path: "/api/v1/oauth/{platform}/callback";
        readonly methodName: "getApiV1OauthByPlatformCallback";
        readonly responseMode: "json";
        readonly pathParams: readonly ["platform"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/[platform]/callback/route.ts";
    };
    readonly "GET /api/v1/oauth/callback": {
        readonly method: "GET";
        readonly path: "/api/v1/oauth/callback";
        readonly methodName: "getApiV1OauthCallback";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/callback/route.ts";
    };
    readonly "GET /api/v1/oauth/connections": {
        readonly method: "GET";
        readonly path: "/api/v1/oauth/connections";
        readonly methodName: "getApiV1OauthConnections";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/connections/route.ts";
    };
    readonly "GET /api/v1/oauth/connections/{id}": {
        readonly method: "GET";
        readonly path: "/api/v1/oauth/connections/{id}";
        readonly methodName: "getApiV1OauthConnectionsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/connections/[id]/route.ts";
    };
    readonly "GET /api/v1/oauth/connections/{id}/token": {
        readonly method: "GET";
        readonly path: "/api/v1/oauth/connections/{id}/token";
        readonly methodName: "getApiV1OauthConnectionsByIdToken";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/connections/[id]/token/route.ts";
    };
    readonly "GET /api/v1/oauth/initiate": {
        readonly method: "GET";
        readonly path: "/api/v1/oauth/initiate";
        readonly methodName: "getApiV1OauthInitiate";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/initiate/route.ts";
    };
    readonly "GET /api/v1/oauth/providers": {
        readonly method: "GET";
        readonly path: "/api/v1/oauth/providers";
        readonly methodName: "getApiV1OauthProviders";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/providers/route.ts";
    };
    readonly "GET /api/v1/oauth/status": {
        readonly method: "GET";
        readonly path: "/api/v1/oauth/status";
        readonly methodName: "getApiV1OauthStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/status/route.ts";
    };
    readonly "GET /api/v1/oauth/token/{platform}": {
        readonly method: "GET";
        readonly path: "/api/v1/oauth/token/{platform}";
        readonly methodName: "getApiV1OauthTokenByPlatform";
        readonly responseMode: "json";
        readonly pathParams: readonly ["platform"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/token/[platform]/route.ts";
    };
    readonly "GET /api/v1/pricing/summary": {
        readonly method: "GET";
        readonly path: "/api/v1/pricing/summary";
        readonly methodName: "getApiV1PricingSummary";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/pricing/summary/route.ts";
    };
    readonly "GET /api/v1/proxy/birdeye/{path}": {
        readonly method: "GET";
        readonly path: "/api/v1/proxy/birdeye/{path}";
        readonly methodName: "getApiV1ProxyBirdeyeByPath";
        readonly responseMode: "json";
        readonly pathParams: readonly ["path"];
        readonly catchAllPathParams: readonly ["path"];
        readonly file: "app/api/v1/proxy/birdeye/[...path]/route.ts";
    };
    readonly "GET /api/v1/redemptions": {
        readonly method: "GET";
        readonly path: "/api/v1/redemptions";
        readonly methodName: "getApiV1Redemptions";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/redemptions/route.ts";
    };
    readonly "GET /api/v1/redemptions/{id}": {
        readonly method: "GET";
        readonly path: "/api/v1/redemptions/{id}";
        readonly methodName: "getApiV1RedemptionsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/redemptions/[id]/route.ts";
    };
    readonly "GET /api/v1/redemptions/balance": {
        readonly method: "GET";
        readonly path: "/api/v1/redemptions/balance";
        readonly methodName: "getApiV1RedemptionsBalance";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/redemptions/balance/route.ts";
    };
    readonly "GET /api/v1/redemptions/quote": {
        readonly method: "GET";
        readonly path: "/api/v1/redemptions/quote";
        readonly methodName: "getApiV1RedemptionsQuote";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/redemptions/quote/route.ts";
    };
    readonly "GET /api/v1/redemptions/status": {
        readonly method: "GET";
        readonly path: "/api/v1/redemptions/status";
        readonly methodName: "getApiV1RedemptionsStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/redemptions/status/route.ts";
    };
    readonly "GET /api/v1/referrals": {
        readonly method: "GET";
        readonly path: "/api/v1/referrals";
        readonly methodName: "getApiV1Referrals";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/referrals/route.ts";
    };
    readonly "GET /api/v1/remote/sessions": {
        readonly method: "GET";
        readonly path: "/api/v1/remote/sessions";
        readonly methodName: "getApiV1RemoteSessions";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/remote/sessions/route.ts";
    };
    readonly "GET /api/v1/solana/assets/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/solana/assets/{address}";
        readonly methodName: "getApiV1SolanaAssetsByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/solana/assets/[address]/route.ts";
    };
    readonly "GET /api/v1/solana/methods": {
        readonly method: "GET";
        readonly path: "/api/v1/solana/methods";
        readonly methodName: "getApiV1SolanaMethods";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/solana/methods/route.ts";
    };
    readonly "GET /api/v1/solana/token-accounts/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/solana/token-accounts/{address}";
        readonly methodName: "getApiV1SolanaTokenAccountsByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/solana/token-accounts/[address]/route.ts";
    };
    readonly "GET /api/v1/solana/transactions/{address}": {
        readonly method: "GET";
        readonly path: "/api/v1/solana/transactions/{address}";
        readonly methodName: "getApiV1SolanaTransactionsByAddress";
        readonly responseMode: "json";
        readonly pathParams: readonly ["address"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/solana/transactions/[address]/route.ts";
    };
    readonly "GET /api/v1/steward/tenants/credentials": {
        readonly method: "GET";
        readonly path: "/api/v1/steward/tenants/credentials";
        readonly methodName: "getApiV1StewardTenantsCredentials";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/steward/tenants/credentials/route.ts";
    };
    readonly "GET /api/v1/telegram/chats": {
        readonly method: "GET";
        readonly path: "/api/v1/telegram/chats";
        readonly methodName: "getApiV1TelegramChats";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/telegram/chats/route.ts";
    };
    readonly "GET /api/v1/telegram/scan-chats": {
        readonly method: "GET";
        readonly path: "/api/v1/telegram/scan-chats";
        readonly methodName: "getApiV1TelegramScanChats";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/telegram/scan-chats/route.ts";
    };
    readonly "GET /api/v1/telegram/status": {
        readonly method: "GET";
        readonly path: "/api/v1/telegram/status";
        readonly methodName: "getApiV1TelegramStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/telegram/status/route.ts";
    };
    readonly "GET /api/v1/twilio/status": {
        readonly method: "GET";
        readonly path: "/api/v1/twilio/status";
        readonly methodName: "getApiV1TwilioStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/twilio/status/route.ts";
    };
    readonly "GET /api/v1/twitter/callback": {
        readonly method: "GET";
        readonly path: "/api/v1/twitter/callback";
        readonly methodName: "getApiV1TwitterCallback";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/twitter/callback/route.ts";
    };
    readonly "GET /api/v1/twitter/status": {
        readonly method: "GET";
        readonly path: "/api/v1/twitter/status";
        readonly methodName: "getApiV1TwitterStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/twitter/status/route.ts";
    };
    readonly "GET /api/v1/user": {
        readonly method: "GET";
        readonly path: "/api/v1/user";
        readonly methodName: "getApiV1User";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/user/route.ts";
    };
    readonly "GET /api/v1/user/wallets": {
        readonly method: "GET";
        readonly path: "/api/v1/user/wallets";
        readonly methodName: "getApiV1UserWallets";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/user/wallets/route.ts";
    };
    readonly "GET /api/v1/voice/{id}": {
        readonly method: "GET";
        readonly path: "/api/v1/voice/{id}";
        readonly methodName: "getApiV1VoiceById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/voice/[id]/route.ts";
    };
    readonly "GET /api/v1/voice/jobs": {
        readonly method: "GET";
        readonly path: "/api/v1/voice/jobs";
        readonly methodName: "getApiV1VoiceJobs";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/voice/jobs/route.ts";
    };
    readonly "GET /api/v1/voice/list": {
        readonly method: "GET";
        readonly path: "/api/v1/voice/list";
        readonly methodName: "getApiV1VoiceList";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/voice/list/route.ts";
    };
    readonly "GET /api/v1/whatsapp/status": {
        readonly method: "GET";
        readonly path: "/api/v1/whatsapp/status";
        readonly methodName: "getApiV1WhatsappStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/whatsapp/status/route.ts";
    };
    readonly "GET /api/v1/x/dms/digest": {
        readonly method: "GET";
        readonly path: "/api/v1/x/dms/digest";
        readonly methodName: "getApiV1XDmsDigest";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/x/dms/digest/route.ts";
    };
    readonly "GET /api/v1/x/feed": {
        readonly method: "GET";
        readonly path: "/api/v1/x/feed";
        readonly methodName: "getApiV1XFeed";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/x/feed/route.ts";
    };
    readonly "GET /api/v1/x/status": {
        readonly method: "GET";
        readonly path: "/api/v1/x/status";
        readonly methodName: "getApiV1XStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/x/status/route.ts";
    };
    readonly "GET /api/v1/x402": {
        readonly method: "GET";
        readonly path: "/api/v1/x402";
        readonly methodName: "getApiV1X402";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/x402/route.ts";
    };
    readonly "PATCH /api/elevenlabs/voices/{id}": {
        readonly method: "PATCH";
        readonly path: "/api/elevenlabs/voices/{id}";
        readonly methodName: "patchApiElevenlabsVoicesById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/elevenlabs/voices/[id]/route.ts";
    };
    readonly "PATCH /api/v1/admin/docker-nodes/{nodeId}": {
        readonly method: "PATCH";
        readonly path: "/api/v1/admin/docker-nodes/{nodeId}";
        readonly methodName: "patchApiV1AdminDockerNodesByNodeId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["nodeId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/docker-nodes/[nodeId]/route.ts";
    };
    readonly "PATCH /api/v1/admin/orgs/{orgId}/rate-limits": {
        readonly method: "PATCH";
        readonly path: "/api/v1/admin/orgs/{orgId}/rate-limits";
        readonly methodName: "patchApiV1AdminOrgsByOrgIdRateLimits";
        readonly responseMode: "json";
        readonly pathParams: readonly ["orgId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/orgs/[orgId]/rate-limits/route.ts";
    };
    readonly "PATCH /api/v1/advertising/campaigns/{id}": {
        readonly method: "PATCH";
        readonly path: "/api/v1/advertising/campaigns/{id}";
        readonly methodName: "patchApiV1AdvertisingCampaignsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/campaigns/[id]/route.ts";
    };
    readonly "PATCH /api/v1/api-keys/{id}": {
        readonly method: "PATCH";
        readonly path: "/api/v1/api-keys/{id}";
        readonly methodName: "patchApiV1ApiKeysById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/api-keys/[id]/route.ts";
    };
    readonly "PATCH /api/v1/app-builder/sessions/{sessionId}": {
        readonly method: "PATCH";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}";
        readonly methodName: "patchApiV1AppBuilderSessionsBySessionId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/route.ts";
    };
    readonly "PATCH /api/v1/apps/{id}": {
        readonly method: "PATCH";
        readonly path: "/api/v1/apps/{id}";
        readonly methodName: "patchApiV1AppsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/route.ts";
    };
    readonly "PATCH /api/v1/connections/{platform}": {
        readonly method: "PATCH";
        readonly path: "/api/v1/connections/{platform}";
        readonly methodName: "patchApiV1ConnectionsByPlatform";
        readonly responseMode: "json";
        readonly pathParams: readonly ["platform"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/connections/[platform]/route.ts";
    };
    readonly "PATCH /api/v1/containers/{id}": {
        readonly method: "PATCH";
        readonly path: "/api/v1/containers/{id}";
        readonly methodName: "patchApiV1ContainersById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/[id]/route.ts";
    };
    readonly "PATCH /api/v1/discord/connections/{id}": {
        readonly method: "PATCH";
        readonly path: "/api/v1/discord/connections/{id}";
        readonly methodName: "patchApiV1DiscordConnectionsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/connections/[id]/route.ts";
    };
    readonly "PATCH /api/v1/milady/agents/{agentId}": {
        readonly method: "PATCH";
        readonly path: "/api/v1/milady/agents/{agentId}";
        readonly methodName: "patchApiV1MiladyAgentsByAgentId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/route.ts";
    };
    readonly "PATCH /api/v1/milady/google/calendar/events/{eventId}": {
        readonly method: "PATCH";
        readonly path: "/api/v1/milady/google/calendar/events/{eventId}";
        readonly methodName: "patchApiV1MiladyGoogleCalendarEventsByEventId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["eventId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/calendar/events/[eventId]/route.ts";
    };
    readonly "PATCH /api/v1/user": {
        readonly method: "PATCH";
        readonly path: "/api/v1/user";
        readonly methodName: "patchApiV1User";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/user/route.ts";
    };
    readonly "PATCH /api/v1/voice/{id}": {
        readonly method: "PATCH";
        readonly path: "/api/v1/voice/{id}";
        readonly methodName: "patchApiV1VoiceById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/voice/[id]/route.ts";
    };
    readonly "POST /api/elevenlabs/stt": {
        readonly method: "POST";
        readonly path: "/api/elevenlabs/stt";
        readonly methodName: "postApiElevenlabsStt";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/elevenlabs/stt/route.ts";
    };
    readonly "POST /api/elevenlabs/tts": {
        readonly method: "POST";
        readonly path: "/api/elevenlabs/tts";
        readonly methodName: "postApiElevenlabsTts";
        readonly responseMode: "binary";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/elevenlabs/tts/route.ts";
    };
    readonly "POST /api/elevenlabs/voices/clone": {
        readonly method: "POST";
        readonly path: "/api/elevenlabs/voices/clone";
        readonly methodName: "postApiElevenlabsVoicesClone";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/elevenlabs/voices/clone/route.ts";
    };
    readonly "POST /api/v1/admin/ai-pricing": {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ai-pricing";
        readonly methodName: "postApiV1AdminAiPricing";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/ai-pricing/route.ts";
    };
    readonly "POST /api/v1/admin/docker-containers/audit": {
        readonly method: "POST";
        readonly path: "/api/v1/admin/docker-containers/audit";
        readonly methodName: "postApiV1AdminDockerContainersAudit";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/docker-containers/audit/route.ts";
    };
    readonly "POST /api/v1/admin/docker-nodes": {
        readonly method: "POST";
        readonly path: "/api/v1/admin/docker-nodes";
        readonly methodName: "postApiV1AdminDockerNodes";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/docker-nodes/route.ts";
    };
    readonly "POST /api/v1/admin/docker-nodes/{nodeId}/health-check": {
        readonly method: "POST";
        readonly path: "/api/v1/admin/docker-nodes/{nodeId}/health-check";
        readonly methodName: "postApiV1AdminDockerNodesByNodeIdHealthCheck";
        readonly responseMode: "json";
        readonly pathParams: readonly ["nodeId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/docker-nodes/[nodeId]/health-check/route.ts";
    };
    readonly "POST /api/v1/admin/docker-nodes/sync": {
        readonly method: "POST";
        readonly path: "/api/v1/admin/docker-nodes/sync";
        readonly methodName: "postApiV1AdminDockerNodesSync";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/docker-nodes/sync/route.ts";
    };
    readonly "POST /api/v1/admin/infrastructure/containers/actions": {
        readonly method: "POST";
        readonly path: "/api/v1/admin/infrastructure/containers/actions";
        readonly methodName: "postApiV1AdminInfrastructureContainersActions";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/infrastructure/containers/actions/route.ts";
    };
    readonly "POST /api/v1/admin/moderation": {
        readonly method: "POST";
        readonly path: "/api/v1/admin/moderation";
        readonly methodName: "postApiV1AdminModeration";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/moderation/route.ts";
    };
    readonly "POST /api/v1/advertising/accounts": {
        readonly method: "POST";
        readonly path: "/api/v1/advertising/accounts";
        readonly methodName: "postApiV1AdvertisingAccounts";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/accounts/route.ts";
    };
    readonly "POST /api/v1/advertising/campaigns": {
        readonly method: "POST";
        readonly path: "/api/v1/advertising/campaigns";
        readonly methodName: "postApiV1AdvertisingCampaigns";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/campaigns/route.ts";
    };
    readonly "POST /api/v1/advertising/campaigns/{id}/creatives": {
        readonly method: "POST";
        readonly path: "/api/v1/advertising/campaigns/{id}/creatives";
        readonly methodName: "postApiV1AdvertisingCampaignsByIdCreatives";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/campaigns/[id]/creatives/route.ts";
    };
    readonly "POST /api/v1/advertising/campaigns/{id}/pause": {
        readonly method: "POST";
        readonly path: "/api/v1/advertising/campaigns/{id}/pause";
        readonly methodName: "postApiV1AdvertisingCampaignsByIdPause";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/campaigns/[id]/pause/route.ts";
    };
    readonly "POST /api/v1/advertising/campaigns/{id}/start": {
        readonly method: "POST";
        readonly path: "/api/v1/advertising/campaigns/{id}/start";
        readonly methodName: "postApiV1AdvertisingCampaignsByIdStart";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/advertising/campaigns/[id]/start/route.ts";
    };
    readonly "POST /api/v1/affiliates": {
        readonly method: "POST";
        readonly path: "/api/v1/affiliates";
        readonly methodName: "postApiV1Affiliates";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/affiliates/route.ts";
    };
    readonly "POST /api/v1/affiliates/link": {
        readonly method: "POST";
        readonly path: "/api/v1/affiliates/link";
        readonly methodName: "postApiV1AffiliatesLink";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/affiliates/link/route.ts";
    };
    readonly "POST /api/v1/agents": {
        readonly method: "POST";
        readonly path: "/api/v1/agents";
        readonly methodName: "postApiV1Agents";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/route.ts";
    };
    readonly "POST /api/v1/agents/{agentId}/n8n/{path}": {
        readonly method: "POST";
        readonly path: "/api/v1/agents/{agentId}/n8n/{path}";
        readonly methodName: "postApiV1AgentsByAgentIdN8nByPath";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId", "path"];
        readonly catchAllPathParams: readonly ["path"];
        readonly file: "app/api/v1/agents/[agentId]/n8n/[...path]/route.ts";
    };
    readonly "POST /api/v1/agents/{agentId}/publish": {
        readonly method: "POST";
        readonly path: "/api/v1/agents/{agentId}/publish";
        readonly methodName: "postApiV1AgentsByAgentIdPublish";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/[agentId]/publish/route.ts";
    };
    readonly "POST /api/v1/agents/{agentId}/restart": {
        readonly method: "POST";
        readonly path: "/api/v1/agents/{agentId}/restart";
        readonly methodName: "postApiV1AgentsByAgentIdRestart";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/[agentId]/restart/route.ts";
    };
    readonly "POST /api/v1/agents/{agentId}/resume": {
        readonly method: "POST";
        readonly path: "/api/v1/agents/{agentId}/resume";
        readonly methodName: "postApiV1AgentsByAgentIdResume";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/[agentId]/resume/route.ts";
    };
    readonly "POST /api/v1/agents/{agentId}/suspend": {
        readonly method: "POST";
        readonly path: "/api/v1/agents/{agentId}/suspend";
        readonly methodName: "postApiV1AgentsByAgentIdSuspend";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/[agentId]/suspend/route.ts";
    };
    readonly "POST /api/v1/api-keys": {
        readonly method: "POST";
        readonly path: "/api/v1/api-keys";
        readonly methodName: "postApiV1ApiKeys";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/api-keys/route.ts";
    };
    readonly "POST /api/v1/api-keys/{id}/regenerate": {
        readonly method: "POST";
        readonly path: "/api/v1/api-keys/{id}/regenerate";
        readonly methodName: "postApiV1ApiKeysByIdRegenerate";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/api-keys/[id]/regenerate/route.ts";
    };
    readonly "POST /api/v1/app-auth/connect": {
        readonly method: "POST";
        readonly path: "/api/v1/app-auth/connect";
        readonly methodName: "postApiV1AppAuthConnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-auth/connect/route.ts";
    };
    readonly "POST /api/v1/app-builder": {
        readonly method: "POST";
        readonly path: "/api/v1/app-builder";
        readonly methodName: "postApiV1AppBuilder";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/route.ts";
    };
    readonly "POST /api/v1/app-builder/images": {
        readonly method: "POST";
        readonly path: "/api/v1/app-builder/images";
        readonly methodName: "postApiV1AppBuilderImages";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/images/route.ts";
    };
    readonly "POST /api/v1/app-builder/sessions/{sessionId}/commit": {
        readonly method: "POST";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/commit";
        readonly methodName: "postApiV1AppBuilderSessionsBySessionIdCommit";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/commit/route.ts";
    };
    readonly "POST /api/v1/app-builder/sessions/{sessionId}/files": {
        readonly method: "POST";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/files";
        readonly methodName: "postApiV1AppBuilderSessionsBySessionIdFiles";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/files/route.ts";
    };
    readonly "POST /api/v1/app-builder/sessions/{sessionId}/prompts/stream": {
        readonly method: "POST";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/prompts/stream";
        readonly methodName: "postApiV1AppBuilderSessionsBySessionIdPromptsStream";
        readonly responseMode: "stream";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/prompts/stream/route.ts";
    };
    readonly "POST /api/v1/app-builder/sessions/{sessionId}/resume/stream": {
        readonly method: "POST";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/resume/stream";
        readonly methodName: "postApiV1AppBuilderSessionsBySessionIdResumeStream";
        readonly responseMode: "stream";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/resume/stream/route.ts";
    };
    readonly "POST /api/v1/app-builder/sessions/{sessionId}/rollback": {
        readonly method: "POST";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/rollback";
        readonly methodName: "postApiV1AppBuilderSessionsBySessionIdRollback";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/rollback/route.ts";
    };
    readonly "POST /api/v1/app-builder/sessions/{sessionId}/terminal": {
        readonly method: "POST";
        readonly path: "/api/v1/app-builder/sessions/{sessionId}/terminal";
        readonly methodName: "postApiV1AppBuilderSessionsBySessionIdTerminal";
        readonly responseMode: "mixed";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/sessions/[sessionId]/terminal/route.ts";
    };
    readonly "POST /api/v1/app-builder/stream": {
        readonly method: "POST";
        readonly path: "/api/v1/app-builder/stream";
        readonly methodName: "postApiV1AppBuilderStream";
        readonly responseMode: "stream";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-builder/stream/route.ts";
    };
    readonly "POST /api/v1/app-credits/checkout": {
        readonly method: "POST";
        readonly path: "/api/v1/app-credits/checkout";
        readonly methodName: "postApiV1AppCreditsCheckout";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app-credits/checkout/route.ts";
    };
    readonly "POST /api/v1/app/agents": {
        readonly method: "POST";
        readonly path: "/api/v1/app/agents";
        readonly methodName: "postApiV1AppAgents";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/app/agents/route.ts";
    };
    readonly "POST /api/v1/apps": {
        readonly method: "POST";
        readonly path: "/api/v1/apps";
        readonly methodName: "postApiV1Apps";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/chat": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/chat";
        readonly methodName: "postApiV1AppsByIdChat";
        readonly responseMode: "mixed";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/chat/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/deploy": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/deploy";
        readonly methodName: "postApiV1AppsByIdDeploy";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/deploy/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/discord-automation": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/discord-automation";
        readonly methodName: "postApiV1AppsByIdDiscordAutomation";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/discord-automation/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/discord-automation/post": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/discord-automation/post";
        readonly methodName: "postApiV1AppsByIdDiscordAutomationPost";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/discord-automation/post/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/domains": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/domains";
        readonly methodName: "postApiV1AppsByIdDomains";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/domains/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/domains/status": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/domains/status";
        readonly methodName: "postApiV1AppsByIdDomainsStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/domains/status/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/domains/sync": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/domains/sync";
        readonly methodName: "postApiV1AppsByIdDomainsSync";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/domains/sync/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/domains/verify": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/domains/verify";
        readonly methodName: "postApiV1AppsByIdDomainsVerify";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/domains/verify/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/earnings/withdraw": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/earnings/withdraw";
        readonly methodName: "postApiV1AppsByIdEarningsWithdraw";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/earnings/withdraw/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/promote": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/promote";
        readonly methodName: "postApiV1AppsByIdPromote";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/promote/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/promote/assets": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/promote/assets";
        readonly methodName: "postApiV1AppsByIdPromoteAssets";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/promote/assets/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/promote/preview": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/promote/preview";
        readonly methodName: "postApiV1AppsByIdPromotePreview";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/promote/preview/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/regenerate-api-key": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/regenerate-api-key";
        readonly methodName: "postApiV1AppsByIdRegenerateApiKey";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/regenerate-api-key/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/telegram-automation": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/telegram-automation";
        readonly methodName: "postApiV1AppsByIdTelegramAutomation";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/telegram-automation/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/telegram-automation/post": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/telegram-automation/post";
        readonly methodName: "postApiV1AppsByIdTelegramAutomationPost";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/telegram-automation/post/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/twitter-automation": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/twitter-automation";
        readonly methodName: "postApiV1AppsByIdTwitterAutomation";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/twitter-automation/route.ts";
    };
    readonly "POST /api/v1/apps/{id}/twitter-automation/post": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/{id}/twitter-automation/post";
        readonly methodName: "postApiV1AppsByIdTwitterAutomationPost";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/twitter-automation/post/route.ts";
    };
    readonly "POST /api/v1/apps/check-name": {
        readonly method: "POST";
        readonly path: "/api/v1/apps/check-name";
        readonly methodName: "postApiV1AppsCheckName";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/check-name/route.ts";
    };
    readonly "POST /api/v1/blooio/connect": {
        readonly method: "POST";
        readonly path: "/api/v1/blooio/connect";
        readonly methodName: "postApiV1BlooioConnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/blooio/connect/route.ts";
    };
    readonly "POST /api/v1/blooio/disconnect": {
        readonly method: "POST";
        readonly path: "/api/v1/blooio/disconnect";
        readonly methodName: "postApiV1BlooioDisconnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/blooio/disconnect/route.ts";
    };
    readonly "POST /api/v1/blooio/webhook-secret": {
        readonly method: "POST";
        readonly path: "/api/v1/blooio/webhook-secret";
        readonly methodName: "postApiV1BlooioWebhookSecret";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/blooio/webhook-secret/route.ts";
    };
    readonly "POST /api/v1/browser/sessions": {
        readonly method: "POST";
        readonly path: "/api/v1/browser/sessions";
        readonly methodName: "postApiV1BrowserSessions";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/browser/sessions/route.ts";
    };
    readonly "POST /api/v1/browser/sessions/{id}/command": {
        readonly method: "POST";
        readonly path: "/api/v1/browser/sessions/{id}/command";
        readonly methodName: "postApiV1BrowserSessionsByIdCommand";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/browser/sessions/[id]/command/route.ts";
    };
    readonly "POST /api/v1/browser/sessions/{id}/navigate": {
        readonly method: "POST";
        readonly path: "/api/v1/browser/sessions/{id}/navigate";
        readonly methodName: "postApiV1BrowserSessionsByIdNavigate";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/browser/sessions/[id]/navigate/route.ts";
    };
    readonly "POST /api/v1/character-assistant": {
        readonly method: "POST";
        readonly path: "/api/v1/character-assistant";
        readonly methodName: "postApiV1CharacterAssistant";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/character-assistant/route.ts";
    };
    readonly "POST /api/v1/chat": {
        readonly method: "POST";
        readonly path: "/api/v1/chat";
        readonly methodName: "postApiV1Chat";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/chat/route.ts";
    };
    readonly "POST /api/v1/chat/completions": {
        readonly method: "POST";
        readonly path: "/api/v1/chat/completions";
        readonly methodName: "postApiV1ChatCompletions";
        readonly responseMode: "mixed";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/chat/completions/route.ts";
    };
    readonly "POST /api/v1/connections/{platform}": {
        readonly method: "POST";
        readonly path: "/api/v1/connections/{platform}";
        readonly methodName: "postApiV1ConnectionsByPlatform";
        readonly responseMode: "json";
        readonly pathParams: readonly ["platform"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/connections/[platform]/route.ts";
    };
    readonly "POST /api/v1/containers": {
        readonly method: "POST";
        readonly path: "/api/v1/containers";
        readonly methodName: "postApiV1Containers";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/route.ts";
    };
    readonly "POST /api/v1/containers/credentials": {
        readonly method: "POST";
        readonly path: "/api/v1/containers/credentials";
        readonly methodName: "postApiV1ContainersCredentials";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/containers/credentials/route.ts";
    };
    readonly "POST /api/v1/credits/checkout": {
        readonly method: "POST";
        readonly path: "/api/v1/credits/checkout";
        readonly methodName: "postApiV1CreditsCheckout";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/credits/checkout/route.ts";
    };
    readonly "POST /api/v1/cron/deployment-monitor": {
        readonly method: "POST";
        readonly path: "/api/v1/cron/deployment-monitor";
        readonly methodName: "postApiV1CronDeploymentMonitor";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/cron/deployment-monitor/route.ts";
    };
    readonly "POST /api/v1/cron/health-check": {
        readonly method: "POST";
        readonly path: "/api/v1/cron/health-check";
        readonly methodName: "postApiV1CronHealthCheck";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/cron/health-check/route.ts";
    };
    readonly "POST /api/v1/cron/process-provisioning-jobs": {
        readonly method: "POST";
        readonly path: "/api/v1/cron/process-provisioning-jobs";
        readonly methodName: "postApiV1CronProcessProvisioningJobs";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/cron/process-provisioning-jobs/route.ts";
    };
    readonly "POST /api/v1/cron/refresh-model-catalog": {
        readonly method: "POST";
        readonly path: "/api/v1/cron/refresh-model-catalog";
        readonly methodName: "postApiV1CronRefreshModelCatalog";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/cron/refresh-model-catalog/route.ts";
    };
    readonly "POST /api/v1/cron/refresh-pricing": {
        readonly method: "POST";
        readonly path: "/api/v1/cron/refresh-pricing";
        readonly methodName: "postApiV1CronRefreshPricing";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/cron/refresh-pricing/route.ts";
    };
    readonly "POST /api/v1/device-bus/devices": {
        readonly method: "POST";
        readonly path: "/api/v1/device-bus/devices";
        readonly methodName: "postApiV1DeviceBusDevices";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/device-bus/devices/route.ts";
    };
    readonly "POST /api/v1/device-bus/intents": {
        readonly method: "POST";
        readonly path: "/api/v1/device-bus/intents";
        readonly methodName: "postApiV1DeviceBusIntents";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/device-bus/intents/route.ts";
    };
    readonly "POST /api/v1/discord/channels/refresh": {
        readonly method: "POST";
        readonly path: "/api/v1/discord/channels/refresh";
        readonly methodName: "postApiV1DiscordChannelsRefresh";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/channels/refresh/route.ts";
    };
    readonly "POST /api/v1/discord/connections": {
        readonly method: "POST";
        readonly path: "/api/v1/discord/connections";
        readonly methodName: "postApiV1DiscordConnections";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/connections/route.ts";
    };
    readonly "POST /api/v1/discord/disconnect": {
        readonly method: "POST";
        readonly path: "/api/v1/discord/disconnect";
        readonly methodName: "postApiV1DiscordDisconnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/discord/disconnect/route.ts";
    };
    readonly "POST /api/v1/embeddings": {
        readonly method: "POST";
        readonly path: "/api/v1/embeddings";
        readonly methodName: "postApiV1Embeddings";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/embeddings/route.ts";
    };
    readonly "POST /api/v1/extract": {
        readonly method: "POST";
        readonly path: "/api/v1/extract";
        readonly methodName: "postApiV1Extract";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/extract/route.ts";
    };
    readonly "POST /api/v1/generate-image": {
        readonly method: "POST";
        readonly path: "/api/v1/generate-image";
        readonly methodName: "postApiV1GenerateImage";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/generate-image/route.ts";
    };
    readonly "POST /api/v1/generate-prompts": {
        readonly method: "POST";
        readonly path: "/api/v1/generate-prompts";
        readonly methodName: "postApiV1GeneratePrompts";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/generate-prompts/route.ts";
    };
    readonly "POST /api/v1/generate-video": {
        readonly method: "POST";
        readonly path: "/api/v1/generate-video";
        readonly methodName: "postApiV1GenerateVideo";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/generate-video/route.ts";
    };
    readonly "POST /api/v1/knowledge": {
        readonly method: "POST";
        readonly path: "/api/v1/knowledge";
        readonly methodName: "postApiV1Knowledge";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/knowledge/route.ts";
    };
    readonly "POST /api/v1/knowledge/pre-upload": {
        readonly method: "POST";
        readonly path: "/api/v1/knowledge/pre-upload";
        readonly methodName: "postApiV1KnowledgePreUpload";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/knowledge/pre-upload/route.ts";
    };
    readonly "POST /api/v1/knowledge/query": {
        readonly method: "POST";
        readonly path: "/api/v1/knowledge/query";
        readonly methodName: "postApiV1KnowledgeQuery";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/knowledge/query/route.ts";
    };
    readonly "POST /api/v1/knowledge/submit": {
        readonly method: "POST";
        readonly path: "/api/v1/knowledge/submit";
        readonly methodName: "postApiV1KnowledgeSubmit";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/knowledge/submit/route.ts";
    };
    readonly "POST /api/v1/knowledge/upload-file": {
        readonly method: "POST";
        readonly path: "/api/v1/knowledge/upload-file";
        readonly methodName: "postApiV1KnowledgeUploadFile";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/knowledge/upload-file/route.ts";
    };
    readonly "POST /api/v1/mcps": {
        readonly method: "POST";
        readonly path: "/api/v1/mcps";
        readonly methodName: "postApiV1Mcps";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/mcps/route.ts";
    };
    readonly "POST /api/v1/mcps/{mcpId}/publish": {
        readonly method: "POST";
        readonly path: "/api/v1/mcps/{mcpId}/publish";
        readonly methodName: "postApiV1McpsByMcpIdPublish";
        readonly responseMode: "json";
        readonly pathParams: readonly ["mcpId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/mcps/[mcpId]/publish/route.ts";
    };
    readonly "POST /api/v1/messages": {
        readonly method: "POST";
        readonly path: "/api/v1/messages";
        readonly methodName: "postApiV1Messages";
        readonly responseMode: "mixed";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/messages/route.ts";
    };
    readonly "POST /api/v1/milady/agents": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents";
        readonly methodName: "postApiV1MiladyAgents";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/api/wallet/{path}": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/api/wallet/{path}";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdApiWalletByPath";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId", "path"];
        readonly catchAllPathParams: readonly ["path"];
        readonly file: "app/api/v1/milady/agents/[agentId]/api/wallet/[...path]/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/bridge": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/bridge";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdBridge";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/bridge/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/discord/oauth": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/discord/oauth";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdDiscordOauth";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/discord/oauth/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/github/link": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/github/link";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdGithubLink";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/github/link/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/github/oauth": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/github/oauth";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdGithubOauth";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/github/oauth/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/lifeops/schedule/observations": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/lifeops/schedule/observations";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdLifeopsScheduleObservations";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/lifeops/schedule/observations/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/pairing-token": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/pairing-token";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdPairingToken";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/pairing-token/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/provision": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/provision";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdProvision";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/provision/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/restore": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/restore";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdRestore";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/restore/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/resume": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/resume";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdResume";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/resume/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/snapshot": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/snapshot";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdSnapshot";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/snapshot/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/stream": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/stream";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdStream";
        readonly responseMode: "stream";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/stream/route.ts";
    };
    readonly "POST /api/v1/milady/agents/{agentId}/suspend": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/agents/{agentId}/suspend";
        readonly methodName: "postApiV1MiladyAgentsByAgentIdSuspend";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/agents/[agentId]/suspend/route.ts";
    };
    readonly "POST /api/v1/milady/discord/gateway-agent": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/discord/gateway-agent";
        readonly methodName: "postApiV1MiladyDiscordGatewayAgent";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/discord/gateway-agent/route.ts";
    };
    readonly "POST /api/v1/milady/gateway-relay/sessions": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/gateway-relay/sessions";
        readonly methodName: "postApiV1MiladyGatewayRelaySessions";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/gateway-relay/sessions/route.ts";
    };
    readonly "POST /api/v1/milady/gateway-relay/sessions/{sessionId}/responses": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/gateway-relay/sessions/{sessionId}/responses";
        readonly methodName: "postApiV1MiladyGatewayRelaySessionsBySessionIdResponses";
        readonly responseMode: "json";
        readonly pathParams: readonly ["sessionId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/gateway-relay/sessions/[sessionId]/responses/route.ts";
    };
    readonly "POST /api/v1/milady/google/calendar/events": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/google/calendar/events";
        readonly methodName: "postApiV1MiladyGoogleCalendarEvents";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/calendar/events/route.ts";
    };
    readonly "POST /api/v1/milady/google/connect/initiate": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/google/connect/initiate";
        readonly methodName: "postApiV1MiladyGoogleConnectInitiate";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/connect/initiate/route.ts";
    };
    readonly "POST /api/v1/milady/google/disconnect": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/google/disconnect";
        readonly methodName: "postApiV1MiladyGoogleDisconnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/disconnect/route.ts";
    };
    readonly "POST /api/v1/milady/google/gmail/message-send": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/google/gmail/message-send";
        readonly methodName: "postApiV1MiladyGoogleGmailMessageSend";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/gmail/message-send/route.ts";
    };
    readonly "POST /api/v1/milady/google/gmail/reply-send": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/google/gmail/reply-send";
        readonly methodName: "postApiV1MiladyGoogleGmailReplySend";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/google/gmail/reply-send/route.ts";
    };
    readonly "POST /api/v1/milady/paypal/authorize": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/paypal/authorize";
        readonly methodName: "postApiV1MiladyPaypalAuthorize";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/paypal/authorize/route.ts";
    };
    readonly "POST /api/v1/milady/paypal/callback": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/paypal/callback";
        readonly methodName: "postApiV1MiladyPaypalCallback";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/paypal/callback/route.ts";
    };
    readonly "POST /api/v1/milady/paypal/refresh": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/paypal/refresh";
        readonly methodName: "postApiV1MiladyPaypalRefresh";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/paypal/refresh/route.ts";
    };
    readonly "POST /api/v1/milady/paypal/transactions": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/paypal/transactions";
        readonly methodName: "postApiV1MiladyPaypalTransactions";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/paypal/transactions/route.ts";
    };
    readonly "POST /api/v1/milady/plaid/exchange": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/plaid/exchange";
        readonly methodName: "postApiV1MiladyPlaidExchange";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/plaid/exchange/route.ts";
    };
    readonly "POST /api/v1/milady/plaid/link-token": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/plaid/link-token";
        readonly methodName: "postApiV1MiladyPlaidLinkToken";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/plaid/link-token/route.ts";
    };
    readonly "POST /api/v1/milady/plaid/sync": {
        readonly method: "POST";
        readonly path: "/api/v1/milady/plaid/sync";
        readonly methodName: "postApiV1MiladyPlaidSync";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/milady/plaid/sync/route.ts";
    };
    readonly "POST /api/v1/models/status": {
        readonly method: "POST";
        readonly path: "/api/v1/models/status";
        readonly methodName: "postApiV1ModelsStatus";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/models/status/route.ts";
    };
    readonly "POST /api/v1/oauth/{platform}/initiate": {
        readonly method: "POST";
        readonly path: "/api/v1/oauth/{platform}/initiate";
        readonly methodName: "postApiV1OauthByPlatformInitiate";
        readonly responseMode: "json";
        readonly pathParams: readonly ["platform"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/[platform]/initiate/route.ts";
    };
    readonly "POST /api/v1/oauth/connect": {
        readonly method: "POST";
        readonly path: "/api/v1/oauth/connect";
        readonly methodName: "postApiV1OauthConnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/connect/route.ts";
    };
    readonly "POST /api/v1/oauth/initiate": {
        readonly method: "POST";
        readonly path: "/api/v1/oauth/initiate";
        readonly methodName: "postApiV1OauthInitiate";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/oauth/initiate/route.ts";
    };
    readonly "POST /api/v1/proxy/evm-rpc/{chain}": {
        readonly method: "POST";
        readonly path: "/api/v1/proxy/evm-rpc/{chain}";
        readonly methodName: "postApiV1ProxyEvmRpcByChain";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/proxy/evm-rpc/[chain]/route.ts";
    };
    readonly "POST /api/v1/proxy/solana-rpc": {
        readonly method: "POST";
        readonly path: "/api/v1/proxy/solana-rpc";
        readonly methodName: "postApiV1ProxySolanaRpc";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/proxy/solana-rpc/route.ts";
    };
    readonly "POST /api/v1/redemptions": {
        readonly method: "POST";
        readonly path: "/api/v1/redemptions";
        readonly methodName: "postApiV1Redemptions";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/redemptions/route.ts";
    };
    readonly "POST /api/v1/referrals/apply": {
        readonly method: "POST";
        readonly path: "/api/v1/referrals/apply";
        readonly methodName: "postApiV1ReferralsApply";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/referrals/apply/route.ts";
    };
    readonly "POST /api/v1/remote/pair": {
        readonly method: "POST";
        readonly path: "/api/v1/remote/pair";
        readonly methodName: "postApiV1RemotePair";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/remote/pair/route.ts";
    };
    readonly "POST /api/v1/remote/sessions/{id}/revoke": {
        readonly method: "POST";
        readonly path: "/api/v1/remote/sessions/{id}/revoke";
        readonly methodName: "postApiV1RemoteSessionsByIdRevoke";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/remote/sessions/[id]/revoke/route.ts";
    };
    readonly "POST /api/v1/reports/bug": {
        readonly method: "POST";
        readonly path: "/api/v1/reports/bug";
        readonly methodName: "postApiV1ReportsBug";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/reports/bug/route.ts";
    };
    readonly "POST /api/v1/responses": {
        readonly method: "POST";
        readonly path: "/api/v1/responses";
        readonly methodName: "postApiV1Responses";
        readonly responseMode: "mixed";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/responses/route.ts";
    };
    readonly "POST /api/v1/rpc/{chain}": {
        readonly method: "POST";
        readonly path: "/api/v1/rpc/{chain}";
        readonly methodName: "postApiV1RpcByChain";
        readonly responseMode: "json";
        readonly pathParams: readonly ["chain"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/rpc/[chain]/route.ts";
    };
    readonly "POST /api/v1/search": {
        readonly method: "POST";
        readonly path: "/api/v1/search";
        readonly methodName: "postApiV1Search";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/search/route.ts";
    };
    readonly "POST /api/v1/solana/rpc": {
        readonly method: "POST";
        readonly path: "/api/v1/solana/rpc";
        readonly methodName: "postApiV1SolanaRpc";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/solana/rpc/route.ts";
    };
    readonly "POST /api/v1/steward/tenants": {
        readonly method: "POST";
        readonly path: "/api/v1/steward/tenants";
        readonly methodName: "postApiV1StewardTenants";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/steward/tenants/route.ts";
    };
    readonly "POST /api/v1/telegram/connect": {
        readonly method: "POST";
        readonly path: "/api/v1/telegram/connect";
        readonly methodName: "postApiV1TelegramConnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/telegram/connect/route.ts";
    };
    readonly "POST /api/v1/telegram/scan-chats": {
        readonly method: "POST";
        readonly path: "/api/v1/telegram/scan-chats";
        readonly methodName: "postApiV1TelegramScanChats";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/telegram/scan-chats/route.ts";
    };
    readonly "POST /api/v1/telegram/webhook/{orgId}": {
        readonly method: "POST";
        readonly path: "/api/v1/telegram/webhook/{orgId}";
        readonly methodName: "postApiV1TelegramWebhookByOrgId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["orgId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/telegram/webhook/[orgId]/route.ts";
    };
    readonly "POST /api/v1/topup/10": {
        readonly method: "POST";
        readonly path: "/api/v1/topup/10";
        readonly methodName: "postApiV1Topup10";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/topup/10/route.ts";
    };
    readonly "POST /api/v1/topup/100": {
        readonly method: "POST";
        readonly path: "/api/v1/topup/100";
        readonly methodName: "postApiV1Topup100";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/topup/100/route.ts";
    };
    readonly "POST /api/v1/topup/50": {
        readonly method: "POST";
        readonly path: "/api/v1/topup/50";
        readonly methodName: "postApiV1Topup50";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/topup/50/route.ts";
    };
    readonly "POST /api/v1/track/pageview": {
        readonly method: "POST";
        readonly path: "/api/v1/track/pageview";
        readonly methodName: "postApiV1TrackPageview";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/track/pageview/route.ts";
    };
    readonly "POST /api/v1/twilio/connect": {
        readonly method: "POST";
        readonly path: "/api/v1/twilio/connect";
        readonly methodName: "postApiV1TwilioConnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/twilio/connect/route.ts";
    };
    readonly "POST /api/v1/twilio/disconnect": {
        readonly method: "POST";
        readonly path: "/api/v1/twilio/disconnect";
        readonly methodName: "postApiV1TwilioDisconnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/twilio/disconnect/route.ts";
    };
    readonly "POST /api/v1/twilio/voice/inbound": {
        readonly method: "POST";
        readonly path: "/api/v1/twilio/voice/inbound";
        readonly methodName: "postApiV1TwilioVoiceInbound";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/twilio/voice/inbound/route.ts";
    };
    readonly "POST /api/v1/twitter/connect": {
        readonly method: "POST";
        readonly path: "/api/v1/twitter/connect";
        readonly methodName: "postApiV1TwitterConnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/twitter/connect/route.ts";
    };
    readonly "POST /api/v1/user/wallets/provision": {
        readonly method: "POST";
        readonly path: "/api/v1/user/wallets/provision";
        readonly methodName: "postApiV1UserWalletsProvision";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/user/wallets/provision/route.ts";
    };
    readonly "POST /api/v1/user/wallets/rpc": {
        readonly method: "POST";
        readonly path: "/api/v1/user/wallets/rpc";
        readonly methodName: "postApiV1UserWalletsRpc";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/user/wallets/rpc/route.ts";
    };
    readonly "POST /api/v1/voice/clone": {
        readonly method: "POST";
        readonly path: "/api/v1/voice/clone";
        readonly methodName: "postApiV1VoiceClone";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/voice/clone/route.ts";
    };
    readonly "POST /api/v1/voice/stt": {
        readonly method: "POST";
        readonly path: "/api/v1/voice/stt";
        readonly methodName: "postApiV1VoiceStt";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/voice/stt/route.ts";
    };
    readonly "POST /api/v1/voice/tts": {
        readonly method: "POST";
        readonly path: "/api/v1/voice/tts";
        readonly methodName: "postApiV1VoiceTts";
        readonly responseMode: "binary";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/voice/tts/route.ts";
    };
    readonly "POST /api/v1/whatsapp/connect": {
        readonly method: "POST";
        readonly path: "/api/v1/whatsapp/connect";
        readonly methodName: "postApiV1WhatsappConnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/whatsapp/connect/route.ts";
    };
    readonly "POST /api/v1/whatsapp/disconnect": {
        readonly method: "POST";
        readonly path: "/api/v1/whatsapp/disconnect";
        readonly methodName: "postApiV1WhatsappDisconnect";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/whatsapp/disconnect/route.ts";
    };
    readonly "POST /api/v1/x/dms/conversations/send": {
        readonly method: "POST";
        readonly path: "/api/v1/x/dms/conversations/send";
        readonly methodName: "postApiV1XDmsConversationsSend";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/x/dms/conversations/send/route.ts";
    };
    readonly "POST /api/v1/x/dms/curate": {
        readonly method: "POST";
        readonly path: "/api/v1/x/dms/curate";
        readonly methodName: "postApiV1XDmsCurate";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/x/dms/curate/route.ts";
    };
    readonly "POST /api/v1/x/dms/groups": {
        readonly method: "POST";
        readonly path: "/api/v1/x/dms/groups";
        readonly methodName: "postApiV1XDmsGroups";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/x/dms/groups/route.ts";
    };
    readonly "POST /api/v1/x/dms/send": {
        readonly method: "POST";
        readonly path: "/api/v1/x/dms/send";
        readonly methodName: "postApiV1XDmsSend";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/x/dms/send/route.ts";
    };
    readonly "POST /api/v1/x/posts": {
        readonly method: "POST";
        readonly path: "/api/v1/x/posts";
        readonly methodName: "postApiV1XPosts";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/x/posts/route.ts";
    };
    readonly "POST /api/v1/x402/settle": {
        readonly method: "POST";
        readonly path: "/api/v1/x402/settle";
        readonly methodName: "postApiV1X402Settle";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/x402/settle/route.ts";
    };
    readonly "POST /api/v1/x402/verify": {
        readonly method: "POST";
        readonly path: "/api/v1/x402/verify";
        readonly methodName: "postApiV1X402Verify";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/x402/verify/route.ts";
    };
    readonly "PUT /api/v1/admin/ai-pricing": {
        readonly method: "PUT";
        readonly path: "/api/v1/admin/ai-pricing";
        readonly methodName: "putApiV1AdminAiPricing";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/ai-pricing/route.ts";
    };
    readonly "PUT /api/v1/admin/service-pricing": {
        readonly method: "PUT";
        readonly path: "/api/v1/admin/service-pricing";
        readonly methodName: "putApiV1AdminServicePricing";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/admin/service-pricing/route.ts";
    };
    readonly "PUT /api/v1/affiliates": {
        readonly method: "PUT";
        readonly path: "/api/v1/affiliates";
        readonly methodName: "putApiV1Affiliates";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/affiliates/route.ts";
    };
    readonly "PUT /api/v1/agents/{agentId}/monetization": {
        readonly method: "PUT";
        readonly path: "/api/v1/agents/{agentId}/monetization";
        readonly methodName: "putApiV1AgentsByAgentIdMonetization";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/agents/[agentId]/monetization/route.ts";
    };
    readonly "PUT /api/v1/agents/{agentId}/n8n/{path}": {
        readonly method: "PUT";
        readonly path: "/api/v1/agents/{agentId}/n8n/{path}";
        readonly methodName: "putApiV1AgentsByAgentIdN8nByPath";
        readonly responseMode: "json";
        readonly pathParams: readonly ["agentId", "path"];
        readonly catchAllPathParams: readonly ["path"];
        readonly file: "app/api/v1/agents/[agentId]/n8n/[...path]/route.ts";
    };
    readonly "PUT /api/v1/apps/{id}": {
        readonly method: "PUT";
        readonly path: "/api/v1/apps/{id}";
        readonly methodName: "putApiV1AppsById";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/route.ts";
    };
    readonly "PUT /api/v1/apps/{id}/characters": {
        readonly method: "PUT";
        readonly path: "/api/v1/apps/{id}/characters";
        readonly methodName: "putApiV1AppsByIdCharacters";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/characters/route.ts";
    };
    readonly "PUT /api/v1/apps/{id}/monetization": {
        readonly method: "PUT";
        readonly path: "/api/v1/apps/{id}/monetization";
        readonly methodName: "putApiV1AppsByIdMonetization";
        readonly responseMode: "json";
        readonly pathParams: readonly ["id"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/apps/[id]/monetization/route.ts";
    };
    readonly "PUT /api/v1/billing/settings": {
        readonly method: "PUT";
        readonly path: "/api/v1/billing/settings";
        readonly methodName: "putApiV1BillingSettings";
        readonly responseMode: "json";
        readonly pathParams: readonly [];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/billing/settings/route.ts";
    };
    readonly "PUT /api/v1/mcps/{mcpId}": {
        readonly method: "PUT";
        readonly path: "/api/v1/mcps/{mcpId}";
        readonly methodName: "putApiV1McpsByMcpId";
        readonly responseMode: "json";
        readonly pathParams: readonly ["mcpId"];
        readonly catchAllPathParams: readonly [];
        readonly file: "app/api/v1/mcps/[mcpId]/route.ts";
    };
};
export type PublicRouteKey = keyof typeof ELIZA_CLOUD_PUBLIC_ENDPOINTS;
export type PublicRouteMethodName = (typeof ELIZA_CLOUD_PUBLIC_ENDPOINTS)[PublicRouteKey]["methodName"];
export type PublicRouteDefinition = (typeof ELIZA_CLOUD_PUBLIC_ENDPOINTS)[PublicRouteKey];
export type PublicRouteResponseMode = PublicRouteDefinition["responseMode"];
export type PublicRouteKeysWithoutPathParams = {
    [TKey in PublicRouteKey]: keyof PublicRoutePathParams[TKey] extends never ? TKey : never;
}[PublicRouteKey];
export type PublicRouteKeysWithPathParams = Exclude<PublicRouteKey, PublicRouteKeysWithoutPathParams>;
export interface PublicRoutePathParams {
    "DELETE /api/elevenlabs/voices/{id}": {
        "id": string | number;
    };
    "DELETE /api/v1/admin/docker-nodes/{nodeId}": {
        "nodeId": string | number;
    };
    "DELETE /api/v1/admin/orgs/{orgId}/rate-limits": {
        "orgId": string | number;
    };
    "DELETE /api/v1/advertising/accounts/{id}": {
        "id": string | number;
    };
    "DELETE /api/v1/advertising/campaigns/{id}": {
        "id": string | number;
    };
    "DELETE /api/v1/agents/{agentId}/n8n/{path}": {
        "agentId": string | number;
        "path": string | number | readonly (string | number)[];
    };
    "DELETE /api/v1/agents/{agentId}/publish": {
        "agentId": string | number;
    };
    "DELETE /api/v1/api-keys/{id}": {
        "id": string | number;
    };
    "DELETE /api/v1/app-builder/sessions/{sessionId}": {
        "sessionId": string | number;
    };
    "DELETE /api/v1/apps/{id}": {
        "id": string | number;
    };
    "DELETE /api/v1/apps/{id}/discord-automation": {
        "id": string | number;
    };
    "DELETE /api/v1/apps/{id}/domains": {
        "id": string | number;
    };
    "DELETE /api/v1/apps/{id}/telegram-automation": {
        "id": string | number;
    };
    "DELETE /api/v1/apps/{id}/twitter-automation": {
        "id": string | number;
    };
    "DELETE /api/v1/blooio/disconnect": Record<never, never>;
    "DELETE /api/v1/browser/sessions/{id}": {
        "id": string | number;
    };
    "DELETE /api/v1/connections/{platform}": {
        "platform": string | number;
    };
    "DELETE /api/v1/containers/{id}": {
        "id": string | number;
    };
    "DELETE /api/v1/discord/connections/{id}": {
        "id": string | number;
    };
    "DELETE /api/v1/knowledge/{id}": {
        "id": string | number;
    };
    "DELETE /api/v1/knowledge/pre-upload": Record<never, never>;
    "DELETE /api/v1/mcps/{mcpId}": {
        "mcpId": string | number;
    };
    "DELETE /api/v1/mcps/{mcpId}/publish": {
        "mcpId": string | number;
    };
    "DELETE /api/v1/milady/agents/{agentId}": {
        "agentId": string | number;
    };
    "DELETE /api/v1/milady/agents/{agentId}/discord": {
        "agentId": string | number;
    };
    "DELETE /api/v1/milady/agents/{agentId}/github": {
        "agentId": string | number;
    };
    "DELETE /api/v1/milady/gateway-relay/sessions/{sessionId}": {
        "sessionId": string | number;
    };
    "DELETE /api/v1/milady/google/calendar/events/{eventId}": {
        "eventId": string | number;
    };
    "DELETE /api/v1/oauth/connections/{id}": {
        "id": string | number;
    };
    "DELETE /api/v1/telegram/disconnect": Record<never, never>;
    "DELETE /api/v1/twilio/disconnect": Record<never, never>;
    "DELETE /api/v1/twitter/disconnect": Record<never, never>;
    "DELETE /api/v1/voice/{id}": {
        "id": string | number;
    };
    "DELETE /api/v1/whatsapp/disconnect": Record<never, never>;
    "GET /api/elevenlabs/voices": Record<never, never>;
    "GET /api/elevenlabs/voices/{id}": {
        "id": string | number;
    };
    "GET /api/elevenlabs/voices/jobs": Record<never, never>;
    "GET /api/elevenlabs/voices/user": Record<never, never>;
    "GET /api/elevenlabs/voices/verify/{id}": {
        "id": string | number;
    };
    "GET /api/v1/admin/ai-pricing": Record<never, never>;
    "GET /api/v1/admin/docker-containers": Record<never, never>;
    "GET /api/v1/admin/docker-containers/{id}/logs": {
        "id": string | number;
    };
    "GET /api/v1/admin/docker-nodes": Record<never, never>;
    "GET /api/v1/admin/docker-nodes/{nodeId}": {
        "nodeId": string | number;
    };
    "GET /api/v1/admin/headscale": Record<never, never>;
    "GET /api/v1/admin/infrastructure": Record<never, never>;
    "GET /api/v1/admin/metrics": Record<never, never>;
    "GET /api/v1/admin/moderation": Record<never, never>;
    "GET /api/v1/admin/orgs/{orgId}/rate-limits": {
        "orgId": string | number;
    };
    "GET /api/v1/admin/service-pricing": Record<never, never>;
    "GET /api/v1/admin/service-pricing/audit": Record<never, never>;
    "GET /api/v1/admin/users/{userId}/billing/breakdown": {
        "userId": string | number;
    };
    "GET /api/v1/advertising/accounts": Record<never, never>;
    "GET /api/v1/advertising/accounts/{id}": {
        "id": string | number;
    };
    "GET /api/v1/advertising/campaigns": Record<never, never>;
    "GET /api/v1/advertising/campaigns/{id}": {
        "id": string | number;
    };
    "GET /api/v1/advertising/campaigns/{id}/analytics": {
        "id": string | number;
    };
    "GET /api/v1/advertising/campaigns/{id}/creatives": {
        "id": string | number;
    };
    "GET /api/v1/affiliates": Record<never, never>;
    "GET /api/v1/agents/{agentId}": {
        "agentId": string | number;
    };
    "GET /api/v1/agents/{agentId}/logs": {
        "agentId": string | number;
    };
    "GET /api/v1/agents/{agentId}/monetization": {
        "agentId": string | number;
    };
    "GET /api/v1/agents/{agentId}/n8n/{path}": {
        "agentId": string | number;
        "path": string | number | readonly (string | number)[];
    };
    "GET /api/v1/agents/{agentId}/status": {
        "agentId": string | number;
    };
    "GET /api/v1/agents/{agentId}/usage": {
        "agentId": string | number;
    };
    "GET /api/v1/agents/by-token": Record<never, never>;
    "GET /api/v1/api-keys": Record<never, never>;
    "GET /api/v1/api-keys/explorer": Record<never, never>;
    "GET /api/v1/app-auth/session": Record<never, never>;
    "GET /api/v1/app-builder": Record<never, never>;
    "GET /api/v1/app-builder/sessions/{sessionId}": {
        "sessionId": string | number;
    };
    "GET /api/v1/app-builder/sessions/{sessionId}/commit": {
        "sessionId": string | number;
    };
    "GET /api/v1/app-builder/sessions/{sessionId}/files": {
        "sessionId": string | number;
    };
    "GET /api/v1/app-builder/sessions/{sessionId}/history": {
        "sessionId": string | number;
    };
    "GET /api/v1/app-builder/sessions/{sessionId}/logs": {
        "sessionId": string | number;
    };
    "GET /api/v1/app-builder/sessions/{sessionId}/prompts/stream": {
        "sessionId": string | number;
    };
    "GET /api/v1/app-builder/sessions/{sessionId}/snapshots": {
        "sessionId": string | number;
    };
    "GET /api/v1/app-builder/sessions/{sessionId}/terminal": {
        "sessionId": string | number;
    };
    "GET /api/v1/app-credits/balance": Record<never, never>;
    "GET /api/v1/app-credits/verify": Record<never, never>;
    "GET /api/v1/apps": Record<never, never>;
    "GET /api/v1/apps/{id}": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/analytics": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/analytics/requests": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/characters": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/deploy": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/discord-automation": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/domains": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/earnings": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/earnings/history": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/monetization": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/promote": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/promote/analytics": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/promote/assets": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/public": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/telegram-automation": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/twitter-automation": {
        "id": string | number;
    };
    "GET /api/v1/apps/{id}/users": {
        "id": string | number;
    };
    "GET /api/v1/billing/settings": Record<never, never>;
    "GET /api/v1/blooio/status": Record<never, never>;
    "GET /api/v1/browser/sessions": Record<never, never>;
    "GET /api/v1/browser/sessions/{id}": {
        "id": string | number;
    };
    "GET /api/v1/browser/sessions/{id}/snapshot": {
        "id": string | number;
    };
    "GET /api/v1/chain/nfts/{chain}/{address}": {
        "chain": string | number;
        "address": string | number;
    };
    "GET /api/v1/chain/tokens/{chain}/{address}": {
        "chain": string | number;
        "address": string | number;
    };
    "GET /api/v1/chain/transfers/{chain}/{address}": {
        "chain": string | number;
        "address": string | number;
    };
    "GET /api/v1/containers": Record<never, never>;
    "GET /api/v1/containers/{id}": {
        "id": string | number;
    };
    "GET /api/v1/containers/{id}/deployments": {
        "id": string | number;
    };
    "GET /api/v1/containers/{id}/health": {
        "id": string | number;
    };
    "GET /api/v1/containers/{id}/logs": {
        "id": string | number;
    };
    "GET /api/v1/containers/{id}/logs/stream": {
        "id": string | number;
    };
    "GET /api/v1/containers/{id}/metrics": {
        "id": string | number;
    };
    "GET /api/v1/containers/quota": Record<never, never>;
    "GET /api/v1/credits/balance": Record<never, never>;
    "GET /api/v1/credits/summary": Record<never, never>;
    "GET /api/v1/credits/verify": Record<never, never>;
    "GET /api/v1/cron/deployment-monitor": Record<never, never>;
    "GET /api/v1/cron/health-check": Record<never, never>;
    "GET /api/v1/cron/process-provisioning-jobs": Record<never, never>;
    "GET /api/v1/cron/refresh-model-catalog": Record<never, never>;
    "GET /api/v1/cron/refresh-pricing": Record<never, never>;
    "GET /api/v1/dashboard": Record<never, never>;
    "GET /api/v1/device-bus/devices/{deviceId}/intents": {
        "deviceId": string | number;
    };
    "GET /api/v1/discord/callback": Record<never, never>;
    "GET /api/v1/discord/channels": Record<never, never>;
    "GET /api/v1/discord/connections": Record<never, never>;
    "GET /api/v1/discord/connections/{id}": {
        "id": string | number;
    };
    "GET /api/v1/discord/guilds": Record<never, never>;
    "GET /api/v1/discord/oauth": Record<never, never>;
    "GET /api/v1/discord/status": Record<never, never>;
    "GET /api/v1/discovery": Record<never, never>;
    "GET /api/v1/eliza/launch-sessions/{sessionId}": {
        "sessionId": string | number;
    };
    "GET /api/v1/gallery": Record<never, never>;
    "GET /api/v1/jobs/{jobId}": {
        "jobId": string | number;
    };
    "GET /api/v1/knowledge": Record<never, never>;
    "GET /api/v1/knowledge/check": Record<never, never>;
    "GET /api/v1/market/candles/{chain}/{address}": {
        "chain": string | number;
        "address": string | number;
    };
    "GET /api/v1/market/portfolio/{chain}/{address}": {
        "chain": string | number;
        "address": string | number;
    };
    "GET /api/v1/market/preview/portfolio/{chain}/{address}": {
        "chain": string | number;
        "address": string | number;
    };
    "GET /api/v1/market/preview/predictions": Record<never, never>;
    "GET /api/v1/market/preview/price/{chain}/{address}": {
        "chain": string | number;
        "address": string | number;
    };
    "GET /api/v1/market/preview/token/{chain}/{address}": {
        "chain": string | number;
        "address": string | number;
    };
    "GET /api/v1/market/preview/wallet-overview": Record<never, never>;
    "GET /api/v1/market/price/{chain}/{address}": {
        "chain": string | number;
        "address": string | number;
    };
    "GET /api/v1/market/token/{chain}/{address}": {
        "chain": string | number;
        "address": string | number;
    };
    "GET /api/v1/market/trades/{chain}/{address}": {
        "chain": string | number;
        "address": string | number;
    };
    "GET /api/v1/mcps": Record<never, never>;
    "GET /api/v1/mcps/{mcpId}": {
        "mcpId": string | number;
    };
    "GET /api/v1/milady/agents": Record<never, never>;
    "GET /api/v1/milady/agents/{agentId}": {
        "agentId": string | number;
    };
    "GET /api/v1/milady/agents/{agentId}/api/wallet/{path}": {
        "agentId": string | number;
        "path": string | number | readonly (string | number)[];
    };
    "GET /api/v1/milady/agents/{agentId}/backups": {
        "agentId": string | number;
    };
    "GET /api/v1/milady/agents/{agentId}/discord": {
        "agentId": string | number;
    };
    "GET /api/v1/milady/agents/{agentId}/github": {
        "agentId": string | number;
    };
    "GET /api/v1/milady/agents/{agentId}/github/token": {
        "agentId": string | number;
    };
    "GET /api/v1/milady/agents/{agentId}/lifeops/schedule/merged-state": {
        "agentId": string | number;
    };
    "GET /api/v1/milady/agents/{agentId}/wallet": {
        "agentId": string | number;
    };
    "GET /api/v1/milady/gateway-relay/sessions/{sessionId}/next": {
        "sessionId": string | number;
    };
    "GET /api/v1/milady/github-oauth-complete": Record<never, never>;
    "GET /api/v1/milady/google/accounts": Record<never, never>;
    "GET /api/v1/milady/google/calendar/feed": Record<never, never>;
    "GET /api/v1/milady/google/gmail/read": Record<never, never>;
    "GET /api/v1/milady/google/gmail/search": Record<never, never>;
    "GET /api/v1/milady/google/gmail/subscription-headers": Record<never, never>;
    "GET /api/v1/milady/google/gmail/triage": Record<never, never>;
    "GET /api/v1/milady/google/status": Record<never, never>;
    "GET /api/v1/milady/launch-sessions/{sessionId}": {
        "sessionId": string | number;
    };
    "GET /api/v1/milady/lifeops/github-complete": Record<never, never>;
    "GET /api/v1/milady/paypal/popup-callback": Record<never, never>;
    "GET /api/v1/milady/paypal/status": Record<never, never>;
    "GET /api/v1/milady/plaid/status": Record<never, never>;
    "GET /api/v1/models": Record<never, never>;
    "GET /api/v1/models/{model}": {
        "model": string | number | readonly (string | number)[];
    };
    "GET /api/v1/oauth/{platform}/callback": {
        "platform": string | number;
    };
    "GET /api/v1/oauth/callback": Record<never, never>;
    "GET /api/v1/oauth/connections": Record<never, never>;
    "GET /api/v1/oauth/connections/{id}": {
        "id": string | number;
    };
    "GET /api/v1/oauth/connections/{id}/token": {
        "id": string | number;
    };
    "GET /api/v1/oauth/initiate": Record<never, never>;
    "GET /api/v1/oauth/providers": Record<never, never>;
    "GET /api/v1/oauth/status": Record<never, never>;
    "GET /api/v1/oauth/token/{platform}": {
        "platform": string | number;
    };
    "GET /api/v1/pricing/summary": Record<never, never>;
    "GET /api/v1/proxy/birdeye/{path}": {
        "path": string | number | readonly (string | number)[];
    };
    "GET /api/v1/redemptions": Record<never, never>;
    "GET /api/v1/redemptions/{id}": {
        "id": string | number;
    };
    "GET /api/v1/redemptions/balance": Record<never, never>;
    "GET /api/v1/redemptions/quote": Record<never, never>;
    "GET /api/v1/redemptions/status": Record<never, never>;
    "GET /api/v1/referrals": Record<never, never>;
    "GET /api/v1/remote/sessions": Record<never, never>;
    "GET /api/v1/solana/assets/{address}": {
        "address": string | number;
    };
    "GET /api/v1/solana/methods": Record<never, never>;
    "GET /api/v1/solana/token-accounts/{address}": {
        "address": string | number;
    };
    "GET /api/v1/solana/transactions/{address}": {
        "address": string | number;
    };
    "GET /api/v1/steward/tenants/credentials": Record<never, never>;
    "GET /api/v1/telegram/chats": Record<never, never>;
    "GET /api/v1/telegram/scan-chats": Record<never, never>;
    "GET /api/v1/telegram/status": Record<never, never>;
    "GET /api/v1/twilio/status": Record<never, never>;
    "GET /api/v1/twitter/callback": Record<never, never>;
    "GET /api/v1/twitter/status": Record<never, never>;
    "GET /api/v1/user": Record<never, never>;
    "GET /api/v1/user/wallets": Record<never, never>;
    "GET /api/v1/voice/{id}": {
        "id": string | number;
    };
    "GET /api/v1/voice/jobs": Record<never, never>;
    "GET /api/v1/voice/list": Record<never, never>;
    "GET /api/v1/whatsapp/status": Record<never, never>;
    "GET /api/v1/x/dms/digest": Record<never, never>;
    "GET /api/v1/x/feed": Record<never, never>;
    "GET /api/v1/x/status": Record<never, never>;
    "GET /api/v1/x402": Record<never, never>;
    "PATCH /api/elevenlabs/voices/{id}": {
        "id": string | number;
    };
    "PATCH /api/v1/admin/docker-nodes/{nodeId}": {
        "nodeId": string | number;
    };
    "PATCH /api/v1/admin/orgs/{orgId}/rate-limits": {
        "orgId": string | number;
    };
    "PATCH /api/v1/advertising/campaigns/{id}": {
        "id": string | number;
    };
    "PATCH /api/v1/api-keys/{id}": {
        "id": string | number;
    };
    "PATCH /api/v1/app-builder/sessions/{sessionId}": {
        "sessionId": string | number;
    };
    "PATCH /api/v1/apps/{id}": {
        "id": string | number;
    };
    "PATCH /api/v1/connections/{platform}": {
        "platform": string | number;
    };
    "PATCH /api/v1/containers/{id}": {
        "id": string | number;
    };
    "PATCH /api/v1/discord/connections/{id}": {
        "id": string | number;
    };
    "PATCH /api/v1/milady/agents/{agentId}": {
        "agentId": string | number;
    };
    "PATCH /api/v1/milady/google/calendar/events/{eventId}": {
        "eventId": string | number;
    };
    "PATCH /api/v1/user": Record<never, never>;
    "PATCH /api/v1/voice/{id}": {
        "id": string | number;
    };
    "POST /api/elevenlabs/stt": Record<never, never>;
    "POST /api/elevenlabs/tts": Record<never, never>;
    "POST /api/elevenlabs/voices/clone": Record<never, never>;
    "POST /api/v1/admin/ai-pricing": Record<never, never>;
    "POST /api/v1/admin/docker-containers/audit": Record<never, never>;
    "POST /api/v1/admin/docker-nodes": Record<never, never>;
    "POST /api/v1/admin/docker-nodes/{nodeId}/health-check": {
        "nodeId": string | number;
    };
    "POST /api/v1/admin/docker-nodes/sync": Record<never, never>;
    "POST /api/v1/admin/infrastructure/containers/actions": Record<never, never>;
    "POST /api/v1/admin/moderation": Record<never, never>;
    "POST /api/v1/advertising/accounts": Record<never, never>;
    "POST /api/v1/advertising/campaigns": Record<never, never>;
    "POST /api/v1/advertising/campaigns/{id}/creatives": {
        "id": string | number;
    };
    "POST /api/v1/advertising/campaigns/{id}/pause": {
        "id": string | number;
    };
    "POST /api/v1/advertising/campaigns/{id}/start": {
        "id": string | number;
    };
    "POST /api/v1/affiliates": Record<never, never>;
    "POST /api/v1/affiliates/link": Record<never, never>;
    "POST /api/v1/agents": Record<never, never>;
    "POST /api/v1/agents/{agentId}/n8n/{path}": {
        "agentId": string | number;
        "path": string | number | readonly (string | number)[];
    };
    "POST /api/v1/agents/{agentId}/publish": {
        "agentId": string | number;
    };
    "POST /api/v1/agents/{agentId}/restart": {
        "agentId": string | number;
    };
    "POST /api/v1/agents/{agentId}/resume": {
        "agentId": string | number;
    };
    "POST /api/v1/agents/{agentId}/suspend": {
        "agentId": string | number;
    };
    "POST /api/v1/api-keys": Record<never, never>;
    "POST /api/v1/api-keys/{id}/regenerate": {
        "id": string | number;
    };
    "POST /api/v1/app-auth/connect": Record<never, never>;
    "POST /api/v1/app-builder": Record<never, never>;
    "POST /api/v1/app-builder/images": Record<never, never>;
    "POST /api/v1/app-builder/sessions/{sessionId}/commit": {
        "sessionId": string | number;
    };
    "POST /api/v1/app-builder/sessions/{sessionId}/files": {
        "sessionId": string | number;
    };
    "POST /api/v1/app-builder/sessions/{sessionId}/prompts/stream": {
        "sessionId": string | number;
    };
    "POST /api/v1/app-builder/sessions/{sessionId}/resume/stream": {
        "sessionId": string | number;
    };
    "POST /api/v1/app-builder/sessions/{sessionId}/rollback": {
        "sessionId": string | number;
    };
    "POST /api/v1/app-builder/sessions/{sessionId}/terminal": {
        "sessionId": string | number;
    };
    "POST /api/v1/app-builder/stream": Record<never, never>;
    "POST /api/v1/app-credits/checkout": Record<never, never>;
    "POST /api/v1/app/agents": Record<never, never>;
    "POST /api/v1/apps": Record<never, never>;
    "POST /api/v1/apps/{id}/chat": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/deploy": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/discord-automation": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/discord-automation/post": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/domains": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/domains/status": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/domains/sync": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/domains/verify": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/earnings/withdraw": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/promote": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/promote/assets": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/promote/preview": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/regenerate-api-key": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/telegram-automation": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/telegram-automation/post": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/twitter-automation": {
        "id": string | number;
    };
    "POST /api/v1/apps/{id}/twitter-automation/post": {
        "id": string | number;
    };
    "POST /api/v1/apps/check-name": Record<never, never>;
    "POST /api/v1/blooio/connect": Record<never, never>;
    "POST /api/v1/blooio/disconnect": Record<never, never>;
    "POST /api/v1/blooio/webhook-secret": Record<never, never>;
    "POST /api/v1/browser/sessions": Record<never, never>;
    "POST /api/v1/browser/sessions/{id}/command": {
        "id": string | number;
    };
    "POST /api/v1/browser/sessions/{id}/navigate": {
        "id": string | number;
    };
    "POST /api/v1/character-assistant": Record<never, never>;
    "POST /api/v1/chat": Record<never, never>;
    "POST /api/v1/chat/completions": Record<never, never>;
    "POST /api/v1/connections/{platform}": {
        "platform": string | number;
    };
    "POST /api/v1/containers": Record<never, never>;
    "POST /api/v1/containers/credentials": Record<never, never>;
    "POST /api/v1/credits/checkout": Record<never, never>;
    "POST /api/v1/cron/deployment-monitor": Record<never, never>;
    "POST /api/v1/cron/health-check": Record<never, never>;
    "POST /api/v1/cron/process-provisioning-jobs": Record<never, never>;
    "POST /api/v1/cron/refresh-model-catalog": Record<never, never>;
    "POST /api/v1/cron/refresh-pricing": Record<never, never>;
    "POST /api/v1/device-bus/devices": Record<never, never>;
    "POST /api/v1/device-bus/intents": Record<never, never>;
    "POST /api/v1/discord/channels/refresh": Record<never, never>;
    "POST /api/v1/discord/connections": Record<never, never>;
    "POST /api/v1/discord/disconnect": Record<never, never>;
    "POST /api/v1/embeddings": Record<never, never>;
    "POST /api/v1/extract": Record<never, never>;
    "POST /api/v1/generate-image": Record<never, never>;
    "POST /api/v1/generate-prompts": Record<never, never>;
    "POST /api/v1/generate-video": Record<never, never>;
    "POST /api/v1/knowledge": Record<never, never>;
    "POST /api/v1/knowledge/pre-upload": Record<never, never>;
    "POST /api/v1/knowledge/query": Record<never, never>;
    "POST /api/v1/knowledge/submit": Record<never, never>;
    "POST /api/v1/knowledge/upload-file": Record<never, never>;
    "POST /api/v1/mcps": Record<never, never>;
    "POST /api/v1/mcps/{mcpId}/publish": {
        "mcpId": string | number;
    };
    "POST /api/v1/messages": Record<never, never>;
    "POST /api/v1/milady/agents": Record<never, never>;
    "POST /api/v1/milady/agents/{agentId}/api/wallet/{path}": {
        "agentId": string | number;
        "path": string | number | readonly (string | number)[];
    };
    "POST /api/v1/milady/agents/{agentId}/bridge": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/agents/{agentId}/discord/oauth": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/agents/{agentId}/github/link": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/agents/{agentId}/github/oauth": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/agents/{agentId}/lifeops/schedule/observations": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/agents/{agentId}/pairing-token": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/agents/{agentId}/provision": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/agents/{agentId}/restore": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/agents/{agentId}/resume": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/agents/{agentId}/snapshot": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/agents/{agentId}/stream": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/agents/{agentId}/suspend": {
        "agentId": string | number;
    };
    "POST /api/v1/milady/discord/gateway-agent": Record<never, never>;
    "POST /api/v1/milady/gateway-relay/sessions": Record<never, never>;
    "POST /api/v1/milady/gateway-relay/sessions/{sessionId}/responses": {
        "sessionId": string | number;
    };
    "POST /api/v1/milady/google/calendar/events": Record<never, never>;
    "POST /api/v1/milady/google/connect/initiate": Record<never, never>;
    "POST /api/v1/milady/google/disconnect": Record<never, never>;
    "POST /api/v1/milady/google/gmail/message-send": Record<never, never>;
    "POST /api/v1/milady/google/gmail/reply-send": Record<never, never>;
    "POST /api/v1/milady/paypal/authorize": Record<never, never>;
    "POST /api/v1/milady/paypal/callback": Record<never, never>;
    "POST /api/v1/milady/paypal/refresh": Record<never, never>;
    "POST /api/v1/milady/paypal/transactions": Record<never, never>;
    "POST /api/v1/milady/plaid/exchange": Record<never, never>;
    "POST /api/v1/milady/plaid/link-token": Record<never, never>;
    "POST /api/v1/milady/plaid/sync": Record<never, never>;
    "POST /api/v1/models/status": Record<never, never>;
    "POST /api/v1/oauth/{platform}/initiate": {
        "platform": string | number;
    };
    "POST /api/v1/oauth/connect": Record<never, never>;
    "POST /api/v1/oauth/initiate": Record<never, never>;
    "POST /api/v1/proxy/evm-rpc/{chain}": {
        "chain": string | number;
    };
    "POST /api/v1/proxy/solana-rpc": Record<never, never>;
    "POST /api/v1/redemptions": Record<never, never>;
    "POST /api/v1/referrals/apply": Record<never, never>;
    "POST /api/v1/remote/pair": Record<never, never>;
    "POST /api/v1/remote/sessions/{id}/revoke": {
        "id": string | number;
    };
    "POST /api/v1/reports/bug": Record<never, never>;
    "POST /api/v1/responses": Record<never, never>;
    "POST /api/v1/rpc/{chain}": {
        "chain": string | number;
    };
    "POST /api/v1/search": Record<never, never>;
    "POST /api/v1/solana/rpc": Record<never, never>;
    "POST /api/v1/steward/tenants": Record<never, never>;
    "POST /api/v1/telegram/connect": Record<never, never>;
    "POST /api/v1/telegram/scan-chats": Record<never, never>;
    "POST /api/v1/telegram/webhook/{orgId}": {
        "orgId": string | number;
    };
    "POST /api/v1/topup/10": Record<never, never>;
    "POST /api/v1/topup/100": Record<never, never>;
    "POST /api/v1/topup/50": Record<never, never>;
    "POST /api/v1/track/pageview": Record<never, never>;
    "POST /api/v1/twilio/connect": Record<never, never>;
    "POST /api/v1/twilio/disconnect": Record<never, never>;
    "POST /api/v1/twilio/voice/inbound": Record<never, never>;
    "POST /api/v1/twitter/connect": Record<never, never>;
    "POST /api/v1/user/wallets/provision": Record<never, never>;
    "POST /api/v1/user/wallets/rpc": Record<never, never>;
    "POST /api/v1/voice/clone": Record<never, never>;
    "POST /api/v1/voice/stt": Record<never, never>;
    "POST /api/v1/voice/tts": Record<never, never>;
    "POST /api/v1/whatsapp/connect": Record<never, never>;
    "POST /api/v1/whatsapp/disconnect": Record<never, never>;
    "POST /api/v1/x/dms/conversations/send": Record<never, never>;
    "POST /api/v1/x/dms/curate": Record<never, never>;
    "POST /api/v1/x/dms/groups": Record<never, never>;
    "POST /api/v1/x/dms/send": Record<never, never>;
    "POST /api/v1/x/posts": Record<never, never>;
    "POST /api/v1/x402/settle": Record<never, never>;
    "POST /api/v1/x402/verify": Record<never, never>;
    "PUT /api/v1/admin/ai-pricing": Record<never, never>;
    "PUT /api/v1/admin/service-pricing": Record<never, never>;
    "PUT /api/v1/affiliates": Record<never, never>;
    "PUT /api/v1/agents/{agentId}/monetization": {
        "agentId": string | number;
    };
    "PUT /api/v1/agents/{agentId}/n8n/{path}": {
        "agentId": string | number;
        "path": string | number | readonly (string | number)[];
    };
    "PUT /api/v1/apps/{id}": {
        "id": string | number;
    };
    "PUT /api/v1/apps/{id}/characters": {
        "id": string | number;
    };
    "PUT /api/v1/apps/{id}/monetization": {
        "id": string | number;
    };
    "PUT /api/v1/billing/settings": Record<never, never>;
    "PUT /api/v1/mcps/{mcpId}": {
        "mcpId": string | number;
    };
}
export interface PublicRouteBaseCallOptions extends Omit<CloudRequestOptions, "json"> {
    json?: unknown;
}
export type PublicRouteCallOptions<TKey extends PublicRouteKey> = PublicRouteBaseCallOptions & (keyof PublicRoutePathParams[TKey] extends never ? {
    pathParams?: never;
} : {
    pathParams: PublicRoutePathParams[TKey];
});
export declare class ElizaCloudPublicRoutesClient {
    private readonly client;
    constructor(client: ElizaCloudClient);
    call<TKey extends PublicRouteKeysWithoutPathParams, TResponse = unknown>(key: TKey, options?: PublicRouteCallOptions<TKey>): Promise<TResponse>;
    call<TKey extends PublicRouteKeysWithPathParams, TResponse = unknown>(key: TKey, options: PublicRouteCallOptions<TKey>): Promise<TResponse>;
    callRaw<TKey extends PublicRouteKeysWithoutPathParams>(key: TKey, options?: PublicRouteCallOptions<TKey>): Promise<Response>;
    callRaw<TKey extends PublicRouteKeysWithPathParams>(key: TKey, options: PublicRouteCallOptions<TKey>): Promise<Response>;
    deleteApiElevenlabsVoicesById<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/elevenlabs/voices/{id}">): Promise<TResponse>;
    deleteApiV1AdminDockerNodesByNodeId<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/admin/docker-nodes/{nodeId}">): Promise<TResponse>;
    deleteApiV1AdminOrgsByOrgIdRateLimits<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/admin/orgs/{orgId}/rate-limits">): Promise<TResponse>;
    deleteApiV1AdvertisingAccountsById<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/advertising/accounts/{id}">): Promise<TResponse>;
    deleteApiV1AdvertisingCampaignsById<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/advertising/campaigns/{id}">): Promise<TResponse>;
    deleteApiV1AgentsByAgentIdN8nByPath<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/agents/{agentId}/n8n/{path}">): Promise<TResponse>;
    deleteApiV1AgentsByAgentIdPublish<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/agents/{agentId}/publish">): Promise<TResponse>;
    deleteApiV1ApiKeysById<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/api-keys/{id}">): Promise<TResponse>;
    deleteApiV1AppBuilderSessionsBySessionId<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/app-builder/sessions/{sessionId}">): Promise<TResponse>;
    deleteApiV1AppsById<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/apps/{id}">): Promise<TResponse>;
    deleteApiV1AppsByIdDiscordAutomation<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/apps/{id}/discord-automation">): Promise<TResponse>;
    deleteApiV1AppsByIdDomains<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/apps/{id}/domains">): Promise<TResponse>;
    deleteApiV1AppsByIdTelegramAutomation<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/apps/{id}/telegram-automation">): Promise<TResponse>;
    deleteApiV1AppsByIdTwitterAutomation<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/apps/{id}/twitter-automation">): Promise<TResponse>;
    deleteApiV1BlooioDisconnect<TResponse = unknown>(options?: PublicRouteCallOptions<"DELETE /api/v1/blooio/disconnect">): Promise<TResponse>;
    deleteApiV1BrowserSessionsById<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/browser/sessions/{id}">): Promise<TResponse>;
    deleteApiV1ConnectionsByPlatform<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/connections/{platform}">): Promise<TResponse>;
    deleteApiV1ContainersById<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/containers/{id}">): Promise<TResponse>;
    deleteApiV1DiscordConnectionsById<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/discord/connections/{id}">): Promise<TResponse>;
    deleteApiV1KnowledgeById<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/knowledge/{id}">): Promise<TResponse>;
    deleteApiV1KnowledgePreUpload<TResponse = unknown>(options?: PublicRouteCallOptions<"DELETE /api/v1/knowledge/pre-upload">): Promise<TResponse>;
    deleteApiV1McpsByMcpId<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/mcps/{mcpId}">): Promise<TResponse>;
    deleteApiV1McpsByMcpIdPublish<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/mcps/{mcpId}/publish">): Promise<TResponse>;
    deleteApiV1MiladyAgentsByAgentId<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/milady/agents/{agentId}">): Promise<TResponse>;
    deleteApiV1MiladyAgentsByAgentIdDiscord<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/milady/agents/{agentId}/discord">): Promise<TResponse>;
    deleteApiV1MiladyAgentsByAgentIdGithub<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/milady/agents/{agentId}/github">): Promise<TResponse>;
    deleteApiV1MiladyGatewayRelaySessionsBySessionId<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/milady/gateway-relay/sessions/{sessionId}">): Promise<TResponse>;
    deleteApiV1MiladyGoogleCalendarEventsByEventId<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/milady/google/calendar/events/{eventId}">): Promise<TResponse>;
    deleteApiV1OauthConnectionsById<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/oauth/connections/{id}">): Promise<TResponse>;
    deleteApiV1TelegramDisconnect<TResponse = unknown>(options?: PublicRouteCallOptions<"DELETE /api/v1/telegram/disconnect">): Promise<TResponse>;
    deleteApiV1TwilioDisconnect<TResponse = unknown>(options?: PublicRouteCallOptions<"DELETE /api/v1/twilio/disconnect">): Promise<TResponse>;
    deleteApiV1TwitterDisconnect<TResponse = unknown>(options?: PublicRouteCallOptions<"DELETE /api/v1/twitter/disconnect">): Promise<TResponse>;
    deleteApiV1VoiceById<TResponse = unknown>(options: PublicRouteCallOptions<"DELETE /api/v1/voice/{id}">): Promise<TResponse>;
    deleteApiV1WhatsappDisconnect<TResponse = unknown>(options?: PublicRouteCallOptions<"DELETE /api/v1/whatsapp/disconnect">): Promise<TResponse>;
    getApiElevenlabsVoices<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/elevenlabs/voices">): Promise<TResponse>;
    getApiElevenlabsVoicesById<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/elevenlabs/voices/{id}">): Promise<TResponse>;
    getApiElevenlabsVoicesJobs<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/elevenlabs/voices/jobs">): Promise<TResponse>;
    getApiElevenlabsVoicesUser<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/elevenlabs/voices/user">): Promise<TResponse>;
    getApiElevenlabsVoicesVerifyById<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/elevenlabs/voices/verify/{id}">): Promise<TResponse>;
    getApiV1AdminAiPricing<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/admin/ai-pricing">): Promise<TResponse>;
    getApiV1AdminDockerContainers<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/admin/docker-containers">): Promise<TResponse>;
    getApiV1AdminDockerContainersByIdLogs<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/admin/docker-containers/{id}/logs">): Promise<TResponse>;
    getApiV1AdminDockerNodes<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/admin/docker-nodes">): Promise<TResponse>;
    getApiV1AdminDockerNodesByNodeId<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/admin/docker-nodes/{nodeId}">): Promise<TResponse>;
    getApiV1AdminHeadscale<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/admin/headscale">): Promise<TResponse>;
    getApiV1AdminInfrastructure<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/admin/infrastructure">): Promise<TResponse>;
    getApiV1AdminMetrics<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/admin/metrics">): Promise<TResponse>;
    getApiV1AdminModeration<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/admin/moderation">): Promise<TResponse>;
    getApiV1AdminOrgsByOrgIdRateLimits<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/admin/orgs/{orgId}/rate-limits">): Promise<TResponse>;
    getApiV1AdminServicePricing<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/admin/service-pricing">): Promise<TResponse>;
    getApiV1AdminServicePricingAudit<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/admin/service-pricing/audit">): Promise<TResponse>;
    getApiV1AdminUsersByUserIdBillingBreakdown<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/admin/users/{userId}/billing/breakdown">): Promise<TResponse>;
    getApiV1AdvertisingAccounts<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/advertising/accounts">): Promise<TResponse>;
    getApiV1AdvertisingAccountsById<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/advertising/accounts/{id}">): Promise<TResponse>;
    getApiV1AdvertisingCampaigns<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/advertising/campaigns">): Promise<TResponse>;
    getApiV1AdvertisingCampaignsById<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/advertising/campaigns/{id}">): Promise<TResponse>;
    getApiV1AdvertisingCampaignsByIdAnalytics<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/advertising/campaigns/{id}/analytics">): Promise<TResponse>;
    getApiV1AdvertisingCampaignsByIdCreatives<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/advertising/campaigns/{id}/creatives">): Promise<TResponse>;
    getApiV1Affiliates<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/affiliates">): Promise<TResponse>;
    getApiV1AgentsByAgentId<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}">): Promise<TResponse>;
    getApiV1AgentsByAgentIdLogs<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}/logs">): Promise<TResponse>;
    getApiV1AgentsByAgentIdMonetization<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}/monetization">): Promise<TResponse>;
    getApiV1AgentsByAgentIdN8nByPath<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}/n8n/{path}">): Promise<TResponse>;
    getApiV1AgentsByAgentIdStatus<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}/status">): Promise<TResponse>;
    getApiV1AgentsByAgentIdUsage<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}/usage">): Promise<TResponse>;
    getApiV1AgentsByToken<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/agents/by-token">): Promise<TResponse>;
    getApiV1ApiKeys<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/api-keys">): Promise<TResponse>;
    getApiV1ApiKeysExplorer<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/api-keys/explorer">): Promise<TResponse>;
    getApiV1AppAuthSession<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/app-auth/session">): Promise<TResponse>;
    getApiV1AppBuilder<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/app-builder">): Promise<TResponse>;
    getApiV1AppBuilderSessionsBySessionId<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}">): Promise<TResponse>;
    getApiV1AppBuilderSessionsBySessionIdCommit<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/commit">): Promise<TResponse>;
    getApiV1AppBuilderSessionsBySessionIdFiles<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/files">): Promise<TResponse>;
    getApiV1AppBuilderSessionsBySessionIdHistory<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/history">): Promise<TResponse>;
    getApiV1AppBuilderSessionsBySessionIdLogs<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/logs">): Promise<TResponse>;
    getApiV1AppBuilderSessionsBySessionIdPromptsStream(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/prompts/stream">): Promise<Response>;
    getApiV1AppBuilderSessionsBySessionIdSnapshots<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/snapshots">): Promise<TResponse>;
    getApiV1AppBuilderSessionsBySessionIdTerminal(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/terminal">): Promise<Response>;
    getApiV1AppCreditsBalance<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/app-credits/balance">): Promise<TResponse>;
    getApiV1AppCreditsVerify<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/app-credits/verify">): Promise<TResponse>;
    getApiV1Apps<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/apps">): Promise<TResponse>;
    getApiV1AppsById<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}">): Promise<TResponse>;
    getApiV1AppsByIdAnalytics<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/analytics">): Promise<TResponse>;
    getApiV1AppsByIdAnalyticsRequests<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/analytics/requests">): Promise<TResponse>;
    getApiV1AppsByIdCharacters<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/characters">): Promise<TResponse>;
    getApiV1AppsByIdDeploy<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/deploy">): Promise<TResponse>;
    getApiV1AppsByIdDiscordAutomation<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/discord-automation">): Promise<TResponse>;
    getApiV1AppsByIdDomains<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/domains">): Promise<TResponse>;
    getApiV1AppsByIdEarnings<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/earnings">): Promise<TResponse>;
    getApiV1AppsByIdEarningsHistory<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/earnings/history">): Promise<TResponse>;
    getApiV1AppsByIdMonetization<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/monetization">): Promise<TResponse>;
    getApiV1AppsByIdPromote<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/promote">): Promise<TResponse>;
    getApiV1AppsByIdPromoteAnalytics<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/promote/analytics">): Promise<TResponse>;
    getApiV1AppsByIdPromoteAssets<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/promote/assets">): Promise<TResponse>;
    getApiV1AppsByIdPublic<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/public">): Promise<TResponse>;
    getApiV1AppsByIdTelegramAutomation<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/telegram-automation">): Promise<TResponse>;
    getApiV1AppsByIdTwitterAutomation<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/twitter-automation">): Promise<TResponse>;
    getApiV1AppsByIdUsers<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/users">): Promise<TResponse>;
    getApiV1BillingSettings<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/billing/settings">): Promise<TResponse>;
    getApiV1BlooioStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/blooio/status">): Promise<TResponse>;
    getApiV1BrowserSessions<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/browser/sessions">): Promise<TResponse>;
    getApiV1BrowserSessionsById<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/browser/sessions/{id}">): Promise<TResponse>;
    getApiV1BrowserSessionsByIdSnapshot<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/browser/sessions/{id}/snapshot">): Promise<TResponse>;
    getApiV1ChainNftsByChainByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/chain/nfts/{chain}/{address}">): Promise<TResponse>;
    getApiV1ChainTokensByChainByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/chain/tokens/{chain}/{address}">): Promise<TResponse>;
    getApiV1ChainTransfersByChainByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/chain/transfers/{chain}/{address}">): Promise<TResponse>;
    getApiV1Containers<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/containers">): Promise<TResponse>;
    getApiV1ContainersById<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}">): Promise<TResponse>;
    getApiV1ContainersByIdDeployments<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}/deployments">): Promise<TResponse>;
    getApiV1ContainersByIdHealth<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}/health">): Promise<TResponse>;
    getApiV1ContainersByIdLogs<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}/logs">): Promise<TResponse>;
    getApiV1ContainersByIdLogsStream(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}/logs/stream">): Promise<Response>;
    getApiV1ContainersByIdMetrics<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}/metrics">): Promise<TResponse>;
    getApiV1ContainersQuota<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/containers/quota">): Promise<TResponse>;
    getApiV1CreditsBalance<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/credits/balance">): Promise<TResponse>;
    getApiV1CreditsSummary<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/credits/summary">): Promise<TResponse>;
    getApiV1CreditsVerify<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/credits/verify">): Promise<TResponse>;
    getApiV1CronDeploymentMonitor<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/cron/deployment-monitor">): Promise<TResponse>;
    getApiV1CronHealthCheck<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/cron/health-check">): Promise<TResponse>;
    getApiV1CronProcessProvisioningJobs<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/cron/process-provisioning-jobs">): Promise<TResponse>;
    getApiV1CronRefreshModelCatalog<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/cron/refresh-model-catalog">): Promise<TResponse>;
    getApiV1CronRefreshPricing<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/cron/refresh-pricing">): Promise<TResponse>;
    getApiV1Dashboard<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/dashboard">): Promise<TResponse>;
    getApiV1DeviceBusDevicesByDeviceIdIntents<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/device-bus/devices/{deviceId}/intents">): Promise<TResponse>;
    getApiV1DiscordCallback<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/discord/callback">): Promise<TResponse>;
    getApiV1DiscordChannels<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/discord/channels">): Promise<TResponse>;
    getApiV1DiscordConnections<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/discord/connections">): Promise<TResponse>;
    getApiV1DiscordConnectionsById<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/discord/connections/{id}">): Promise<TResponse>;
    getApiV1DiscordGuilds<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/discord/guilds">): Promise<TResponse>;
    getApiV1DiscordOauth<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/discord/oauth">): Promise<TResponse>;
    getApiV1DiscordStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/discord/status">): Promise<TResponse>;
    getApiV1Discovery<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/discovery">): Promise<TResponse>;
    getApiV1ElizaLaunchSessionsBySessionId<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/eliza/launch-sessions/{sessionId}">): Promise<TResponse>;
    getApiV1Gallery<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/gallery">): Promise<TResponse>;
    getApiV1JobsByJobId<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/jobs/{jobId}">): Promise<TResponse>;
    getApiV1Knowledge<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/knowledge">): Promise<TResponse>;
    getApiV1KnowledgeCheck<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/knowledge/check">): Promise<TResponse>;
    getApiV1MarketCandlesByChainByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/market/candles/{chain}/{address}">): Promise<TResponse>;
    getApiV1MarketPortfolioByChainByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/market/portfolio/{chain}/{address}">): Promise<TResponse>;
    getApiV1MarketPreviewPortfolioByChainByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/market/preview/portfolio/{chain}/{address}">): Promise<TResponse>;
    getApiV1MarketPreviewPredictions<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/market/preview/predictions">): Promise<TResponse>;
    getApiV1MarketPreviewPriceByChainByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/market/preview/price/{chain}/{address}">): Promise<TResponse>;
    getApiV1MarketPreviewTokenByChainByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/market/preview/token/{chain}/{address}">): Promise<TResponse>;
    getApiV1MarketPreviewWalletOverview<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/market/preview/wallet-overview">): Promise<TResponse>;
    getApiV1MarketPriceByChainByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/market/price/{chain}/{address}">): Promise<TResponse>;
    getApiV1MarketTokenByChainByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/market/token/{chain}/{address}">): Promise<TResponse>;
    getApiV1MarketTradesByChainByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/market/trades/{chain}/{address}">): Promise<TResponse>;
    getApiV1Mcps<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/mcps">): Promise<TResponse>;
    getApiV1McpsByMcpId<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/mcps/{mcpId}">): Promise<TResponse>;
    getApiV1MiladyAgents<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/agents">): Promise<TResponse>;
    getApiV1MiladyAgentsByAgentId<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}">): Promise<TResponse>;
    getApiV1MiladyAgentsByAgentIdApiWalletByPath<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/api/wallet/{path}">): Promise<TResponse>;
    getApiV1MiladyAgentsByAgentIdBackups<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/backups">): Promise<TResponse>;
    getApiV1MiladyAgentsByAgentIdDiscord<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/discord">): Promise<TResponse>;
    getApiV1MiladyAgentsByAgentIdGithub<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/github">): Promise<TResponse>;
    getApiV1MiladyAgentsByAgentIdGithubToken<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/github/token">): Promise<TResponse>;
    getApiV1MiladyAgentsByAgentIdLifeopsScheduleMergedState<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/lifeops/schedule/merged-state">): Promise<TResponse>;
    getApiV1MiladyAgentsByAgentIdWallet<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/wallet">): Promise<TResponse>;
    getApiV1MiladyGatewayRelaySessionsBySessionIdNext<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/milady/gateway-relay/sessions/{sessionId}/next">): Promise<TResponse>;
    getApiV1MiladyGithubOauthComplete<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/github-oauth-complete">): Promise<TResponse>;
    getApiV1MiladyGoogleAccounts<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/accounts">): Promise<TResponse>;
    getApiV1MiladyGoogleCalendarFeed<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/calendar/feed">): Promise<TResponse>;
    getApiV1MiladyGoogleGmailRead<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/gmail/read">): Promise<TResponse>;
    getApiV1MiladyGoogleGmailSearch<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/gmail/search">): Promise<TResponse>;
    getApiV1MiladyGoogleGmailSubscriptionHeaders<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/gmail/subscription-headers">): Promise<TResponse>;
    getApiV1MiladyGoogleGmailTriage<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/gmail/triage">): Promise<TResponse>;
    getApiV1MiladyGoogleStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/status">): Promise<TResponse>;
    getApiV1MiladyLaunchSessionsBySessionId<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/milady/launch-sessions/{sessionId}">): Promise<TResponse>;
    getApiV1MiladyLifeopsGithubComplete<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/lifeops/github-complete">): Promise<TResponse>;
    getApiV1MiladyPaypalPopupCallback(options?: PublicRouteCallOptions<"GET /api/v1/milady/paypal/popup-callback">): Promise<Response>;
    getApiV1MiladyPaypalStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/paypal/status">): Promise<TResponse>;
    getApiV1MiladyPlaidStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/milady/plaid/status">): Promise<TResponse>;
    getApiV1Models<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/models">): Promise<TResponse>;
    getApiV1ModelsByModel<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/models/{model}">): Promise<TResponse>;
    getApiV1OauthByPlatformCallback<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/oauth/{platform}/callback">): Promise<TResponse>;
    getApiV1OauthCallback<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/oauth/callback">): Promise<TResponse>;
    getApiV1OauthConnections<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/oauth/connections">): Promise<TResponse>;
    getApiV1OauthConnectionsById<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/oauth/connections/{id}">): Promise<TResponse>;
    getApiV1OauthConnectionsByIdToken<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/oauth/connections/{id}/token">): Promise<TResponse>;
    getApiV1OauthInitiate<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/oauth/initiate">): Promise<TResponse>;
    getApiV1OauthProviders<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/oauth/providers">): Promise<TResponse>;
    getApiV1OauthStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/oauth/status">): Promise<TResponse>;
    getApiV1OauthTokenByPlatform<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/oauth/token/{platform}">): Promise<TResponse>;
    getApiV1PricingSummary<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/pricing/summary">): Promise<TResponse>;
    getApiV1ProxyBirdeyeByPath<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/proxy/birdeye/{path}">): Promise<TResponse>;
    getApiV1Redemptions<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/redemptions">): Promise<TResponse>;
    getApiV1RedemptionsById<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/redemptions/{id}">): Promise<TResponse>;
    getApiV1RedemptionsBalance<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/redemptions/balance">): Promise<TResponse>;
    getApiV1RedemptionsQuote<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/redemptions/quote">): Promise<TResponse>;
    getApiV1RedemptionsStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/redemptions/status">): Promise<TResponse>;
    getApiV1Referrals<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/referrals">): Promise<TResponse>;
    getApiV1RemoteSessions<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/remote/sessions">): Promise<TResponse>;
    getApiV1SolanaAssetsByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/solana/assets/{address}">): Promise<TResponse>;
    getApiV1SolanaMethods<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/solana/methods">): Promise<TResponse>;
    getApiV1SolanaTokenAccountsByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/solana/token-accounts/{address}">): Promise<TResponse>;
    getApiV1SolanaTransactionsByAddress<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/solana/transactions/{address}">): Promise<TResponse>;
    getApiV1StewardTenantsCredentials<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/steward/tenants/credentials">): Promise<TResponse>;
    getApiV1TelegramChats<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/telegram/chats">): Promise<TResponse>;
    getApiV1TelegramScanChats<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/telegram/scan-chats">): Promise<TResponse>;
    getApiV1TelegramStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/telegram/status">): Promise<TResponse>;
    getApiV1TwilioStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/twilio/status">): Promise<TResponse>;
    getApiV1TwitterCallback<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/twitter/callback">): Promise<TResponse>;
    getApiV1TwitterStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/twitter/status">): Promise<TResponse>;
    getApiV1User<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/user">): Promise<TResponse>;
    getApiV1UserWallets<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/user/wallets">): Promise<TResponse>;
    getApiV1VoiceById<TResponse = unknown>(options: PublicRouteCallOptions<"GET /api/v1/voice/{id}">): Promise<TResponse>;
    getApiV1VoiceJobs<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/voice/jobs">): Promise<TResponse>;
    getApiV1VoiceList<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/voice/list">): Promise<TResponse>;
    getApiV1WhatsappStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/whatsapp/status">): Promise<TResponse>;
    getApiV1XDmsDigest<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/x/dms/digest">): Promise<TResponse>;
    getApiV1XFeed<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/x/feed">): Promise<TResponse>;
    getApiV1XStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/x/status">): Promise<TResponse>;
    getApiV1X402<TResponse = unknown>(options?: PublicRouteCallOptions<"GET /api/v1/x402">): Promise<TResponse>;
    patchApiElevenlabsVoicesById<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/elevenlabs/voices/{id}">): Promise<TResponse>;
    patchApiV1AdminDockerNodesByNodeId<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/admin/docker-nodes/{nodeId}">): Promise<TResponse>;
    patchApiV1AdminOrgsByOrgIdRateLimits<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/admin/orgs/{orgId}/rate-limits">): Promise<TResponse>;
    patchApiV1AdvertisingCampaignsById<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/advertising/campaigns/{id}">): Promise<TResponse>;
    patchApiV1ApiKeysById<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/api-keys/{id}">): Promise<TResponse>;
    patchApiV1AppBuilderSessionsBySessionId<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/app-builder/sessions/{sessionId}">): Promise<TResponse>;
    patchApiV1AppsById<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/apps/{id}">): Promise<TResponse>;
    patchApiV1ConnectionsByPlatform<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/connections/{platform}">): Promise<TResponse>;
    patchApiV1ContainersById<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/containers/{id}">): Promise<TResponse>;
    patchApiV1DiscordConnectionsById<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/discord/connections/{id}">): Promise<TResponse>;
    patchApiV1MiladyAgentsByAgentId<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/milady/agents/{agentId}">): Promise<TResponse>;
    patchApiV1MiladyGoogleCalendarEventsByEventId<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/milady/google/calendar/events/{eventId}">): Promise<TResponse>;
    patchApiV1User<TResponse = unknown>(options?: PublicRouteCallOptions<"PATCH /api/v1/user">): Promise<TResponse>;
    patchApiV1VoiceById<TResponse = unknown>(options: PublicRouteCallOptions<"PATCH /api/v1/voice/{id}">): Promise<TResponse>;
    postApiElevenlabsStt<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/elevenlabs/stt">): Promise<TResponse>;
    postApiElevenlabsTts(options?: PublicRouteCallOptions<"POST /api/elevenlabs/tts">): Promise<Response>;
    postApiElevenlabsVoicesClone<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/elevenlabs/voices/clone">): Promise<TResponse>;
    postApiV1AdminAiPricing<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/admin/ai-pricing">): Promise<TResponse>;
    postApiV1AdminDockerContainersAudit<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/admin/docker-containers/audit">): Promise<TResponse>;
    postApiV1AdminDockerNodes<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/admin/docker-nodes">): Promise<TResponse>;
    postApiV1AdminDockerNodesByNodeIdHealthCheck<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/admin/docker-nodes/{nodeId}/health-check">): Promise<TResponse>;
    postApiV1AdminDockerNodesSync<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/admin/docker-nodes/sync">): Promise<TResponse>;
    postApiV1AdminInfrastructureContainersActions<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/admin/infrastructure/containers/actions">): Promise<TResponse>;
    postApiV1AdminModeration<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/admin/moderation">): Promise<TResponse>;
    postApiV1AdvertisingAccounts<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/advertising/accounts">): Promise<TResponse>;
    postApiV1AdvertisingCampaigns<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/advertising/campaigns">): Promise<TResponse>;
    postApiV1AdvertisingCampaignsByIdCreatives<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/advertising/campaigns/{id}/creatives">): Promise<TResponse>;
    postApiV1AdvertisingCampaignsByIdPause<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/advertising/campaigns/{id}/pause">): Promise<TResponse>;
    postApiV1AdvertisingCampaignsByIdStart<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/advertising/campaigns/{id}/start">): Promise<TResponse>;
    postApiV1Affiliates<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/affiliates">): Promise<TResponse>;
    postApiV1AffiliatesLink<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/affiliates/link">): Promise<TResponse>;
    postApiV1Agents<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/agents">): Promise<TResponse>;
    postApiV1AgentsByAgentIdN8nByPath<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/agents/{agentId}/n8n/{path}">): Promise<TResponse>;
    postApiV1AgentsByAgentIdPublish<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/agents/{agentId}/publish">): Promise<TResponse>;
    postApiV1AgentsByAgentIdRestart<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/agents/{agentId}/restart">): Promise<TResponse>;
    postApiV1AgentsByAgentIdResume<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/agents/{agentId}/resume">): Promise<TResponse>;
    postApiV1AgentsByAgentIdSuspend<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/agents/{agentId}/suspend">): Promise<TResponse>;
    postApiV1ApiKeys<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/api-keys">): Promise<TResponse>;
    postApiV1ApiKeysByIdRegenerate<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/api-keys/{id}/regenerate">): Promise<TResponse>;
    postApiV1AppAuthConnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/app-auth/connect">): Promise<TResponse>;
    postApiV1AppBuilder<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/app-builder">): Promise<TResponse>;
    postApiV1AppBuilderImages<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/app-builder/images">): Promise<TResponse>;
    postApiV1AppBuilderSessionsBySessionIdCommit<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/commit">): Promise<TResponse>;
    postApiV1AppBuilderSessionsBySessionIdFiles<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/files">): Promise<TResponse>;
    postApiV1AppBuilderSessionsBySessionIdPromptsStream(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/prompts/stream">): Promise<Response>;
    postApiV1AppBuilderSessionsBySessionIdResumeStream(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/resume/stream">): Promise<Response>;
    postApiV1AppBuilderSessionsBySessionIdRollback<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/rollback">): Promise<TResponse>;
    postApiV1AppBuilderSessionsBySessionIdTerminal<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/terminal">): Promise<TResponse>;
    postApiV1AppBuilderStream(options?: PublicRouteCallOptions<"POST /api/v1/app-builder/stream">): Promise<Response>;
    postApiV1AppCreditsCheckout<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/app-credits/checkout">): Promise<TResponse>;
    postApiV1AppAgents<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/app/agents">): Promise<TResponse>;
    postApiV1Apps<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/apps">): Promise<TResponse>;
    postApiV1AppsByIdChat<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/chat">): Promise<TResponse>;
    postApiV1AppsByIdDeploy<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/deploy">): Promise<TResponse>;
    postApiV1AppsByIdDiscordAutomation<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/discord-automation">): Promise<TResponse>;
    postApiV1AppsByIdDiscordAutomationPost<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/discord-automation/post">): Promise<TResponse>;
    postApiV1AppsByIdDomains<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/domains">): Promise<TResponse>;
    postApiV1AppsByIdDomainsStatus<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/domains/status">): Promise<TResponse>;
    postApiV1AppsByIdDomainsSync<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/domains/sync">): Promise<TResponse>;
    postApiV1AppsByIdDomainsVerify<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/domains/verify">): Promise<TResponse>;
    postApiV1AppsByIdEarningsWithdraw<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/earnings/withdraw">): Promise<TResponse>;
    postApiV1AppsByIdPromote<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/promote">): Promise<TResponse>;
    postApiV1AppsByIdPromoteAssets<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/promote/assets">): Promise<TResponse>;
    postApiV1AppsByIdPromotePreview<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/promote/preview">): Promise<TResponse>;
    postApiV1AppsByIdRegenerateApiKey<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/regenerate-api-key">): Promise<TResponse>;
    postApiV1AppsByIdTelegramAutomation<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/telegram-automation">): Promise<TResponse>;
    postApiV1AppsByIdTelegramAutomationPost<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/telegram-automation/post">): Promise<TResponse>;
    postApiV1AppsByIdTwitterAutomation<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/twitter-automation">): Promise<TResponse>;
    postApiV1AppsByIdTwitterAutomationPost<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/twitter-automation/post">): Promise<TResponse>;
    postApiV1AppsCheckName<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/apps/check-name">): Promise<TResponse>;
    postApiV1BlooioConnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/blooio/connect">): Promise<TResponse>;
    postApiV1BlooioDisconnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/blooio/disconnect">): Promise<TResponse>;
    postApiV1BlooioWebhookSecret<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/blooio/webhook-secret">): Promise<TResponse>;
    postApiV1BrowserSessions<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/browser/sessions">): Promise<TResponse>;
    postApiV1BrowserSessionsByIdCommand<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/browser/sessions/{id}/command">): Promise<TResponse>;
    postApiV1BrowserSessionsByIdNavigate<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/browser/sessions/{id}/navigate">): Promise<TResponse>;
    postApiV1CharacterAssistant<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/character-assistant">): Promise<TResponse>;
    postApiV1Chat<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/chat">): Promise<TResponse>;
    postApiV1ChatCompletions<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/chat/completions">): Promise<TResponse>;
    postApiV1ConnectionsByPlatform<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/connections/{platform}">): Promise<TResponse>;
    postApiV1Containers<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/containers">): Promise<TResponse>;
    postApiV1ContainersCredentials<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/containers/credentials">): Promise<TResponse>;
    postApiV1CreditsCheckout<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/credits/checkout">): Promise<TResponse>;
    postApiV1CronDeploymentMonitor<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/cron/deployment-monitor">): Promise<TResponse>;
    postApiV1CronHealthCheck<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/cron/health-check">): Promise<TResponse>;
    postApiV1CronProcessProvisioningJobs<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/cron/process-provisioning-jobs">): Promise<TResponse>;
    postApiV1CronRefreshModelCatalog<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/cron/refresh-model-catalog">): Promise<TResponse>;
    postApiV1CronRefreshPricing<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/cron/refresh-pricing">): Promise<TResponse>;
    postApiV1DeviceBusDevices<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/device-bus/devices">): Promise<TResponse>;
    postApiV1DeviceBusIntents<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/device-bus/intents">): Promise<TResponse>;
    postApiV1DiscordChannelsRefresh<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/discord/channels/refresh">): Promise<TResponse>;
    postApiV1DiscordConnections<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/discord/connections">): Promise<TResponse>;
    postApiV1DiscordDisconnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/discord/disconnect">): Promise<TResponse>;
    postApiV1Embeddings<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/embeddings">): Promise<TResponse>;
    postApiV1Extract<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/extract">): Promise<TResponse>;
    postApiV1GenerateImage<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/generate-image">): Promise<TResponse>;
    postApiV1GeneratePrompts<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/generate-prompts">): Promise<TResponse>;
    postApiV1GenerateVideo<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/generate-video">): Promise<TResponse>;
    postApiV1Knowledge<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/knowledge">): Promise<TResponse>;
    postApiV1KnowledgePreUpload<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/knowledge/pre-upload">): Promise<TResponse>;
    postApiV1KnowledgeQuery<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/knowledge/query">): Promise<TResponse>;
    postApiV1KnowledgeSubmit<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/knowledge/submit">): Promise<TResponse>;
    postApiV1KnowledgeUploadFile<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/knowledge/upload-file">): Promise<TResponse>;
    postApiV1Mcps<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/mcps">): Promise<TResponse>;
    postApiV1McpsByMcpIdPublish<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/mcps/{mcpId}/publish">): Promise<TResponse>;
    postApiV1Messages<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/messages">): Promise<TResponse>;
    postApiV1MiladyAgents<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/agents">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdApiWalletByPath<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/api/wallet/{path}">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdBridge<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/bridge">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdDiscordOauth<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/discord/oauth">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdGithubLink<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/github/link">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdGithubOauth<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/github/oauth">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdLifeopsScheduleObservations<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/lifeops/schedule/observations">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdPairingToken<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/pairing-token">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdProvision<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/provision">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdRestore<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/restore">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdResume<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/resume">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdSnapshot<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/snapshot">): Promise<TResponse>;
    postApiV1MiladyAgentsByAgentIdStream(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/stream">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdSuspend<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/suspend">): Promise<TResponse>;
    postApiV1MiladyDiscordGatewayAgent<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/discord/gateway-agent">): Promise<TResponse>;
    postApiV1MiladyGatewayRelaySessions<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/gateway-relay/sessions">): Promise<TResponse>;
    postApiV1MiladyGatewayRelaySessionsBySessionIdResponses<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/milady/gateway-relay/sessions/{sessionId}/responses">): Promise<TResponse>;
    postApiV1MiladyGoogleCalendarEvents<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/google/calendar/events">): Promise<TResponse>;
    postApiV1MiladyGoogleConnectInitiate<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/google/connect/initiate">): Promise<TResponse>;
    postApiV1MiladyGoogleDisconnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/google/disconnect">): Promise<TResponse>;
    postApiV1MiladyGoogleGmailMessageSend<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/google/gmail/message-send">): Promise<TResponse>;
    postApiV1MiladyGoogleGmailReplySend<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/google/gmail/reply-send">): Promise<TResponse>;
    postApiV1MiladyPaypalAuthorize<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/paypal/authorize">): Promise<TResponse>;
    postApiV1MiladyPaypalCallback<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/paypal/callback">): Promise<TResponse>;
    postApiV1MiladyPaypalRefresh<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/paypal/refresh">): Promise<TResponse>;
    postApiV1MiladyPaypalTransactions<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/paypal/transactions">): Promise<TResponse>;
    postApiV1MiladyPlaidExchange<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/plaid/exchange">): Promise<TResponse>;
    postApiV1MiladyPlaidLinkToken<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/plaid/link-token">): Promise<TResponse>;
    postApiV1MiladyPlaidSync<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/milady/plaid/sync">): Promise<TResponse>;
    postApiV1ModelsStatus<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/models/status">): Promise<TResponse>;
    postApiV1OauthByPlatformInitiate<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/oauth/{platform}/initiate">): Promise<TResponse>;
    postApiV1OauthConnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/oauth/connect">): Promise<TResponse>;
    postApiV1OauthInitiate<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/oauth/initiate">): Promise<TResponse>;
    postApiV1ProxyEvmRpcByChain<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/proxy/evm-rpc/{chain}">): Promise<TResponse>;
    postApiV1ProxySolanaRpc<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/proxy/solana-rpc">): Promise<TResponse>;
    postApiV1Redemptions<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/redemptions">): Promise<TResponse>;
    postApiV1ReferralsApply<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/referrals/apply">): Promise<TResponse>;
    postApiV1RemotePair<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/remote/pair">): Promise<TResponse>;
    postApiV1RemoteSessionsByIdRevoke<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/remote/sessions/{id}/revoke">): Promise<TResponse>;
    postApiV1ReportsBug<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/reports/bug">): Promise<TResponse>;
    postApiV1Responses<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/responses">): Promise<TResponse>;
    postApiV1RpcByChain<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/rpc/{chain}">): Promise<TResponse>;
    postApiV1Search<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/search">): Promise<TResponse>;
    postApiV1SolanaRpc<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/solana/rpc">): Promise<TResponse>;
    postApiV1StewardTenants<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/steward/tenants">): Promise<TResponse>;
    postApiV1TelegramConnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/telegram/connect">): Promise<TResponse>;
    postApiV1TelegramScanChats<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/telegram/scan-chats">): Promise<TResponse>;
    postApiV1TelegramWebhookByOrgId<TResponse = unknown>(options: PublicRouteCallOptions<"POST /api/v1/telegram/webhook/{orgId}">): Promise<TResponse>;
    postApiV1Topup10<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/topup/10">): Promise<TResponse>;
    postApiV1Topup100<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/topup/100">): Promise<TResponse>;
    postApiV1Topup50<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/topup/50">): Promise<TResponse>;
    postApiV1TrackPageview<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/track/pageview">): Promise<TResponse>;
    postApiV1TwilioConnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/twilio/connect">): Promise<TResponse>;
    postApiV1TwilioDisconnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/twilio/disconnect">): Promise<TResponse>;
    postApiV1TwilioVoiceInbound<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/twilio/voice/inbound">): Promise<TResponse>;
    postApiV1TwitterConnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/twitter/connect">): Promise<TResponse>;
    postApiV1UserWalletsProvision<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/user/wallets/provision">): Promise<TResponse>;
    postApiV1UserWalletsRpc<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/user/wallets/rpc">): Promise<TResponse>;
    postApiV1VoiceClone<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/voice/clone">): Promise<TResponse>;
    postApiV1VoiceStt<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/voice/stt">): Promise<TResponse>;
    postApiV1VoiceTts(options?: PublicRouteCallOptions<"POST /api/v1/voice/tts">): Promise<Response>;
    postApiV1WhatsappConnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/whatsapp/connect">): Promise<TResponse>;
    postApiV1WhatsappDisconnect<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/whatsapp/disconnect">): Promise<TResponse>;
    postApiV1XDmsConversationsSend<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/x/dms/conversations/send">): Promise<TResponse>;
    postApiV1XDmsCurate<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/x/dms/curate">): Promise<TResponse>;
    postApiV1XDmsGroups<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/x/dms/groups">): Promise<TResponse>;
    postApiV1XDmsSend<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/x/dms/send">): Promise<TResponse>;
    postApiV1XPosts<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/x/posts">): Promise<TResponse>;
    postApiV1X402Settle<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/x402/settle">): Promise<TResponse>;
    postApiV1X402Verify<TResponse = unknown>(options?: PublicRouteCallOptions<"POST /api/v1/x402/verify">): Promise<TResponse>;
    putApiV1AdminAiPricing<TResponse = unknown>(options?: PublicRouteCallOptions<"PUT /api/v1/admin/ai-pricing">): Promise<TResponse>;
    putApiV1AdminServicePricing<TResponse = unknown>(options?: PublicRouteCallOptions<"PUT /api/v1/admin/service-pricing">): Promise<TResponse>;
    putApiV1Affiliates<TResponse = unknown>(options?: PublicRouteCallOptions<"PUT /api/v1/affiliates">): Promise<TResponse>;
    putApiV1AgentsByAgentIdMonetization<TResponse = unknown>(options: PublicRouteCallOptions<"PUT /api/v1/agents/{agentId}/monetization">): Promise<TResponse>;
    putApiV1AgentsByAgentIdN8nByPath<TResponse = unknown>(options: PublicRouteCallOptions<"PUT /api/v1/agents/{agentId}/n8n/{path}">): Promise<TResponse>;
    putApiV1AppsById<TResponse = unknown>(options: PublicRouteCallOptions<"PUT /api/v1/apps/{id}">): Promise<TResponse>;
    putApiV1AppsByIdCharacters<TResponse = unknown>(options: PublicRouteCallOptions<"PUT /api/v1/apps/{id}/characters">): Promise<TResponse>;
    putApiV1AppsByIdMonetization<TResponse = unknown>(options: PublicRouteCallOptions<"PUT /api/v1/apps/{id}/monetization">): Promise<TResponse>;
    putApiV1BillingSettings<TResponse = unknown>(options?: PublicRouteCallOptions<"PUT /api/v1/billing/settings">): Promise<TResponse>;
    putApiV1McpsByMcpId<TResponse = unknown>(options: PublicRouteCallOptions<"PUT /api/v1/mcps/{mcpId}">): Promise<TResponse>;
    deleteApiElevenlabsVoicesByIdRaw(options: PublicRouteCallOptions<"DELETE /api/elevenlabs/voices/{id}">): Promise<Response>;
    deleteApiV1AdminDockerNodesByNodeIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/admin/docker-nodes/{nodeId}">): Promise<Response>;
    deleteApiV1AdminOrgsByOrgIdRateLimitsRaw(options: PublicRouteCallOptions<"DELETE /api/v1/admin/orgs/{orgId}/rate-limits">): Promise<Response>;
    deleteApiV1AdvertisingAccountsByIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/advertising/accounts/{id}">): Promise<Response>;
    deleteApiV1AdvertisingCampaignsByIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/advertising/campaigns/{id}">): Promise<Response>;
    deleteApiV1AgentsByAgentIdN8nByPathRaw(options: PublicRouteCallOptions<"DELETE /api/v1/agents/{agentId}/n8n/{path}">): Promise<Response>;
    deleteApiV1AgentsByAgentIdPublishRaw(options: PublicRouteCallOptions<"DELETE /api/v1/agents/{agentId}/publish">): Promise<Response>;
    deleteApiV1ApiKeysByIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/api-keys/{id}">): Promise<Response>;
    deleteApiV1AppBuilderSessionsBySessionIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/app-builder/sessions/{sessionId}">): Promise<Response>;
    deleteApiV1AppsByIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/apps/{id}">): Promise<Response>;
    deleteApiV1AppsByIdDiscordAutomationRaw(options: PublicRouteCallOptions<"DELETE /api/v1/apps/{id}/discord-automation">): Promise<Response>;
    deleteApiV1AppsByIdDomainsRaw(options: PublicRouteCallOptions<"DELETE /api/v1/apps/{id}/domains">): Promise<Response>;
    deleteApiV1AppsByIdTelegramAutomationRaw(options: PublicRouteCallOptions<"DELETE /api/v1/apps/{id}/telegram-automation">): Promise<Response>;
    deleteApiV1AppsByIdTwitterAutomationRaw(options: PublicRouteCallOptions<"DELETE /api/v1/apps/{id}/twitter-automation">): Promise<Response>;
    deleteApiV1BlooioDisconnectRaw(options?: PublicRouteCallOptions<"DELETE /api/v1/blooio/disconnect">): Promise<Response>;
    deleteApiV1BrowserSessionsByIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/browser/sessions/{id}">): Promise<Response>;
    deleteApiV1ConnectionsByPlatformRaw(options: PublicRouteCallOptions<"DELETE /api/v1/connections/{platform}">): Promise<Response>;
    deleteApiV1ContainersByIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/containers/{id}">): Promise<Response>;
    deleteApiV1DiscordConnectionsByIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/discord/connections/{id}">): Promise<Response>;
    deleteApiV1KnowledgeByIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/knowledge/{id}">): Promise<Response>;
    deleteApiV1KnowledgePreUploadRaw(options?: PublicRouteCallOptions<"DELETE /api/v1/knowledge/pre-upload">): Promise<Response>;
    deleteApiV1McpsByMcpIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/mcps/{mcpId}">): Promise<Response>;
    deleteApiV1McpsByMcpIdPublishRaw(options: PublicRouteCallOptions<"DELETE /api/v1/mcps/{mcpId}/publish">): Promise<Response>;
    deleteApiV1MiladyAgentsByAgentIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/milady/agents/{agentId}">): Promise<Response>;
    deleteApiV1MiladyAgentsByAgentIdDiscordRaw(options: PublicRouteCallOptions<"DELETE /api/v1/milady/agents/{agentId}/discord">): Promise<Response>;
    deleteApiV1MiladyAgentsByAgentIdGithubRaw(options: PublicRouteCallOptions<"DELETE /api/v1/milady/agents/{agentId}/github">): Promise<Response>;
    deleteApiV1MiladyGatewayRelaySessionsBySessionIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/milady/gateway-relay/sessions/{sessionId}">): Promise<Response>;
    deleteApiV1MiladyGoogleCalendarEventsByEventIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/milady/google/calendar/events/{eventId}">): Promise<Response>;
    deleteApiV1OauthConnectionsByIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/oauth/connections/{id}">): Promise<Response>;
    deleteApiV1TelegramDisconnectRaw(options?: PublicRouteCallOptions<"DELETE /api/v1/telegram/disconnect">): Promise<Response>;
    deleteApiV1TwilioDisconnectRaw(options?: PublicRouteCallOptions<"DELETE /api/v1/twilio/disconnect">): Promise<Response>;
    deleteApiV1TwitterDisconnectRaw(options?: PublicRouteCallOptions<"DELETE /api/v1/twitter/disconnect">): Promise<Response>;
    deleteApiV1VoiceByIdRaw(options: PublicRouteCallOptions<"DELETE /api/v1/voice/{id}">): Promise<Response>;
    deleteApiV1WhatsappDisconnectRaw(options?: PublicRouteCallOptions<"DELETE /api/v1/whatsapp/disconnect">): Promise<Response>;
    getApiElevenlabsVoicesRaw(options?: PublicRouteCallOptions<"GET /api/elevenlabs/voices">): Promise<Response>;
    getApiElevenlabsVoicesByIdRaw(options: PublicRouteCallOptions<"GET /api/elevenlabs/voices/{id}">): Promise<Response>;
    getApiElevenlabsVoicesJobsRaw(options?: PublicRouteCallOptions<"GET /api/elevenlabs/voices/jobs">): Promise<Response>;
    getApiElevenlabsVoicesUserRaw(options?: PublicRouteCallOptions<"GET /api/elevenlabs/voices/user">): Promise<Response>;
    getApiElevenlabsVoicesVerifyByIdRaw(options: PublicRouteCallOptions<"GET /api/elevenlabs/voices/verify/{id}">): Promise<Response>;
    getApiV1AdminAiPricingRaw(options?: PublicRouteCallOptions<"GET /api/v1/admin/ai-pricing">): Promise<Response>;
    getApiV1AdminDockerContainersRaw(options?: PublicRouteCallOptions<"GET /api/v1/admin/docker-containers">): Promise<Response>;
    getApiV1AdminDockerContainersByIdLogsRaw(options: PublicRouteCallOptions<"GET /api/v1/admin/docker-containers/{id}/logs">): Promise<Response>;
    getApiV1AdminDockerNodesRaw(options?: PublicRouteCallOptions<"GET /api/v1/admin/docker-nodes">): Promise<Response>;
    getApiV1AdminDockerNodesByNodeIdRaw(options: PublicRouteCallOptions<"GET /api/v1/admin/docker-nodes/{nodeId}">): Promise<Response>;
    getApiV1AdminHeadscaleRaw(options?: PublicRouteCallOptions<"GET /api/v1/admin/headscale">): Promise<Response>;
    getApiV1AdminInfrastructureRaw(options?: PublicRouteCallOptions<"GET /api/v1/admin/infrastructure">): Promise<Response>;
    getApiV1AdminMetricsRaw(options?: PublicRouteCallOptions<"GET /api/v1/admin/metrics">): Promise<Response>;
    getApiV1AdminModerationRaw(options?: PublicRouteCallOptions<"GET /api/v1/admin/moderation">): Promise<Response>;
    getApiV1AdminOrgsByOrgIdRateLimitsRaw(options: PublicRouteCallOptions<"GET /api/v1/admin/orgs/{orgId}/rate-limits">): Promise<Response>;
    getApiV1AdminServicePricingRaw(options?: PublicRouteCallOptions<"GET /api/v1/admin/service-pricing">): Promise<Response>;
    getApiV1AdminServicePricingAuditRaw(options?: PublicRouteCallOptions<"GET /api/v1/admin/service-pricing/audit">): Promise<Response>;
    getApiV1AdminUsersByUserIdBillingBreakdownRaw(options: PublicRouteCallOptions<"GET /api/v1/admin/users/{userId}/billing/breakdown">): Promise<Response>;
    getApiV1AdvertisingAccountsRaw(options?: PublicRouteCallOptions<"GET /api/v1/advertising/accounts">): Promise<Response>;
    getApiV1AdvertisingAccountsByIdRaw(options: PublicRouteCallOptions<"GET /api/v1/advertising/accounts/{id}">): Promise<Response>;
    getApiV1AdvertisingCampaignsRaw(options?: PublicRouteCallOptions<"GET /api/v1/advertising/campaigns">): Promise<Response>;
    getApiV1AdvertisingCampaignsByIdRaw(options: PublicRouteCallOptions<"GET /api/v1/advertising/campaigns/{id}">): Promise<Response>;
    getApiV1AdvertisingCampaignsByIdAnalyticsRaw(options: PublicRouteCallOptions<"GET /api/v1/advertising/campaigns/{id}/analytics">): Promise<Response>;
    getApiV1AdvertisingCampaignsByIdCreativesRaw(options: PublicRouteCallOptions<"GET /api/v1/advertising/campaigns/{id}/creatives">): Promise<Response>;
    getApiV1AffiliatesRaw(options?: PublicRouteCallOptions<"GET /api/v1/affiliates">): Promise<Response>;
    getApiV1AgentsByAgentIdRaw(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}">): Promise<Response>;
    getApiV1AgentsByAgentIdLogsRaw(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}/logs">): Promise<Response>;
    getApiV1AgentsByAgentIdMonetizationRaw(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}/monetization">): Promise<Response>;
    getApiV1AgentsByAgentIdN8nByPathRaw(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}/n8n/{path}">): Promise<Response>;
    getApiV1AgentsByAgentIdStatusRaw(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}/status">): Promise<Response>;
    getApiV1AgentsByAgentIdUsageRaw(options: PublicRouteCallOptions<"GET /api/v1/agents/{agentId}/usage">): Promise<Response>;
    getApiV1AgentsByTokenRaw(options?: PublicRouteCallOptions<"GET /api/v1/agents/by-token">): Promise<Response>;
    getApiV1ApiKeysRaw(options?: PublicRouteCallOptions<"GET /api/v1/api-keys">): Promise<Response>;
    getApiV1ApiKeysExplorerRaw(options?: PublicRouteCallOptions<"GET /api/v1/api-keys/explorer">): Promise<Response>;
    getApiV1AppAuthSessionRaw(options?: PublicRouteCallOptions<"GET /api/v1/app-auth/session">): Promise<Response>;
    getApiV1AppBuilderRaw(options?: PublicRouteCallOptions<"GET /api/v1/app-builder">): Promise<Response>;
    getApiV1AppBuilderSessionsBySessionIdRaw(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}">): Promise<Response>;
    getApiV1AppBuilderSessionsBySessionIdCommitRaw(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/commit">): Promise<Response>;
    getApiV1AppBuilderSessionsBySessionIdFilesRaw(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/files">): Promise<Response>;
    getApiV1AppBuilderSessionsBySessionIdHistoryRaw(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/history">): Promise<Response>;
    getApiV1AppBuilderSessionsBySessionIdLogsRaw(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/logs">): Promise<Response>;
    getApiV1AppBuilderSessionsBySessionIdPromptsStreamRaw(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/prompts/stream">): Promise<Response>;
    getApiV1AppBuilderSessionsBySessionIdSnapshotsRaw(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/snapshots">): Promise<Response>;
    getApiV1AppBuilderSessionsBySessionIdTerminalRaw(options: PublicRouteCallOptions<"GET /api/v1/app-builder/sessions/{sessionId}/terminal">): Promise<Response>;
    getApiV1AppCreditsBalanceRaw(options?: PublicRouteCallOptions<"GET /api/v1/app-credits/balance">): Promise<Response>;
    getApiV1AppCreditsVerifyRaw(options?: PublicRouteCallOptions<"GET /api/v1/app-credits/verify">): Promise<Response>;
    getApiV1AppsRaw(options?: PublicRouteCallOptions<"GET /api/v1/apps">): Promise<Response>;
    getApiV1AppsByIdRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}">): Promise<Response>;
    getApiV1AppsByIdAnalyticsRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/analytics">): Promise<Response>;
    getApiV1AppsByIdAnalyticsRequestsRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/analytics/requests">): Promise<Response>;
    getApiV1AppsByIdCharactersRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/characters">): Promise<Response>;
    getApiV1AppsByIdDeployRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/deploy">): Promise<Response>;
    getApiV1AppsByIdDiscordAutomationRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/discord-automation">): Promise<Response>;
    getApiV1AppsByIdDomainsRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/domains">): Promise<Response>;
    getApiV1AppsByIdEarningsRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/earnings">): Promise<Response>;
    getApiV1AppsByIdEarningsHistoryRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/earnings/history">): Promise<Response>;
    getApiV1AppsByIdMonetizationRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/monetization">): Promise<Response>;
    getApiV1AppsByIdPromoteRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/promote">): Promise<Response>;
    getApiV1AppsByIdPromoteAnalyticsRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/promote/analytics">): Promise<Response>;
    getApiV1AppsByIdPromoteAssetsRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/promote/assets">): Promise<Response>;
    getApiV1AppsByIdPublicRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/public">): Promise<Response>;
    getApiV1AppsByIdTelegramAutomationRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/telegram-automation">): Promise<Response>;
    getApiV1AppsByIdTwitterAutomationRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/twitter-automation">): Promise<Response>;
    getApiV1AppsByIdUsersRaw(options: PublicRouteCallOptions<"GET /api/v1/apps/{id}/users">): Promise<Response>;
    getApiV1BillingSettingsRaw(options?: PublicRouteCallOptions<"GET /api/v1/billing/settings">): Promise<Response>;
    getApiV1BlooioStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/blooio/status">): Promise<Response>;
    getApiV1BrowserSessionsRaw(options?: PublicRouteCallOptions<"GET /api/v1/browser/sessions">): Promise<Response>;
    getApiV1BrowserSessionsByIdRaw(options: PublicRouteCallOptions<"GET /api/v1/browser/sessions/{id}">): Promise<Response>;
    getApiV1BrowserSessionsByIdSnapshotRaw(options: PublicRouteCallOptions<"GET /api/v1/browser/sessions/{id}/snapshot">): Promise<Response>;
    getApiV1ChainNftsByChainByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/chain/nfts/{chain}/{address}">): Promise<Response>;
    getApiV1ChainTokensByChainByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/chain/tokens/{chain}/{address}">): Promise<Response>;
    getApiV1ChainTransfersByChainByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/chain/transfers/{chain}/{address}">): Promise<Response>;
    getApiV1ContainersRaw(options?: PublicRouteCallOptions<"GET /api/v1/containers">): Promise<Response>;
    getApiV1ContainersByIdRaw(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}">): Promise<Response>;
    getApiV1ContainersByIdDeploymentsRaw(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}/deployments">): Promise<Response>;
    getApiV1ContainersByIdHealthRaw(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}/health">): Promise<Response>;
    getApiV1ContainersByIdLogsRaw(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}/logs">): Promise<Response>;
    getApiV1ContainersByIdLogsStreamRaw(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}/logs/stream">): Promise<Response>;
    getApiV1ContainersByIdMetricsRaw(options: PublicRouteCallOptions<"GET /api/v1/containers/{id}/metrics">): Promise<Response>;
    getApiV1ContainersQuotaRaw(options?: PublicRouteCallOptions<"GET /api/v1/containers/quota">): Promise<Response>;
    getApiV1CreditsBalanceRaw(options?: PublicRouteCallOptions<"GET /api/v1/credits/balance">): Promise<Response>;
    getApiV1CreditsSummaryRaw(options?: PublicRouteCallOptions<"GET /api/v1/credits/summary">): Promise<Response>;
    getApiV1CreditsVerifyRaw(options?: PublicRouteCallOptions<"GET /api/v1/credits/verify">): Promise<Response>;
    getApiV1CronDeploymentMonitorRaw(options?: PublicRouteCallOptions<"GET /api/v1/cron/deployment-monitor">): Promise<Response>;
    getApiV1CronHealthCheckRaw(options?: PublicRouteCallOptions<"GET /api/v1/cron/health-check">): Promise<Response>;
    getApiV1CronProcessProvisioningJobsRaw(options?: PublicRouteCallOptions<"GET /api/v1/cron/process-provisioning-jobs">): Promise<Response>;
    getApiV1CronRefreshModelCatalogRaw(options?: PublicRouteCallOptions<"GET /api/v1/cron/refresh-model-catalog">): Promise<Response>;
    getApiV1CronRefreshPricingRaw(options?: PublicRouteCallOptions<"GET /api/v1/cron/refresh-pricing">): Promise<Response>;
    getApiV1DashboardRaw(options?: PublicRouteCallOptions<"GET /api/v1/dashboard">): Promise<Response>;
    getApiV1DeviceBusDevicesByDeviceIdIntentsRaw(options: PublicRouteCallOptions<"GET /api/v1/device-bus/devices/{deviceId}/intents">): Promise<Response>;
    getApiV1DiscordCallbackRaw(options?: PublicRouteCallOptions<"GET /api/v1/discord/callback">): Promise<Response>;
    getApiV1DiscordChannelsRaw(options?: PublicRouteCallOptions<"GET /api/v1/discord/channels">): Promise<Response>;
    getApiV1DiscordConnectionsRaw(options?: PublicRouteCallOptions<"GET /api/v1/discord/connections">): Promise<Response>;
    getApiV1DiscordConnectionsByIdRaw(options: PublicRouteCallOptions<"GET /api/v1/discord/connections/{id}">): Promise<Response>;
    getApiV1DiscordGuildsRaw(options?: PublicRouteCallOptions<"GET /api/v1/discord/guilds">): Promise<Response>;
    getApiV1DiscordOauthRaw(options?: PublicRouteCallOptions<"GET /api/v1/discord/oauth">): Promise<Response>;
    getApiV1DiscordStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/discord/status">): Promise<Response>;
    getApiV1DiscoveryRaw(options?: PublicRouteCallOptions<"GET /api/v1/discovery">): Promise<Response>;
    getApiV1ElizaLaunchSessionsBySessionIdRaw(options: PublicRouteCallOptions<"GET /api/v1/eliza/launch-sessions/{sessionId}">): Promise<Response>;
    getApiV1GalleryRaw(options?: PublicRouteCallOptions<"GET /api/v1/gallery">): Promise<Response>;
    getApiV1JobsByJobIdRaw(options: PublicRouteCallOptions<"GET /api/v1/jobs/{jobId}">): Promise<Response>;
    getApiV1KnowledgeRaw(options?: PublicRouteCallOptions<"GET /api/v1/knowledge">): Promise<Response>;
    getApiV1KnowledgeCheckRaw(options?: PublicRouteCallOptions<"GET /api/v1/knowledge/check">): Promise<Response>;
    getApiV1MarketCandlesByChainByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/market/candles/{chain}/{address}">): Promise<Response>;
    getApiV1MarketPortfolioByChainByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/market/portfolio/{chain}/{address}">): Promise<Response>;
    getApiV1MarketPreviewPortfolioByChainByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/market/preview/portfolio/{chain}/{address}">): Promise<Response>;
    getApiV1MarketPreviewPredictionsRaw(options?: PublicRouteCallOptions<"GET /api/v1/market/preview/predictions">): Promise<Response>;
    getApiV1MarketPreviewPriceByChainByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/market/preview/price/{chain}/{address}">): Promise<Response>;
    getApiV1MarketPreviewTokenByChainByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/market/preview/token/{chain}/{address}">): Promise<Response>;
    getApiV1MarketPreviewWalletOverviewRaw(options?: PublicRouteCallOptions<"GET /api/v1/market/preview/wallet-overview">): Promise<Response>;
    getApiV1MarketPriceByChainByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/market/price/{chain}/{address}">): Promise<Response>;
    getApiV1MarketTokenByChainByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/market/token/{chain}/{address}">): Promise<Response>;
    getApiV1MarketTradesByChainByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/market/trades/{chain}/{address}">): Promise<Response>;
    getApiV1McpsRaw(options?: PublicRouteCallOptions<"GET /api/v1/mcps">): Promise<Response>;
    getApiV1McpsByMcpIdRaw(options: PublicRouteCallOptions<"GET /api/v1/mcps/{mcpId}">): Promise<Response>;
    getApiV1MiladyAgentsRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/agents">): Promise<Response>;
    getApiV1MiladyAgentsByAgentIdRaw(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}">): Promise<Response>;
    getApiV1MiladyAgentsByAgentIdApiWalletByPathRaw(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/api/wallet/{path}">): Promise<Response>;
    getApiV1MiladyAgentsByAgentIdBackupsRaw(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/backups">): Promise<Response>;
    getApiV1MiladyAgentsByAgentIdDiscordRaw(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/discord">): Promise<Response>;
    getApiV1MiladyAgentsByAgentIdGithubRaw(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/github">): Promise<Response>;
    getApiV1MiladyAgentsByAgentIdGithubTokenRaw(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/github/token">): Promise<Response>;
    getApiV1MiladyAgentsByAgentIdLifeopsScheduleMergedStateRaw(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/lifeops/schedule/merged-state">): Promise<Response>;
    getApiV1MiladyAgentsByAgentIdWalletRaw(options: PublicRouteCallOptions<"GET /api/v1/milady/agents/{agentId}/wallet">): Promise<Response>;
    getApiV1MiladyGatewayRelaySessionsBySessionIdNextRaw(options: PublicRouteCallOptions<"GET /api/v1/milady/gateway-relay/sessions/{sessionId}/next">): Promise<Response>;
    getApiV1MiladyGithubOauthCompleteRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/github-oauth-complete">): Promise<Response>;
    getApiV1MiladyGoogleAccountsRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/accounts">): Promise<Response>;
    getApiV1MiladyGoogleCalendarFeedRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/calendar/feed">): Promise<Response>;
    getApiV1MiladyGoogleGmailReadRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/gmail/read">): Promise<Response>;
    getApiV1MiladyGoogleGmailSearchRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/gmail/search">): Promise<Response>;
    getApiV1MiladyGoogleGmailSubscriptionHeadersRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/gmail/subscription-headers">): Promise<Response>;
    getApiV1MiladyGoogleGmailTriageRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/gmail/triage">): Promise<Response>;
    getApiV1MiladyGoogleStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/google/status">): Promise<Response>;
    getApiV1MiladyLaunchSessionsBySessionIdRaw(options: PublicRouteCallOptions<"GET /api/v1/milady/launch-sessions/{sessionId}">): Promise<Response>;
    getApiV1MiladyLifeopsGithubCompleteRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/lifeops/github-complete">): Promise<Response>;
    getApiV1MiladyPaypalPopupCallbackRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/paypal/popup-callback">): Promise<Response>;
    getApiV1MiladyPaypalStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/paypal/status">): Promise<Response>;
    getApiV1MiladyPlaidStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/milady/plaid/status">): Promise<Response>;
    getApiV1ModelsRaw(options?: PublicRouteCallOptions<"GET /api/v1/models">): Promise<Response>;
    getApiV1ModelsByModelRaw(options: PublicRouteCallOptions<"GET /api/v1/models/{model}">): Promise<Response>;
    getApiV1OauthByPlatformCallbackRaw(options: PublicRouteCallOptions<"GET /api/v1/oauth/{platform}/callback">): Promise<Response>;
    getApiV1OauthCallbackRaw(options?: PublicRouteCallOptions<"GET /api/v1/oauth/callback">): Promise<Response>;
    getApiV1OauthConnectionsRaw(options?: PublicRouteCallOptions<"GET /api/v1/oauth/connections">): Promise<Response>;
    getApiV1OauthConnectionsByIdRaw(options: PublicRouteCallOptions<"GET /api/v1/oauth/connections/{id}">): Promise<Response>;
    getApiV1OauthConnectionsByIdTokenRaw(options: PublicRouteCallOptions<"GET /api/v1/oauth/connections/{id}/token">): Promise<Response>;
    getApiV1OauthInitiateRaw(options?: PublicRouteCallOptions<"GET /api/v1/oauth/initiate">): Promise<Response>;
    getApiV1OauthProvidersRaw(options?: PublicRouteCallOptions<"GET /api/v1/oauth/providers">): Promise<Response>;
    getApiV1OauthStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/oauth/status">): Promise<Response>;
    getApiV1OauthTokenByPlatformRaw(options: PublicRouteCallOptions<"GET /api/v1/oauth/token/{platform}">): Promise<Response>;
    getApiV1PricingSummaryRaw(options?: PublicRouteCallOptions<"GET /api/v1/pricing/summary">): Promise<Response>;
    getApiV1ProxyBirdeyeByPathRaw(options: PublicRouteCallOptions<"GET /api/v1/proxy/birdeye/{path}">): Promise<Response>;
    getApiV1RedemptionsRaw(options?: PublicRouteCallOptions<"GET /api/v1/redemptions">): Promise<Response>;
    getApiV1RedemptionsByIdRaw(options: PublicRouteCallOptions<"GET /api/v1/redemptions/{id}">): Promise<Response>;
    getApiV1RedemptionsBalanceRaw(options?: PublicRouteCallOptions<"GET /api/v1/redemptions/balance">): Promise<Response>;
    getApiV1RedemptionsQuoteRaw(options?: PublicRouteCallOptions<"GET /api/v1/redemptions/quote">): Promise<Response>;
    getApiV1RedemptionsStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/redemptions/status">): Promise<Response>;
    getApiV1ReferralsRaw(options?: PublicRouteCallOptions<"GET /api/v1/referrals">): Promise<Response>;
    getApiV1RemoteSessionsRaw(options?: PublicRouteCallOptions<"GET /api/v1/remote/sessions">): Promise<Response>;
    getApiV1SolanaAssetsByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/solana/assets/{address}">): Promise<Response>;
    getApiV1SolanaMethodsRaw(options?: PublicRouteCallOptions<"GET /api/v1/solana/methods">): Promise<Response>;
    getApiV1SolanaTokenAccountsByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/solana/token-accounts/{address}">): Promise<Response>;
    getApiV1SolanaTransactionsByAddressRaw(options: PublicRouteCallOptions<"GET /api/v1/solana/transactions/{address}">): Promise<Response>;
    getApiV1StewardTenantsCredentialsRaw(options?: PublicRouteCallOptions<"GET /api/v1/steward/tenants/credentials">): Promise<Response>;
    getApiV1TelegramChatsRaw(options?: PublicRouteCallOptions<"GET /api/v1/telegram/chats">): Promise<Response>;
    getApiV1TelegramScanChatsRaw(options?: PublicRouteCallOptions<"GET /api/v1/telegram/scan-chats">): Promise<Response>;
    getApiV1TelegramStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/telegram/status">): Promise<Response>;
    getApiV1TwilioStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/twilio/status">): Promise<Response>;
    getApiV1TwitterCallbackRaw(options?: PublicRouteCallOptions<"GET /api/v1/twitter/callback">): Promise<Response>;
    getApiV1TwitterStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/twitter/status">): Promise<Response>;
    getApiV1UserRaw(options?: PublicRouteCallOptions<"GET /api/v1/user">): Promise<Response>;
    getApiV1UserWalletsRaw(options?: PublicRouteCallOptions<"GET /api/v1/user/wallets">): Promise<Response>;
    getApiV1VoiceByIdRaw(options: PublicRouteCallOptions<"GET /api/v1/voice/{id}">): Promise<Response>;
    getApiV1VoiceJobsRaw(options?: PublicRouteCallOptions<"GET /api/v1/voice/jobs">): Promise<Response>;
    getApiV1VoiceListRaw(options?: PublicRouteCallOptions<"GET /api/v1/voice/list">): Promise<Response>;
    getApiV1WhatsappStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/whatsapp/status">): Promise<Response>;
    getApiV1XDmsDigestRaw(options?: PublicRouteCallOptions<"GET /api/v1/x/dms/digest">): Promise<Response>;
    getApiV1XFeedRaw(options?: PublicRouteCallOptions<"GET /api/v1/x/feed">): Promise<Response>;
    getApiV1XStatusRaw(options?: PublicRouteCallOptions<"GET /api/v1/x/status">): Promise<Response>;
    getApiV1X402Raw(options?: PublicRouteCallOptions<"GET /api/v1/x402">): Promise<Response>;
    patchApiElevenlabsVoicesByIdRaw(options: PublicRouteCallOptions<"PATCH /api/elevenlabs/voices/{id}">): Promise<Response>;
    patchApiV1AdminDockerNodesByNodeIdRaw(options: PublicRouteCallOptions<"PATCH /api/v1/admin/docker-nodes/{nodeId}">): Promise<Response>;
    patchApiV1AdminOrgsByOrgIdRateLimitsRaw(options: PublicRouteCallOptions<"PATCH /api/v1/admin/orgs/{orgId}/rate-limits">): Promise<Response>;
    patchApiV1AdvertisingCampaignsByIdRaw(options: PublicRouteCallOptions<"PATCH /api/v1/advertising/campaigns/{id}">): Promise<Response>;
    patchApiV1ApiKeysByIdRaw(options: PublicRouteCallOptions<"PATCH /api/v1/api-keys/{id}">): Promise<Response>;
    patchApiV1AppBuilderSessionsBySessionIdRaw(options: PublicRouteCallOptions<"PATCH /api/v1/app-builder/sessions/{sessionId}">): Promise<Response>;
    patchApiV1AppsByIdRaw(options: PublicRouteCallOptions<"PATCH /api/v1/apps/{id}">): Promise<Response>;
    patchApiV1ConnectionsByPlatformRaw(options: PublicRouteCallOptions<"PATCH /api/v1/connections/{platform}">): Promise<Response>;
    patchApiV1ContainersByIdRaw(options: PublicRouteCallOptions<"PATCH /api/v1/containers/{id}">): Promise<Response>;
    patchApiV1DiscordConnectionsByIdRaw(options: PublicRouteCallOptions<"PATCH /api/v1/discord/connections/{id}">): Promise<Response>;
    patchApiV1MiladyAgentsByAgentIdRaw(options: PublicRouteCallOptions<"PATCH /api/v1/milady/agents/{agentId}">): Promise<Response>;
    patchApiV1MiladyGoogleCalendarEventsByEventIdRaw(options: PublicRouteCallOptions<"PATCH /api/v1/milady/google/calendar/events/{eventId}">): Promise<Response>;
    patchApiV1UserRaw(options?: PublicRouteCallOptions<"PATCH /api/v1/user">): Promise<Response>;
    patchApiV1VoiceByIdRaw(options: PublicRouteCallOptions<"PATCH /api/v1/voice/{id}">): Promise<Response>;
    postApiElevenlabsSttRaw(options?: PublicRouteCallOptions<"POST /api/elevenlabs/stt">): Promise<Response>;
    postApiElevenlabsTtsRaw(options?: PublicRouteCallOptions<"POST /api/elevenlabs/tts">): Promise<Response>;
    postApiElevenlabsVoicesCloneRaw(options?: PublicRouteCallOptions<"POST /api/elevenlabs/voices/clone">): Promise<Response>;
    postApiV1AdminAiPricingRaw(options?: PublicRouteCallOptions<"POST /api/v1/admin/ai-pricing">): Promise<Response>;
    postApiV1AdminDockerContainersAuditRaw(options?: PublicRouteCallOptions<"POST /api/v1/admin/docker-containers/audit">): Promise<Response>;
    postApiV1AdminDockerNodesRaw(options?: PublicRouteCallOptions<"POST /api/v1/admin/docker-nodes">): Promise<Response>;
    postApiV1AdminDockerNodesByNodeIdHealthCheckRaw(options: PublicRouteCallOptions<"POST /api/v1/admin/docker-nodes/{nodeId}/health-check">): Promise<Response>;
    postApiV1AdminDockerNodesSyncRaw(options?: PublicRouteCallOptions<"POST /api/v1/admin/docker-nodes/sync">): Promise<Response>;
    postApiV1AdminInfrastructureContainersActionsRaw(options?: PublicRouteCallOptions<"POST /api/v1/admin/infrastructure/containers/actions">): Promise<Response>;
    postApiV1AdminModerationRaw(options?: PublicRouteCallOptions<"POST /api/v1/admin/moderation">): Promise<Response>;
    postApiV1AdvertisingAccountsRaw(options?: PublicRouteCallOptions<"POST /api/v1/advertising/accounts">): Promise<Response>;
    postApiV1AdvertisingCampaignsRaw(options?: PublicRouteCallOptions<"POST /api/v1/advertising/campaigns">): Promise<Response>;
    postApiV1AdvertisingCampaignsByIdCreativesRaw(options: PublicRouteCallOptions<"POST /api/v1/advertising/campaigns/{id}/creatives">): Promise<Response>;
    postApiV1AdvertisingCampaignsByIdPauseRaw(options: PublicRouteCallOptions<"POST /api/v1/advertising/campaigns/{id}/pause">): Promise<Response>;
    postApiV1AdvertisingCampaignsByIdStartRaw(options: PublicRouteCallOptions<"POST /api/v1/advertising/campaigns/{id}/start">): Promise<Response>;
    postApiV1AffiliatesRaw(options?: PublicRouteCallOptions<"POST /api/v1/affiliates">): Promise<Response>;
    postApiV1AffiliatesLinkRaw(options?: PublicRouteCallOptions<"POST /api/v1/affiliates/link">): Promise<Response>;
    postApiV1AgentsRaw(options?: PublicRouteCallOptions<"POST /api/v1/agents">): Promise<Response>;
    postApiV1AgentsByAgentIdN8nByPathRaw(options: PublicRouteCallOptions<"POST /api/v1/agents/{agentId}/n8n/{path}">): Promise<Response>;
    postApiV1AgentsByAgentIdPublishRaw(options: PublicRouteCallOptions<"POST /api/v1/agents/{agentId}/publish">): Promise<Response>;
    postApiV1AgentsByAgentIdRestartRaw(options: PublicRouteCallOptions<"POST /api/v1/agents/{agentId}/restart">): Promise<Response>;
    postApiV1AgentsByAgentIdResumeRaw(options: PublicRouteCallOptions<"POST /api/v1/agents/{agentId}/resume">): Promise<Response>;
    postApiV1AgentsByAgentIdSuspendRaw(options: PublicRouteCallOptions<"POST /api/v1/agents/{agentId}/suspend">): Promise<Response>;
    postApiV1ApiKeysRaw(options?: PublicRouteCallOptions<"POST /api/v1/api-keys">): Promise<Response>;
    postApiV1ApiKeysByIdRegenerateRaw(options: PublicRouteCallOptions<"POST /api/v1/api-keys/{id}/regenerate">): Promise<Response>;
    postApiV1AppAuthConnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/app-auth/connect">): Promise<Response>;
    postApiV1AppBuilderRaw(options?: PublicRouteCallOptions<"POST /api/v1/app-builder">): Promise<Response>;
    postApiV1AppBuilderImagesRaw(options?: PublicRouteCallOptions<"POST /api/v1/app-builder/images">): Promise<Response>;
    postApiV1AppBuilderSessionsBySessionIdCommitRaw(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/commit">): Promise<Response>;
    postApiV1AppBuilderSessionsBySessionIdFilesRaw(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/files">): Promise<Response>;
    postApiV1AppBuilderSessionsBySessionIdPromptsStreamRaw(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/prompts/stream">): Promise<Response>;
    postApiV1AppBuilderSessionsBySessionIdResumeStreamRaw(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/resume/stream">): Promise<Response>;
    postApiV1AppBuilderSessionsBySessionIdRollbackRaw(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/rollback">): Promise<Response>;
    postApiV1AppBuilderSessionsBySessionIdTerminalRaw(options: PublicRouteCallOptions<"POST /api/v1/app-builder/sessions/{sessionId}/terminal">): Promise<Response>;
    postApiV1AppBuilderStreamRaw(options?: PublicRouteCallOptions<"POST /api/v1/app-builder/stream">): Promise<Response>;
    postApiV1AppCreditsCheckoutRaw(options?: PublicRouteCallOptions<"POST /api/v1/app-credits/checkout">): Promise<Response>;
    postApiV1AppAgentsRaw(options?: PublicRouteCallOptions<"POST /api/v1/app/agents">): Promise<Response>;
    postApiV1AppsRaw(options?: PublicRouteCallOptions<"POST /api/v1/apps">): Promise<Response>;
    postApiV1AppsByIdChatRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/chat">): Promise<Response>;
    postApiV1AppsByIdDeployRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/deploy">): Promise<Response>;
    postApiV1AppsByIdDiscordAutomationRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/discord-automation">): Promise<Response>;
    postApiV1AppsByIdDiscordAutomationPostRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/discord-automation/post">): Promise<Response>;
    postApiV1AppsByIdDomainsRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/domains">): Promise<Response>;
    postApiV1AppsByIdDomainsStatusRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/domains/status">): Promise<Response>;
    postApiV1AppsByIdDomainsSyncRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/domains/sync">): Promise<Response>;
    postApiV1AppsByIdDomainsVerifyRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/domains/verify">): Promise<Response>;
    postApiV1AppsByIdEarningsWithdrawRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/earnings/withdraw">): Promise<Response>;
    postApiV1AppsByIdPromoteRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/promote">): Promise<Response>;
    postApiV1AppsByIdPromoteAssetsRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/promote/assets">): Promise<Response>;
    postApiV1AppsByIdPromotePreviewRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/promote/preview">): Promise<Response>;
    postApiV1AppsByIdRegenerateApiKeyRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/regenerate-api-key">): Promise<Response>;
    postApiV1AppsByIdTelegramAutomationRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/telegram-automation">): Promise<Response>;
    postApiV1AppsByIdTelegramAutomationPostRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/telegram-automation/post">): Promise<Response>;
    postApiV1AppsByIdTwitterAutomationRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/twitter-automation">): Promise<Response>;
    postApiV1AppsByIdTwitterAutomationPostRaw(options: PublicRouteCallOptions<"POST /api/v1/apps/{id}/twitter-automation/post">): Promise<Response>;
    postApiV1AppsCheckNameRaw(options?: PublicRouteCallOptions<"POST /api/v1/apps/check-name">): Promise<Response>;
    postApiV1BlooioConnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/blooio/connect">): Promise<Response>;
    postApiV1BlooioDisconnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/blooio/disconnect">): Promise<Response>;
    postApiV1BlooioWebhookSecretRaw(options?: PublicRouteCallOptions<"POST /api/v1/blooio/webhook-secret">): Promise<Response>;
    postApiV1BrowserSessionsRaw(options?: PublicRouteCallOptions<"POST /api/v1/browser/sessions">): Promise<Response>;
    postApiV1BrowserSessionsByIdCommandRaw(options: PublicRouteCallOptions<"POST /api/v1/browser/sessions/{id}/command">): Promise<Response>;
    postApiV1BrowserSessionsByIdNavigateRaw(options: PublicRouteCallOptions<"POST /api/v1/browser/sessions/{id}/navigate">): Promise<Response>;
    postApiV1CharacterAssistantRaw(options?: PublicRouteCallOptions<"POST /api/v1/character-assistant">): Promise<Response>;
    postApiV1ChatRaw(options?: PublicRouteCallOptions<"POST /api/v1/chat">): Promise<Response>;
    postApiV1ChatCompletionsRaw(options?: PublicRouteCallOptions<"POST /api/v1/chat/completions">): Promise<Response>;
    postApiV1ConnectionsByPlatformRaw(options: PublicRouteCallOptions<"POST /api/v1/connections/{platform}">): Promise<Response>;
    postApiV1ContainersRaw(options?: PublicRouteCallOptions<"POST /api/v1/containers">): Promise<Response>;
    postApiV1ContainersCredentialsRaw(options?: PublicRouteCallOptions<"POST /api/v1/containers/credentials">): Promise<Response>;
    postApiV1CreditsCheckoutRaw(options?: PublicRouteCallOptions<"POST /api/v1/credits/checkout">): Promise<Response>;
    postApiV1CronDeploymentMonitorRaw(options?: PublicRouteCallOptions<"POST /api/v1/cron/deployment-monitor">): Promise<Response>;
    postApiV1CronHealthCheckRaw(options?: PublicRouteCallOptions<"POST /api/v1/cron/health-check">): Promise<Response>;
    postApiV1CronProcessProvisioningJobsRaw(options?: PublicRouteCallOptions<"POST /api/v1/cron/process-provisioning-jobs">): Promise<Response>;
    postApiV1CronRefreshModelCatalogRaw(options?: PublicRouteCallOptions<"POST /api/v1/cron/refresh-model-catalog">): Promise<Response>;
    postApiV1CronRefreshPricingRaw(options?: PublicRouteCallOptions<"POST /api/v1/cron/refresh-pricing">): Promise<Response>;
    postApiV1DeviceBusDevicesRaw(options?: PublicRouteCallOptions<"POST /api/v1/device-bus/devices">): Promise<Response>;
    postApiV1DeviceBusIntentsRaw(options?: PublicRouteCallOptions<"POST /api/v1/device-bus/intents">): Promise<Response>;
    postApiV1DiscordChannelsRefreshRaw(options?: PublicRouteCallOptions<"POST /api/v1/discord/channels/refresh">): Promise<Response>;
    postApiV1DiscordConnectionsRaw(options?: PublicRouteCallOptions<"POST /api/v1/discord/connections">): Promise<Response>;
    postApiV1DiscordDisconnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/discord/disconnect">): Promise<Response>;
    postApiV1EmbeddingsRaw(options?: PublicRouteCallOptions<"POST /api/v1/embeddings">): Promise<Response>;
    postApiV1ExtractRaw(options?: PublicRouteCallOptions<"POST /api/v1/extract">): Promise<Response>;
    postApiV1GenerateImageRaw(options?: PublicRouteCallOptions<"POST /api/v1/generate-image">): Promise<Response>;
    postApiV1GeneratePromptsRaw(options?: PublicRouteCallOptions<"POST /api/v1/generate-prompts">): Promise<Response>;
    postApiV1GenerateVideoRaw(options?: PublicRouteCallOptions<"POST /api/v1/generate-video">): Promise<Response>;
    postApiV1KnowledgeRaw(options?: PublicRouteCallOptions<"POST /api/v1/knowledge">): Promise<Response>;
    postApiV1KnowledgePreUploadRaw(options?: PublicRouteCallOptions<"POST /api/v1/knowledge/pre-upload">): Promise<Response>;
    postApiV1KnowledgeQueryRaw(options?: PublicRouteCallOptions<"POST /api/v1/knowledge/query">): Promise<Response>;
    postApiV1KnowledgeSubmitRaw(options?: PublicRouteCallOptions<"POST /api/v1/knowledge/submit">): Promise<Response>;
    postApiV1KnowledgeUploadFileRaw(options?: PublicRouteCallOptions<"POST /api/v1/knowledge/upload-file">): Promise<Response>;
    postApiV1McpsRaw(options?: PublicRouteCallOptions<"POST /api/v1/mcps">): Promise<Response>;
    postApiV1McpsByMcpIdPublishRaw(options: PublicRouteCallOptions<"POST /api/v1/mcps/{mcpId}/publish">): Promise<Response>;
    postApiV1MessagesRaw(options?: PublicRouteCallOptions<"POST /api/v1/messages">): Promise<Response>;
    postApiV1MiladyAgentsRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/agents">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdApiWalletByPathRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/api/wallet/{path}">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdBridgeRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/bridge">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdDiscordOauthRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/discord/oauth">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdGithubLinkRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/github/link">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdGithubOauthRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/github/oauth">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdLifeopsScheduleObservationsRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/lifeops/schedule/observations">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdPairingTokenRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/pairing-token">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdProvisionRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/provision">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdRestoreRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/restore">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdResumeRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/resume">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdSnapshotRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/snapshot">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdStreamRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/stream">): Promise<Response>;
    postApiV1MiladyAgentsByAgentIdSuspendRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/agents/{agentId}/suspend">): Promise<Response>;
    postApiV1MiladyDiscordGatewayAgentRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/discord/gateway-agent">): Promise<Response>;
    postApiV1MiladyGatewayRelaySessionsRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/gateway-relay/sessions">): Promise<Response>;
    postApiV1MiladyGatewayRelaySessionsBySessionIdResponsesRaw(options: PublicRouteCallOptions<"POST /api/v1/milady/gateway-relay/sessions/{sessionId}/responses">): Promise<Response>;
    postApiV1MiladyGoogleCalendarEventsRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/google/calendar/events">): Promise<Response>;
    postApiV1MiladyGoogleConnectInitiateRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/google/connect/initiate">): Promise<Response>;
    postApiV1MiladyGoogleDisconnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/google/disconnect">): Promise<Response>;
    postApiV1MiladyGoogleGmailMessageSendRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/google/gmail/message-send">): Promise<Response>;
    postApiV1MiladyGoogleGmailReplySendRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/google/gmail/reply-send">): Promise<Response>;
    postApiV1MiladyPaypalAuthorizeRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/paypal/authorize">): Promise<Response>;
    postApiV1MiladyPaypalCallbackRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/paypal/callback">): Promise<Response>;
    postApiV1MiladyPaypalRefreshRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/paypal/refresh">): Promise<Response>;
    postApiV1MiladyPaypalTransactionsRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/paypal/transactions">): Promise<Response>;
    postApiV1MiladyPlaidExchangeRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/plaid/exchange">): Promise<Response>;
    postApiV1MiladyPlaidLinkTokenRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/plaid/link-token">): Promise<Response>;
    postApiV1MiladyPlaidSyncRaw(options?: PublicRouteCallOptions<"POST /api/v1/milady/plaid/sync">): Promise<Response>;
    postApiV1ModelsStatusRaw(options?: PublicRouteCallOptions<"POST /api/v1/models/status">): Promise<Response>;
    postApiV1OauthByPlatformInitiateRaw(options: PublicRouteCallOptions<"POST /api/v1/oauth/{platform}/initiate">): Promise<Response>;
    postApiV1OauthConnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/oauth/connect">): Promise<Response>;
    postApiV1OauthInitiateRaw(options?: PublicRouteCallOptions<"POST /api/v1/oauth/initiate">): Promise<Response>;
    postApiV1ProxyEvmRpcByChainRaw(options: PublicRouteCallOptions<"POST /api/v1/proxy/evm-rpc/{chain}">): Promise<Response>;
    postApiV1ProxySolanaRpcRaw(options?: PublicRouteCallOptions<"POST /api/v1/proxy/solana-rpc">): Promise<Response>;
    postApiV1RedemptionsRaw(options?: PublicRouteCallOptions<"POST /api/v1/redemptions">): Promise<Response>;
    postApiV1ReferralsApplyRaw(options?: PublicRouteCallOptions<"POST /api/v1/referrals/apply">): Promise<Response>;
    postApiV1RemotePairRaw(options?: PublicRouteCallOptions<"POST /api/v1/remote/pair">): Promise<Response>;
    postApiV1RemoteSessionsByIdRevokeRaw(options: PublicRouteCallOptions<"POST /api/v1/remote/sessions/{id}/revoke">): Promise<Response>;
    postApiV1ReportsBugRaw(options?: PublicRouteCallOptions<"POST /api/v1/reports/bug">): Promise<Response>;
    postApiV1ResponsesRaw(options?: PublicRouteCallOptions<"POST /api/v1/responses">): Promise<Response>;
    postApiV1RpcByChainRaw(options: PublicRouteCallOptions<"POST /api/v1/rpc/{chain}">): Promise<Response>;
    postApiV1SearchRaw(options?: PublicRouteCallOptions<"POST /api/v1/search">): Promise<Response>;
    postApiV1SolanaRpcRaw(options?: PublicRouteCallOptions<"POST /api/v1/solana/rpc">): Promise<Response>;
    postApiV1StewardTenantsRaw(options?: PublicRouteCallOptions<"POST /api/v1/steward/tenants">): Promise<Response>;
    postApiV1TelegramConnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/telegram/connect">): Promise<Response>;
    postApiV1TelegramScanChatsRaw(options?: PublicRouteCallOptions<"POST /api/v1/telegram/scan-chats">): Promise<Response>;
    postApiV1TelegramWebhookByOrgIdRaw(options: PublicRouteCallOptions<"POST /api/v1/telegram/webhook/{orgId}">): Promise<Response>;
    postApiV1Topup10Raw(options?: PublicRouteCallOptions<"POST /api/v1/topup/10">): Promise<Response>;
    postApiV1Topup100Raw(options?: PublicRouteCallOptions<"POST /api/v1/topup/100">): Promise<Response>;
    postApiV1Topup50Raw(options?: PublicRouteCallOptions<"POST /api/v1/topup/50">): Promise<Response>;
    postApiV1TrackPageviewRaw(options?: PublicRouteCallOptions<"POST /api/v1/track/pageview">): Promise<Response>;
    postApiV1TwilioConnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/twilio/connect">): Promise<Response>;
    postApiV1TwilioDisconnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/twilio/disconnect">): Promise<Response>;
    postApiV1TwilioVoiceInboundRaw(options?: PublicRouteCallOptions<"POST /api/v1/twilio/voice/inbound">): Promise<Response>;
    postApiV1TwitterConnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/twitter/connect">): Promise<Response>;
    postApiV1UserWalletsProvisionRaw(options?: PublicRouteCallOptions<"POST /api/v1/user/wallets/provision">): Promise<Response>;
    postApiV1UserWalletsRpcRaw(options?: PublicRouteCallOptions<"POST /api/v1/user/wallets/rpc">): Promise<Response>;
    postApiV1VoiceCloneRaw(options?: PublicRouteCallOptions<"POST /api/v1/voice/clone">): Promise<Response>;
    postApiV1VoiceSttRaw(options?: PublicRouteCallOptions<"POST /api/v1/voice/stt">): Promise<Response>;
    postApiV1VoiceTtsRaw(options?: PublicRouteCallOptions<"POST /api/v1/voice/tts">): Promise<Response>;
    postApiV1WhatsappConnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/whatsapp/connect">): Promise<Response>;
    postApiV1WhatsappDisconnectRaw(options?: PublicRouteCallOptions<"POST /api/v1/whatsapp/disconnect">): Promise<Response>;
    postApiV1XDmsConversationsSendRaw(options?: PublicRouteCallOptions<"POST /api/v1/x/dms/conversations/send">): Promise<Response>;
    postApiV1XDmsCurateRaw(options?: PublicRouteCallOptions<"POST /api/v1/x/dms/curate">): Promise<Response>;
    postApiV1XDmsGroupsRaw(options?: PublicRouteCallOptions<"POST /api/v1/x/dms/groups">): Promise<Response>;
    postApiV1XDmsSendRaw(options?: PublicRouteCallOptions<"POST /api/v1/x/dms/send">): Promise<Response>;
    postApiV1XPostsRaw(options?: PublicRouteCallOptions<"POST /api/v1/x/posts">): Promise<Response>;
    postApiV1X402SettleRaw(options?: PublicRouteCallOptions<"POST /api/v1/x402/settle">): Promise<Response>;
    postApiV1X402VerifyRaw(options?: PublicRouteCallOptions<"POST /api/v1/x402/verify">): Promise<Response>;
    putApiV1AdminAiPricingRaw(options?: PublicRouteCallOptions<"PUT /api/v1/admin/ai-pricing">): Promise<Response>;
    putApiV1AdminServicePricingRaw(options?: PublicRouteCallOptions<"PUT /api/v1/admin/service-pricing">): Promise<Response>;
    putApiV1AffiliatesRaw(options?: PublicRouteCallOptions<"PUT /api/v1/affiliates">): Promise<Response>;
    putApiV1AgentsByAgentIdMonetizationRaw(options: PublicRouteCallOptions<"PUT /api/v1/agents/{agentId}/monetization">): Promise<Response>;
    putApiV1AgentsByAgentIdN8nByPathRaw(options: PublicRouteCallOptions<"PUT /api/v1/agents/{agentId}/n8n/{path}">): Promise<Response>;
    putApiV1AppsByIdRaw(options: PublicRouteCallOptions<"PUT /api/v1/apps/{id}">): Promise<Response>;
    putApiV1AppsByIdCharactersRaw(options: PublicRouteCallOptions<"PUT /api/v1/apps/{id}/characters">): Promise<Response>;
    putApiV1AppsByIdMonetizationRaw(options: PublicRouteCallOptions<"PUT /api/v1/apps/{id}/monetization">): Promise<Response>;
    putApiV1BillingSettingsRaw(options?: PublicRouteCallOptions<"PUT /api/v1/billing/settings">): Promise<Response>;
    putApiV1McpsByMcpIdRaw(options: PublicRouteCallOptions<"PUT /api/v1/mcps/{mcpId}">): Promise<Response>;
}
//# sourceMappingURL=public-routes.d.ts.map