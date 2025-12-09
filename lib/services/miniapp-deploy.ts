/**
 * Miniapp Deploy Service
 * 
 * Handles deploying fragments/apps as serverless miniapps:
 * 1. Builds fragment into static bundle
 * 2. Uploads to Vercel Blob storage
 * 3. Sets up subdomain routing
 * 4. Optionally configures custom domain via Vercel API
 */

import { put } from "@vercel/blob";
import { db } from "@/db";
import { miniappBundles, type MiniappRuntimeConfig } from "@/db/schemas/miniapp-bundles";
import { miniappDomains, type DomainVerificationRecord } from "@/db/schemas/miniapp-domains";
import { apps } from "@/db/schemas/apps";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import { nanoid } from "nanoid";
import type { FragmentSchema } from "@/lib/fragments/schema";

const MINIAPP_DOMAIN = process.env.MINIAPP_DOMAIN || "apps.elizacloud.ai";
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_MINIAPP_PROJECT_ID;

interface DeployMiniappOptions {
  projectId?: string;
  fragment: FragmentSchema;
  name: string;
  description?: string;
  subdomain?: string;
  customDomain?: string;
  organizationId: string;
  userId: string;
  runtimeConfig?: MiniappRuntimeConfig;
}

interface DeployResult {
  appId: string;
  bundleId: string;
  url: string;
  subdomain: string;
  customDomain?: string;
  verificationRecords?: DomainVerificationRecord[];
}

/**
 * Generate a URL-safe subdomain from a name
 */
function generateSubdomain(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  
  return `${base}-${nanoid(6)}`;
}

/**
 * Build a fragment into a static HTML bundle
 */
async function buildFragmentBundle(fragment: FragmentSchema): Promise<{
  html: string;
  hash: string;
}> {
  const hash = nanoid(12);
  
  // For React/Next.js templates, create a client-side rendered page
  if (fragment.template.includes("react") || fragment.template.includes("nextjs")) {
    const html = buildReactBundle(fragment, hash);
    return { html, hash };
  }
  
  // For Vue templates
  if (fragment.template.includes("vue")) {
    const html = buildVueBundle(fragment, hash);
    return { html, hash };
  }
  
  // For vanilla JS or unknown
  const html = buildVanillaBundle(fragment, hash);
  return { html, hash };
}

function buildReactBundle(fragment: FragmentSchema, hash: string): string {
  const escapedCode = fragment.code
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fragment.commentary || "Miniapp"}</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    #root { min-height: 100vh; }
  </style>
  <!-- Eliza Cloud Runtime Placeholder -->
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    const { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } = React;
    
    // Import Eliza Cloud SDK if injected
    const elizaCloud = window.__ELIZA_CLOUD__;
    
    ${escapedCode}
    
    // Find and render the component
    const AppComponent = typeof App !== 'undefined' ? App : 
                        typeof Counter !== 'undefined' ? Counter :
                        typeof default !== 'undefined' ? default :
                        (() => React.createElement('div', null, 'Component rendered'));
    
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(AppComponent));
  </script>
  <script>window.__MINIAPP_HASH__ = "${hash}";</script>
</body>
</html>`;
}

function buildVueBundle(fragment: FragmentSchema, hash: string): string {
  const escapedCode = fragment.code
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fragment.commentary || "Vue Miniapp"}</title>
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    #app { min-height: 100vh; }
  </style>
  <!-- Eliza Cloud Runtime Placeholder -->
</head>
<body>
  <div id="app"></div>
  <script>
    const { createApp, ref, reactive, computed, watch, onMounted } = Vue;
    const elizaCloud = window.__ELIZA_CLOUD__;
    
    ${escapedCode}
    
    const app = createApp(typeof App !== 'undefined' ? App : { template: '<div>Vue App</div>' });
    app.mount('#app');
  </script>
  <script>window.__MINIAPP_HASH__ = "${hash}";</script>
</body>
</html>`;
}

