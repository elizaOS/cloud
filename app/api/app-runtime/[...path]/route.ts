/**
 * App Runtime
 *
 * This route serves app content from Vercel Blob storage.
 * It handles:
 * - Subdomain-based routing
 * - Custom domain support
 * - Runtime injection (auth, storage, API proxy)
 * - Static asset serving with CDN caching
 *
 * In production, this should be deployed as a separate Vercel project
 * with wildcard domain *.apps.elizacloud.ai pointing to it.
 */

import { NextRequest, NextResponse } from "next/server";
import { appDeployService } from "@/lib/services/app-deploy";
import type { AppRuntimeConfig } from "@/db/schemas/app-bundles";

const APP_DOMAIN = process.env.APP_DOMAIN || "apps.elizacloud.ai";
const API_BASE = process.env.NEXT_PUBLIC_APP_URL || "https://api.elizacloud.ai";

/**
 * Extract subdomain from host header
 */
function extractSubdomain(host: string | null): string | null {
  if (!host) return null;

  // Remove port if present
  const hostname = host.split(":")[0];

  // Check if it's our app domain
  if (hostname.endsWith(`.${APP_DOMAIN}`)) {
    return hostname.replace(`.${APP_DOMAIN}`, "");
  }

  // For local development
  if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
    // Try to get subdomain from query param for local testing
    return null;
  }

  // Could be a custom domain - return the full hostname
  return hostname;
}

/**
 * Inject runtime helpers into HTML
 */
function injectRuntime(
  html: string,
  config: AppRuntimeConfig,
  appId: string,
  subdomain: string,
): string {
  const runtimeScript = `
<script>
  window.__ELIZA_CLOUD__ = {
    appId: "${appId}",
    apiBase: "${API_BASE}",
    subdomain: "${subdomain}",
    features: {
      auth: ${config.injectAuth ?? true},
      storage: ${config.injectStorage ?? true},
      apiProxy: ${config.apiProxy ?? true},
    },
  };
  
  // Simple fetch wrapper for API calls
  window.elizaFetch = async function(endpoint, options = {}) {
    const url = window.__ELIZA_CLOUD__.apiBase + endpoint;
    const headers = {
      'Content-Type': 'application/json',
      'X-App-Id': window.__ELIZA_CLOUD__.appId,
      ...options.headers,
    };
    
    // Add auth token if available
    const token = localStorage.getItem('eliza-auth-token');
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    
    return fetch(url, { ...options, headers });
  };
  
  // Storage helpers
  window.elizaStorage = {
    async get(collection, id) {
      const res = await elizaFetch('/api/v1/app/storage/' + collection + '/' + id);
      return res.json();
    },
    async set(collection, id, data) {
      const res = await elizaFetch('/api/v1/app/storage/' + collection + '/' + id, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    async list(collection, query = {}) {
      const params = new URLSearchParams(query);
      const res = await elizaFetch('/api/v1/app/storage/' + collection + '?' + params);
      return res.json();
    },
  };
  
  console.log('[Eliza Cloud] App runtime initialized', window.__ELIZA_CLOUD__);
</script>
${config.customHead || ""}
`;

  // Inject before </head>
  return html.replace("</head>", `${runtimeScript}</head>`);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const host = request.headers.get("host");

  // For local development, allow subdomain query param
  let subdomain = extractSubdomain(host);
  if (!subdomain) {
    subdomain = request.nextUrl.searchParams.get("subdomain");
  }

  if (!subdomain) {
    return NextResponse.json({ error: "Invalid app URL" }, { status: 400 });
  }

  // Look up domain (subdomain or custom domain)
  let domain = await appDeployService.getDomainBySubdomain(subdomain);
  if (!domain) {
    domain = await appDeployService.getDomainByCustomDomain(subdomain);
  }

  if (!domain) {
    return new NextResponse(generateNotFoundPage(subdomain), {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Get active bundle
  const bundle = await appDeployService.getActiveBundle(domain.app_id);
  if (!bundle) {
    return new NextResponse(generateNotFoundPage(subdomain), {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Determine requested file
  const requestedPath = path?.join("/") || "index.html";
  const fileUrl = `${bundle.bundle_url}/${requestedPath}`;

  // Fetch from Blob storage
  const response = await fetch(fileUrl);

  if (!response.ok) {
    // For SPA routing, serve index.html for non-file paths
    if (!requestedPath.includes(".")) {
      const indexUrl = `${bundle.bundle_url}/${bundle.entry_file}`;
      const indexResponse = await fetch(indexUrl);

      if (indexResponse.ok) {
        const html = await indexResponse.text();
        const injectedHtml = injectRuntime(
          html,
          bundle.runtime_config,
          domain.app_id,
          domain.subdomain,
        );

        return new NextResponse(injectedHtml, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // For HTML files, inject runtime
  const contentType =
    response.headers.get("content-type") || "application/octet-stream";

  if (contentType.includes("text/html")) {
    const html = await response.text();
    const injectedHtml = injectRuntime(
      html,
      bundle.runtime_config,
      domain.app_id,
      domain.subdomain,
    );

    return new NextResponse(injectedHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  // For static assets, pass through with long cache
  return new NextResponse(response.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

function generateNotFoundPage(subdomain: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App Not Found</title>
  <style>
    body { 
      font-family: system-ui, sans-serif; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      min-height: 100vh; 
      margin: 0;
      background: #0a0a0a;
      color: #fff;
    }
    .container { text-align: center; max-width: 400px; padding: 2rem; }
    h1 { color: #ff5800; margin-bottom: 1rem; }
    p { color: #888; line-height: 1.6; }
    .subdomain { 
      font-family: monospace; 
      background: #1a1a1a; 
      padding: 0.25rem 0.5rem; 
      border-radius: 4px;
    }
    a { color: #ff5800; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>App Not Found</h1>
    <p>The app <span class="subdomain">${subdomain}</span> doesn't exist or hasn't been deployed yet.</p>
    <p><a href="https://elizacloud.ai/fragments">Create your own app →</a></p>
  </div>
</body>
</html>`;
}
