/**
 * INTEGRATION_CONTEXT Provider
 *
 * Provides identity context from connected OAuth integrations to the agent.
 * Enables personalized responses based on user's profile, teams, and workspace.
 *
 * Data provided per platform:
 * - Google: name, email, organization, job title
 * - Linear: teams, projects
 * - GitHub: username, orgs, top repos
 * - Slack: workspace name, real name, admin status
 * - Notion: workspace name, top pages
 * - Microsoft: name, email, job title, department, company, office location
 */

console.log("[INTEGRATION_CONTEXT] Module loaded");

import {
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
  logger,
} from "@elizaos/core";
import { usersRepository } from "@/db/repositories/users";
import { oauthService } from "@/lib/services/oauth";
import {
  getAllEnrichmentData,
  enrichConnection,
  hasEnricher,
} from "@/lib/services/oauth/enrichment";

/**
 * Format enrichment data for a platform into human-readable text.
 * Omits null/empty fields to keep output clean.
 */
function formatPlatformContext(platform: string, data: Record<string, unknown>): string {
  // Skip failed enrichments
  if ("_enrichmentFailed" in data) {
    return "";
  }

  const lines: string[] = [];
  const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
  lines.push(`## ${platformName}`);

  switch (platform) {
    case "google": {
      if (data.name) lines.push(`- Name: ${data.name}`);
      if (data.email) lines.push(`- Email: ${data.email}`);
      if (data.organization) lines.push(`- Organization: ${data.organization}`);
      if (data.jobTitle) lines.push(`- Job Title: ${data.jobTitle}`);
      break;
    }

    case "linear": {
      if (data.name) lines.push(`- Name: ${data.name}`);
      if (data.email) lines.push(`- Email: ${data.email}`);
      const teams = data.teams as string[] | undefined;
      if (teams?.length) lines.push(`- Teams: ${teams.join(", ")}`);
      const projects = data.projects as string[] | undefined;
      if (projects?.length) lines.push(`- Projects: ${projects.join(", ")}`);
      break;
    }

    case "github": {
      if (data.username) lines.push(`- Username: ${data.username}`);
      if (data.name) lines.push(`- Name: ${data.name}`);
      if (data.company) lines.push(`- Company: ${data.company}`);
      if (data.bio) lines.push(`- Bio: ${data.bio}`);
      const orgs = data.organizations as string[] | undefined;
      if (orgs?.length) lines.push(`- Organizations: ${orgs.join(", ")}`);
      const repos = data.topRepositories as Array<{ name: string }> | undefined;
      if (repos?.length) {
        lines.push(`- Recent Repositories: ${repos.map((r) => r.name).join(", ")}`);
      }
      break;
    }

    case "slack": {
      if (data.realName) lines.push(`- Name: ${data.realName}`);
      if (data.workspaceName) lines.push(`- Workspace: ${data.workspaceName}`);
      if (data.email) lines.push(`- Email: ${data.email}`);
      if (data.isAdmin) lines.push(`- Role: Admin`);
      else if (data.isOwner) lines.push(`- Role: Owner`);
      break;
    }

    case "notion": {
      if (data.ownerName) lines.push(`- Owner: ${data.ownerName}`);
      if (data.workspaceName) lines.push(`- Workspace: ${data.workspaceName}`);
      const pages = data.topPages as string[] | undefined;
      if (pages?.length) lines.push(`- Recent Pages: ${pages.slice(0, 5).join(", ")}`);
      break;
    }

    case "microsoft": {
      if (data.name) lines.push(`- Name: ${data.name}`);
      if (data.email) lines.push(`- Email: ${data.email}`);
      if (data.jobTitle) lines.push(`- Job Title: ${data.jobTitle}`);
      if (data.department) lines.push(`- Department: ${data.department}`);
      if (data.company) lines.push(`- Company: ${data.company}`);
      if (data.officeLocation) lines.push(`- Office: ${data.officeLocation}`);
      break;
    }

    default: {
      // Generic handling for unknown platforms
      for (const [key, value] of Object.entries(data)) {
        if (value && !key.startsWith("_")) {
          const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");
          if (Array.isArray(value)) {
            if (value.length) lines.push(`- ${label}: ${value.join(", ")}`);
          } else {
            lines.push(`- ${label}: ${value}`);
          }
        }
      }
    }
  }

  // Only return if we have content beyond the header
  return lines.length > 1 ? lines.join("\n") : "";
}