function buildVanillaBundle(fragment: FragmentSchema, hash: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fragment.commentary || "Miniapp"}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; min-height: 100vh; }
  </style>
  <!-- Eliza Cloud Runtime Placeholder -->
</head>
<body>
  <script>
    const elizaCloud = window.__ELIZA_CLOUD__;
    ${fragment.code}
  </script>
  <script>window.__MINIAPP_HASH__ = "${hash}";</script>
</body>
</html>`;
}

/**
 * Deploy a fragment as a serverless miniapp
 */
export async function deployMiniapp(options: DeployMiniappOptions): Promise<DeployResult> {
  const {
    projectId,
    fragment,
    name,
    description,
    subdomain: requestedSubdomain,
    customDomain,
    organizationId,
    userId,
    runtimeConfig = { injectAuth: true, injectStorage: true, apiProxy: true },
  } = options;

  logger.info("[Miniapp Deploy] Starting deployment", { name, projectId });

  // 1. Generate subdomain if not provided
  const subdomain = requestedSubdomain || generateSubdomain(name);
  
  // Check subdomain availability
  const existingDomain = await db.query.miniappDomains.findFirst({
    where: eq(miniappDomains.subdomain, subdomain),
  });
  
  if (existingDomain) {
    throw new Error(`Subdomain "${subdomain}" is already taken`);
  }

  // 2. Build fragment into bundle
  const bundle = await buildFragmentBundle(fragment);
  
  // 3. Upload to Vercel Blob
  const blobPath = `miniapps/${organizationId}/${subdomain}/${bundle.hash}/index.html`;
  const blob = await put(blobPath, bundle.html, {
    access: "public",
    contentType: "text/html",
    addRandomSuffix: false,
  });
  
  logger.info("[Miniapp Deploy] Bundle uploaded", { url: blob.url, size: bundle.html.length });

  // 4. Create or find app
  let app = await db.query.apps.findFirst({
    where: and(
      eq(apps.slug, subdomain),
      eq(apps.organization_id, organizationId)
    ),
  });
  
  if (!app) {
    const [newApp] = await db.insert(apps).values({
      name,
      description,
      slug: subdomain,
      organization_id: organizationId,
      created_by_user_id: userId,
      app_url: `https://${subdomain}.${MINIAPP_DOMAIN}`,
      is_active: true,
      features_enabled: {
        chat: true,
        image: false,
        video: false,
        voice: false,
        agents: false,
        embedding: false,
      },
    }).returning();
    app = newApp;
  }

  // 5. Get next version number
  const latestBundle = await db.query.miniappBundles.findFirst({
    where: eq(miniappBundles.app_id, app.id),
    orderBy: desc(miniappBundles.version),
  });
  const nextVersion = (latestBundle?.version || 0) + 1;

  // 6. Deactivate previous bundles
  await db.update(miniappBundles)
    .set({ is_active: false })
    .where(eq(miniappBundles.app_id, app.id));

  // 7. Create bundle record
  const [bundleRecord] = await db.insert(miniappBundles).values({
    app_id: app.id,
    version: nextVersion,
    bundle_url: blob.url.replace("/index.html", ""),
    entry_file: "index.html",
    framework: detectFramework(fragment.template),
    build_hash: bundle.hash,
    bundle_size: bundle.html.length,
    source_project_id: projectId,
    source_type: "fragment",
    runtime_config: runtimeConfig,
    is_active: true,
    status: "active",
    deployed_at: new Date(),
  }).returning();

  // 8. Create domain record
  const [domainRecord] = await db.insert(miniappDomains).values({
    app_id: app.id,
    subdomain,
    ssl_status: "active", // Wildcard SSL covers subdomains
    is_primary: true,
  }).returning();

  logger.info("[Miniapp Deploy] Deployment complete", {
    appId: app.id,
    subdomain,
    url: `https://${subdomain}.${MINIAPP_DOMAIN}`,
  });

  const result: DeployResult = {
    appId: app.id,
    bundleId: bundleRecord.id,
    url: `https://${subdomain}.${MINIAPP_DOMAIN}`,
    subdomain,
  };

  // 9. Setup custom domain if requested
  if (customDomain) {
    const domainSetup = await setupCustomDomain(app.id, customDomain);
    result.customDomain = customDomain;
    result.verificationRecords = domainSetup.verificationRecords;
  }

  return result;
}

