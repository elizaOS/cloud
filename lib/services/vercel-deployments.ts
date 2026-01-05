/**
 * Vercel Deployments Service
 *
 * Handles deploying apps to Vercel from GitHub repositories.
 * Each app gets:
 * - A unique subdomain under apps.elizacloud.ai
 * - Automatic deployments when code is pushed to GitHub
 * - Production deployments triggered via Vercel API
 *
 * Flow:
 * 1. App created → GitHub repo created → Subdomain assigned
 * 2. Code changes in sandbox → Git commit/push → Vercel auto-deploys
 * 3. Manual deploy button → Trigger Vercel deployment
 */

import { dbRead, dbWrite } from "@/db/client";
import { apps } from "@/db/schemas/apps";
import { appDomains, type NewAppDomain } from "@/db/schemas/app-domains";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import { vercelApiRequest } from "@/lib/utils/vercel-api";
import { validateSubdomain, isReservedSubdomain } from "./vercel-domains";

// Vercel API configuration
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;
const VERCEL_APP_PROJECT_ID = process.env.VERCEL_APP_PROJECT_ID;
const APP_DOMAIN = process.env.APP_DOMAIN || "apps.elizacloud.ai";

// GitHub configuration
const GITHUB_ORG = process.env.GITHUB_ORG_NAME || "eliza-cloud-apps";

interface VercelDeploymentResponse {
  id: string;
  url: string;
  name: string;
  state: "QUEUED" | "BUILDING" | "ERROR" | "READY" | "CANCELED";
  readyState: "QUEUED" | "BUILDING" | "ERROR" | "READY" | "CANCELED";
  createdAt: number;
  buildingAt?: number;
  ready?: number;
  target?: "production" | "preview";
  alias?: string[];
  meta?: Record<string, string>;
}

interface VercelProjectResponse {
  id: string;
  name: string;
  link?: {
    type: "github";
    repo: string;
    repoId: number;
    org: string;
    gitCredentialId: string;
  };
}

interface DeploymentResult {
  success: boolean;
  deploymentId?: string;
  deploymentUrl?: string;
  productionUrl?: string;
  error?: string;
}

interface SubdomainResult {
  success: boolean;
  subdomain?: string;
  fullDomain?: string;
  error?: string;
}

/**
 * Make authenticated request to Vercel API
 */
async function vercelFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!VERCEL_TOKEN) {
    throw new Error("VERCEL_TOKEN is not configured");
  }

  return vercelApiRequest<T>(path, VERCEL_TOKEN, options, VERCEL_TEAM_ID);
}

/**
 * Generate a unique subdomain for an app
 */
function generateSubdomain(appSlug: string, appId: string): string {
  // Use slug if valid, otherwise use shortened app ID
  const base = appSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  if (base.length >= 3 && !isReservedSubdomain(base)) {
    return base;
  }

  // Fallback to app-{short-id}
  return `app-${appId.slice(0, 8)}`;
}

/**
 * Check if a subdomain is available
 */
async function isSubdomainAvailable(subdomain: string): Promise<boolean> {
  const existing = await dbRead.query.appDomains.findFirst({
    where: eq(appDomains.subdomain, subdomain),
  });
  return !existing;
}

/**
 * Assign a unique subdomain to an app
 */