export const integrationContextProvider: Provider = {
  name: "INTEGRATION_CONTEXT",
  description: "Provides identity context from connected OAuth integrations",

  get: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    logger.info(`[INTEGRATION_CONTEXT] Provider called, entityId: ${message.entityId}`);
    
    if (!message.entityId) {
      logger.info(`[INTEGRATION_CONTEXT] No entityId, returning empty`);
      return { text: "", values: {}, data: {} };
    }

    // Look up user and organization
    const user = await usersRepository.findWithOrganization(message.entityId as string);

    if (!user?.organization_id) {
      logger.info(`[INTEGRATION_CONTEXT] No org for entityId: ${message.entityId}`);
      return { text: "", values: {}, data: {} };
    }

    const organizationId = user.organization_id;
    logger.info(`[INTEGRATION_CONTEXT] Found org: ${organizationId}`);

    // Get active connections
    const connections = await oauthService.listConnections({ organizationId });
    const activeConnections = connections.filter((c) => c.status === "active");
    logger.info(`[INTEGRATION_CONTEXT] Active connections: ${activeConnections.length} (platforms: ${activeConnections.map(c => c.platform).join(", ")})`);

    if (activeConnections.length === 0) {
      return { text: "", values: { hasEnrichedContext: false }, data: {} };
    }

    // Get all enrichment data for this organization
    const enrichmentMap = await getAllEnrichmentData(organizationId);

    // Check for missing enrichments and trigger fire-and-forget enrichment
    for (const conn of activeConnections) {
      if (!enrichmentMap.has(conn.id) && hasEnricher(conn.platform)) {
        // Fire-and-forget: don't await, just trigger in background
        // enrichConnection handles cooldown logic internally
        logger.info(`[INTEGRATION_CONTEXT] Triggering background enrichment for ${conn.platform}`);
        enrichConnection(organizationId, conn.platform, conn.id).catch((err) => {
          logger.warn(`[INTEGRATION_CONTEXT] Background enrichment failed: platform=${conn.platform} error=${String(err)}`);
        });
      }
    }

    // Format available enrichment data
    const platformContexts: string[] = [];
    const enrichedPlatforms: string[] = [];
    const integrationContext: Record<string, Record<string, unknown>> = {};

    // Extract common identity fields for values
    let userName: string | null = null;
    let userEmail: string | null = null;
    let userOrganization: string | null = null;

    for (const conn of activeConnections) {
      const enrichment = enrichmentMap.get(conn.id);
      if (!enrichment || "_enrichmentFailed" in enrichment.data) {
        continue;
      }

      const { platform, data } = enrichment;
      enrichedPlatforms.push(platform);
      integrationContext[platform] = data;

      // Extract identity fields (prefer Google for name/email)
      if (!userName && data.name) userName = data.name as string;
      if (!userName && data.realName) userName = data.realName as string;
      if (!userEmail && data.email) userEmail = data.email as string;
      if (!userOrganization && data.organization) {
        userOrganization = data.organization as string;
      }
      if (!userOrganization && data.company) {
        userOrganization = data.company as string;
      }

      const formattedContext = formatPlatformContext(platform, data);
      if (formattedContext) {
        platformContexts.push(formattedContext);
      }
    }

    // Build text output
    const text =
      platformContexts.length > 0
        ? `# Connected Integrations Context\n${platformContexts.join("\n\n")}`
        : "";

    logger.info(`[INTEGRATION_CONTEXT] Providing context: orgId=${organizationId} platforms=${enrichedPlatforms.join(",")} hasContext=${platformContexts.length > 0}`);

    return {
      text,
      values: {
        hasEnrichedContext: enrichedPlatforms.length > 0,
        enrichedPlatforms,
        userName,
        userEmail,
        userOrganization,
        integrationContext: platformContexts.length > 0 ? platformContexts.join("\n\n") : "",
      },
      data: {
        integrationContext,
      },
    };
  },
};