function detectFramework(template: string): "react" | "vue" | "vanilla" | "nextjs" {
  if (template.includes("nextjs") || template.includes("react")) return "react";
  if (template.includes("vue") || template.includes("nuxt")) return "vue";
  return "vanilla";
}

/**
 * Setup custom domain via Vercel API
 */
async function setupCustomDomain(
  appId: string,
  domain: string
): Promise<{ verified: boolean; verificationRecords: DomainVerificationRecord[] }> {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    logger.warn("[Miniapp Deploy] Vercel API not configured, skipping custom domain setup");
    return { verified: false, verificationRecords: [] };
  }

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    logger.error("[Miniapp Deploy] Vercel domain setup failed", { error });
    throw new Error(`Failed to setup custom domain: ${error.error?.message || "Unknown error"}`);
  }

  const result = await response.json();
  
  const verificationRecords: DomainVerificationRecord[] = (result.verification || []).map(
    (v: { type: string; domain: string; value: string }) => ({
      type: v.type as "TXT" | "CNAME" | "A",
      name: v.domain,
      value: v.value,
    })
  );

  // Update domain record
  await db.update(miniappDomains)
    .set({
      custom_domain: domain,
      custom_domain_verified: result.verified || false,
      verification_records: verificationRecords,
      vercel_domain_id: result.id,
      ssl_status: result.verified ? "active" : "pending",
    })
    .where(eq(miniappDomains.app_id, appId));

  return {
    verified: result.verified || false,
    verificationRecords,
  };
}

/**
 * Get active bundle for an app
 */
export async function getActiveBundle(appId: string) {
  return db.query.miniappBundles.findFirst({
    where: and(
      eq(miniappBundles.app_id, appId),
      eq(miniappBundles.is_active, true)
    ),
  });
}

/**
 * Get domain by subdomain
 */
export async function getDomainBySubdomain(subdomain: string) {
  return db.query.miniappDomains.findFirst({
    where: eq(miniappDomains.subdomain, subdomain),
  });
}

/**
 * Get domain by custom domain
 */
export async function getDomainByCustomDomain(domain: string) {
  return db.query.miniappDomains.findFirst({
    where: eq(miniappDomains.custom_domain, domain),
  });
}

/**
 * List all miniapps for an organization
 */
export async function listMiniapps(organizationId: string) {
  const miniapps = await db
    .select({
      app: apps,
      domain: miniappDomains,
      bundle: miniappBundles,
    })
    .from(apps)
    .leftJoin(miniappDomains, and(
      eq(miniappDomains.app_id, apps.id),
      eq(miniappDomains.is_primary, true)
    ))
    .leftJoin(miniappBundles, and(
      eq(miniappBundles.app_id, apps.id),
      eq(miniappBundles.is_active, true)
    ))
    .where(eq(apps.organization_id, organizationId));

  return miniapps.map(({ app, domain, bundle }) => ({
    id: app.id,
    name: app.name,
    slug: app.slug,
    url: domain ? `https://${domain.subdomain}.${MINIAPP_DOMAIN}` : null,
    customDomain: domain?.custom_domain,
    version: bundle?.version,
    status: bundle?.status || "not_deployed",
    createdAt: app.created_at,
    deployedAt: bundle?.deployed_at,
  }));
}

export const miniappDeployService = {
  deploy: deployMiniapp,
  getActiveBundle,
  getDomainBySubdomain,
  getDomainByCustomDomain,
  listMiniapps,
};