export async function assignSubdomain(
  appId: string,
  preferredSubdomain?: string,
): Promise<SubdomainResult> {
  const app = await dbRead.query.apps.findFirst({
    where: eq(apps.id, appId),
  });

  if (!app) {
    return { success: false, error: "App not found" };
  }

  // Check if app already has a subdomain
  const existingDomain = await dbRead.query.appDomains.findFirst({
    where: eq(appDomains.app_id, appId),
  });

  if (existingDomain) {
    return {
      success: true,
      subdomain: existingDomain.subdomain,
      fullDomain: `${existingDomain.subdomain}.${APP_DOMAIN}`,
    };
  }

  // Generate subdomain
  let subdomain = preferredSubdomain || generateSubdomain(app.slug, app.id);

  // Validate subdomain
  const validation = validateSubdomain(subdomain);
  if (!validation.valid) {
    subdomain = generateSubdomain(app.slug, app.id);
  }

  // Check availability, add suffix if needed
  let attempts = 0;
  let candidateSubdomain = subdomain;

  while (!(await isSubdomainAvailable(candidateSubdomain)) && attempts < 10) {
    attempts++;
    candidateSubdomain = `${subdomain}-${Math.random().toString(36).slice(2, 6)}`;
  }

  if (attempts >= 10) {
    return { success: false, error: "Could not find available subdomain" };
  }

  subdomain = candidateSubdomain;
  const fullDomain = `${subdomain}.${APP_DOMAIN}`;

  // Create domain record
  const [domainRecord] = await dbWrite
    .insert(appDomains)
    .values({
      app_id: appId,
      subdomain,
      is_primary: true,
      ssl_status: "pending",
    } satisfies NewAppDomain)
    .returning();

  // Add domain to Vercel project
  if (VERCEL_APP_PROJECT_ID && VERCEL_TOKEN) {
    try {
      await vercelFetch(`/v10/projects/${VERCEL_APP_PROJECT_ID}/domains`, {
        method: "POST",
        body: JSON.stringify({ name: fullDomain }),
      });

      // Update domain record with Vercel info
      await dbWrite
        .update(appDomains)
        .set({
          vercel_project_id: VERCEL_APP_PROJECT_ID,
          ssl_status: "provisioning",
          updated_at: new Date(),
        })
        .where(eq(appDomains.id, domainRecord.id));

      logger.info("[Vercel Deployments] Subdomain added to Vercel", {
        appId,
        subdomain,
        fullDomain,
      });
    } catch (error) {
      logger.warn("[Vercel Deployments] Failed to add domain to Vercel", {
        appId,
        subdomain,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Domain record is still created, can be added to Vercel later
    }
  }

  logger.info("[Vercel Deployments] Subdomain assigned", {
    appId,
    subdomain,
    fullDomain,
  });

  return {
    success: true,
    subdomain,
    fullDomain,
  };
}

/**
 * Create a new Vercel deployment from a GitHub repo
 */
export async function createDeployment(
  appId: string,
  options?: {
    branch?: string;
    target?: "production" | "preview";
    commitSha?: string;
  },
): Promise<DeploymentResult> {
  if (!VERCEL_TOKEN || !VERCEL_APP_PROJECT_ID) {
    return {
      success: false,
      error: "Vercel deployment is not configured. Set VERCEL_TOKEN and VERCEL_APP_PROJECT_ID.",
    };
  }

  const { branch = "main", target = "production", commitSha } = options || {};

  const app = await dbRead.query.apps.findFirst({
    where: eq(apps.id, appId),
  });

  if (!app) {
    return { success: false, error: "App not found" };
  }

  if (!app.github_repo) {
    return {
      success: false,
      error: "App does not have a GitHub repository. Create one first.",
    };
  }

  // Get subdomain for this app
  const domain = await dbRead.query.appDomains.findFirst({
    where: eq(appDomains.app_id, appId),
  });

  const productionUrl = domain ? `https://${domain.subdomain}.${APP_DOMAIN}` : undefined;

  logger.info("[Vercel Deployments] Creating deployment", {
    appId,
    githubRepo: app.github_repo,
    branch,
    target,
    commitSha,
  });

  try {
    // Create deployment via Vercel API
    // This requires the GitHub repo to be connected to the Vercel project
    // For now, we trigger via git integration (push-based deploys)
    
    // The Vercel API for creating deployments from Git requires:
    // POST /v13/deployments
    // {
    //   "name": "project-name",
    //   "gitSource": {
    //     "type": "github",
    //     "org": "eliza-cloud-apps",
    //     "repo": "app-my-app",
    //     "ref": "main"
    //   }
    // }

    const [org, repo] = app.github_repo.includes("/")
      ? app.github_repo.split("/")
      : [GITHUB_ORG, app.github_repo];

    const deploymentResponse = await vercelFetch<VercelDeploymentResponse>(
      "/v13/deployments",
      {
        method: "POST",
        body: JSON.stringify({
          name: repo,
          gitSource: {
            type: "github",
            org,
            repo,
            ref: commitSha || branch,
          },
          target,
          projectSettings: {
            framework: "nextjs",
          },
          // Environment variables for the app
          env: {
            NEXT_PUBLIC_ELIZA_APP_ID: appId,
            NEXT_PUBLIC_ELIZA_API_URL: process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai",
          },
        }),
      },
    );

    logger.info("[Vercel Deployments] Deployment created", {
      appId,
      deploymentId: deploymentResponse.id,
      url: deploymentResponse.url,
      state: deploymentResponse.state,
    });

    return {
      success: true,
      deploymentId: deploymentResponse.id,
      deploymentUrl: `https://${deploymentResponse.url}`,
      productionUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("[Vercel Deployments] Failed to create deployment", {
      appId,
      error: errorMessage,
    });

    return {
      success: false,
      error: `Deployment failed: ${errorMessage}`,
    };
  }
}

/**
 * Get deployment status
 */
export async function getDeploymentStatus(
  deploymentId: string,
): Promise<{
  id: string;
  state: string;
  url?: string;
  ready?: boolean;
  error?: string;
}> {
  if (!VERCEL_TOKEN) {
    throw new Error("VERCEL_TOKEN is not configured");
  }

  try {
    const deployment = await vercelFetch<VercelDeploymentResponse>(
      `/v13/deployments/${deploymentId}`,
    );

    return {
      id: deployment.id,
      state: deployment.state,
      url: deployment.url ? `https://${deployment.url}` : undefined,
      ready: deployment.state === "READY",
    };
  } catch (error) {
    return {
      id: deploymentId,
      state: "ERROR",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * List recent deployments for an app
 */
export async function listDeployments(
  appId: string,
  limit: number = 10,
): Promise<Array<{
  id: string;
  state: string;
  url?: string;
  createdAt: Date;
  target?: string;
}>> {
  if (!VERCEL_TOKEN) {
    return [];
  }

  const app = await dbRead.query.apps.findFirst({
    where: eq(apps.id, appId),
  });

  if (!app?.github_repo) {
    return [];
  }

  try {
    const [, repo] = app.github_repo.includes("/")
      ? app.github_repo.split("/")
      : [GITHUB_ORG, app.github_repo];

    const response = await vercelFetch<{ deployments: VercelDeploymentResponse[] }>(
      `/v6/deployments?projectId=${VERCEL_APP_PROJECT_ID}&limit=${limit}&meta-gitRepo=${repo}`,
    );

    return response.deployments.map((d) => ({
      id: d.id,
      state: d.state,
      url: d.url ? `https://${d.url}` : undefined,
      createdAt: new Date(d.createdAt),
      target: d.target,
    }));
  } catch (error) {
    logger.warn("[Vercel Deployments] Failed to list deployments", {
      appId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

/**
 * Trigger a redeploy of the latest deployment
 */
export async function redeploy(appId: string): Promise<DeploymentResult> {
  return createDeployment(appId, { target: "production" });
}

/**
 * Check if Vercel deployment is configured
 */
export function isDeploymentConfigured(): boolean {
  return !!(VERCEL_TOKEN && VERCEL_APP_PROJECT_ID);
}

/**
 * Get the production URL for an app
 */
export async function getProductionUrl(appId: string): Promise<string | null> {
  const domain = await dbRead.query.appDomains.findFirst({
    where: eq(appDomains.app_id, appId),
  });

  if (!domain) {
    return null;
  }

  if (domain.custom_domain && domain.custom_domain_verified) {
    return `https://${domain.custom_domain}`;
  }

  return `https://${domain.subdomain}.${APP_DOMAIN}`;
}

export const vercelDeploymentsService = {
  assignSubdomain,
  createDeployment,
  getDeploymentStatus,
  listDeployments,
  redeploy,
  isDeploymentConfigured,
  getProductionUrl,
};
