import { chromium, type FullConfig } from "@playwright/test";

/**
 * Global Setup - Page Warmup
 *
 * Pre-compiles pages before running tests to avoid timeout issues
 * during test execution. This is especially important in development
 * mode where Next.js compiles pages on-demand.
 *
 * In CI/production mode, pages are already built, but we still
 * hit them to ensure the server is warmed up.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const IS_DEV = process.env.NODE_ENV !== "production" && !process.env.CI;

// Pages to warm up - ordered by priority and dependency
const PAGES_TO_WARMUP = [
  // Core public pages
  "/",
  "/login",
  "/marketplace",
  "/terms-of-service",
  "/privacy-policy",
  "/auth-error",
  "/auth/error",
  "/auth/cli-login",

  // Dashboard pages (will redirect to login if not authenticated, but still compiles)
  "/dashboard",
  "/dashboard/chat",
  "/dashboard/build",
  "/dashboard/billing",
  "/dashboard/account",
  "/dashboard/settings",
  "/dashboard/api-keys",
  "/dashboard/api-explorer",
  "/dashboard/analytics",
  "/dashboard/containers",
  "/dashboard/my-agents",
  "/dashboard/gallery",
  "/dashboard/storage",
  "/dashboard/knowledge",
  "/dashboard/image",
  "/dashboard/video",
  "/dashboard/voices",
  "/dashboard/mcps",
  "/dashboard/invoices",
  "/dashboard/build",
  "/dashboard/apps",
  "/dashboard/organization",

  // Special pages
  "/billing/success",
  "/dashboard/billing/success",
  "/invite/accept",
];

// API routes to warm up (just hit to compile)
const API_ROUTES_TO_WARMUP = [
  "/api/v1/agents",
  "/api/v1/api-keys",
  "/api/v1/characters",
  "/api/credits/balance",
  "/api/marketplace/characters",
  "/api/stripe/credit-packs",
];

async function warmupPage(
  url: string,
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  timeout: number
): Promise<{ url: string; status: number | null; time: number }> {
  const startTime = Date.now();
  const context = await browser.newContext();
  const page = await context.newPage();

  let status: number | null = null;

  const response = await page
    .goto(url, {
      waitUntil: "domcontentloaded",
      timeout,
    })
    .catch((error) => {
      console.log(`  ⚠️ ${url}: ${error.message}`);
      return null;
    });

  status = response?.status() ?? null;
  const time = Date.now() - startTime;

  await context.close();

  return { url, status, time };
}

async function warmupApiRoute(
  url: string,
  timeout: number
): Promise<{ url: string; status: number | null; time: number }> {
  const startTime = Date.now();
  let status: number | null = null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const response = await fetch(url, {
    method: "GET",
    signal: controller.signal,
  }).catch((error) => {
    console.log(`  ⚠️ ${url}: ${error.message}`);
    return null;
  });

  clearTimeout(timeoutId);
  status = response?.status ?? null;
  const time = Date.now() - startTime;

  return { url, status, time };
}

async function globalSetup(_config: FullConfig) {
  console.log("\n🔥 Warming up pages and API routes...\n");
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Mode: ${IS_DEV ? "Development" : "Production/CI"}\n`);

  const browser = await chromium.launch();

  // Longer timeout for dev mode (pages need to compile)
  const pageTimeout = IS_DEV ? 120000 : 30000;
  const apiTimeout = IS_DEV ? 60000 : 15000;

  // Warm up pages
  console.log("📄 Warming up pages...");
  const pageResults: Array<{
    url: string;
    status: number | null;
    time: number;
  }> = [];

  for (const path of PAGES_TO_WARMUP) {
    const url = `${BASE_URL}${path}`;
    const result = await warmupPage(url, browser, pageTimeout);
    pageResults.push(result);

    const statusEmoji =
      result.status === 200
        ? "✅"
        : result.status === 307 || result.status === 308
          ? "↩️"
          : result.status === 401 || result.status === 403
            ? "🔒"
            : result.status
              ? "⚠️"
              : "❌";

    console.log(
      `  ${statusEmoji} ${path} - ${result.status ?? "failed"} (${result.time}ms)`
    );
  }

  // Warm up API routes
  console.log("\n🔌 Warming up API routes...");
  const apiResults: Array<{
    url: string;
    status: number | null;
    time: number;
  }> = [];

  for (const path of API_ROUTES_TO_WARMUP) {
    const url = `${BASE_URL}${path}`;
    const result = await warmupApiRoute(url, apiTimeout);
    apiResults.push(result);

    const statusEmoji =
      result.status === 200
        ? "✅"
        : result.status === 401 || result.status === 403
          ? "🔒"
          : result.status
            ? "⚠️"
            : "❌";

    console.log(
      `  ${statusEmoji} ${path} - ${result.status ?? "failed"} (${result.time}ms)`
    );
  }

  await browser.close();

  // Summary
  // Note: 500 errors on protected pages are expected (auth required)
  // We consider a page "compiled" if we got any response
  const compiledPages = pageResults.filter((r) => r.status !== null).length;
  const publicPagesOk = pageResults.filter(
    (r) => r.status && r.status < 500
  ).length;
  const compiledApis = apiResults.filter((r) => r.status !== null).length;

  console.log("\n📊 Warmup Summary:");
  console.log(
    `  Pages: ${compiledPages}/${pageResults.length} compiled (${publicPagesOk} public pages OK)`
  );
  console.log(`  APIs: ${compiledApis}/${apiResults.length} compiled`);
  console.log(
    "\n  Note: 500 errors on dashboard pages are expected (auth required)"
  );
  console.log("");

  // Don't fail setup on warmup failures - tests will handle them
  return;
}

export default globalSetup;

