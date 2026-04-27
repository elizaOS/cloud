#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const METHOD_RE =
  /export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
const METHOD_REEXPORT_RE = /export\s*\{\s*([^}]+)\s*\}\s*from\b/g;

const SDK_TYPED_ROUTES = new Map(
  [
    ["GET", "/api/openapi.json", "getOpenApiSpec"],
    ["POST", "/api/auth/cli-session", "startCliLogin"],
    ["GET", "/api/auth/cli-session/{sessionId}", "pollCliLogin"],
    ["POST", "/api/auth/pair", "pairWithToken"],
    ["GET", "/api/v1/models", "listModels"],
    ["POST", "/api/v1/responses", "createResponse"],
    ["POST", "/api/v1/chat/completions", "createChatCompletion"],
    ["POST", "/api/v1/embeddings", "createEmbeddings"],
    ["POST", "/api/v1/generate-image", "generateImage"],
    ["GET", "/api/v1/credits/balance", "getCreditsBalance"],
    ["GET", "/api/v1/credits/summary", "getCreditsSummary"],
    ["GET", "/api/v1/containers", "listContainers"],
    ["POST", "/api/v1/containers", "createContainer"],
    ["GET", "/api/v1/containers/{id}", "getContainer"],
    ["PATCH", "/api/v1/containers/{id}", "updateContainer"],
    ["DELETE", "/api/v1/containers/{id}", "deleteContainer"],
    ["GET", "/api/v1/containers/{id}/health", "getContainerHealth"],
    ["GET", "/api/v1/containers/{id}/metrics", "getContainerMetrics"],
    ["GET", "/api/v1/containers/{id}/logs", "getContainerLogs"],
    ["GET", "/api/v1/containers/{id}/deployments", "getContainerDeployments"],
    ["GET", "/api/v1/containers/quota", "getContainerQuota"],
    ["POST", "/api/v1/containers/credentials", "createContainerCredentials"],
    ["GET", "/api/v1/milady/agents", "listMiladyAgents"],
    ["POST", "/api/v1/milady/agents", "createMiladyAgent"],
    ["GET", "/api/v1/milady/agents/{agentId}", "getMiladyAgent"],
    ["PATCH", "/api/v1/milady/agents/{agentId}", "updateMiladyAgent"],
    ["DELETE", "/api/v1/milady/agents/{agentId}", "deleteMiladyAgent"],
    ["POST", "/api/v1/milady/agents/{agentId}/provision", "provisionMiladyAgent"],
    ["POST", "/api/v1/milady/agents/{agentId}/suspend", "suspendMiladyAgent"],
    ["POST", "/api/v1/milady/agents/{agentId}/resume", "resumeMiladyAgent"],
    ["POST", "/api/v1/milady/agents/{agentId}/snapshot", "createMiladyAgentSnapshot"],
    ["GET", "/api/v1/milady/agents/{agentId}/backups", "listMiladyAgentBackups"],
    ["POST", "/api/v1/milady/agents/{agentId}/restore", "restoreMiladyAgentBackup"],
    ["POST", "/api/v1/milady/agents/{agentId}/pairing-token", "getMiladyAgentPairingToken"],
    ["POST", "/api/v1/milady/gateway-relay/sessions", "registerGatewayRelaySession"],
    ["GET", "/api/v1/milady/gateway-relay/sessions/{sessionId}/next", "pollGatewayRelayRequest"],
    [
      "POST",
      "/api/v1/milady/gateway-relay/sessions/{sessionId}/responses",
      "submitGatewayRelayResponse",
    ],
    [
      "DELETE",
      "/api/v1/milady/gateway-relay/sessions/{sessionId}",
      "disconnectGatewayRelaySession",
    ],
    ["GET", "/api/v1/jobs/{jobId}", "getJob"],
    ["GET", "/api/v1/user", "getUser"],
    ["PATCH", "/api/v1/user", "updateUser"],
    ["GET", "/api/v1/api-keys", "listApiKeys"],
    ["POST", "/api/v1/api-keys", "createApiKey"],
    ["PATCH", "/api/v1/api-keys/{id}", "updateApiKey"],
    ["DELETE", "/api/v1/api-keys/{id}", "deleteApiKey"],
    ["POST", "/api/v1/api-keys/{id}/regenerate", "regenerateApiKey"],
  ].map(([method, route, sdkMethod]) => [`${method} ${route}`, sdkMethod]),
);

async function pathExists(candidate) {
  try {
    await readdir(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findCloudRoot(startDir) {
  let current = startDir;
  while (true) {
    if (await pathExists(path.join(current, "app", "api"))) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not find cloud app/api directory from ${startDir}`);
    }
    current = parent;
  }
}

async function readGeneratedPublicRouteMethods(cloudRoot) {
  const sourcePath = path.join(cloudRoot, "packages", "sdk", "src", "public-routes.ts");
  const source = await readFile(sourcePath, "utf8");
  const endpointRe =
    /^\s+"([^"]+)": \{ method: "([^"]+)", path: "([^"]+)", methodName: "([^"]+)"/gm;
  const routes = new Map();

  for (const match of source.matchAll(endpointRe)) {
    routes.set(match[1], match[4]);
  }
  return routes;
}

function segmentToRouteParam(segment) {
  if (!segment.startsWith("[") || !segment.endsWith("]")) return segment;
  const inner = segment.slice(1, -1);
  return `{${inner.startsWith("...") ? inner.slice(3) : inner}}`;
}

async function walkRoutes(dir, relativeSegments = [], out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith(".")) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkRoutes(fullPath, [...relativeSegments, entry.name], out);
        return;
      }
      if (entry.isFile() && entry.name === "route.ts") {
        out.push({ fullPath, relativeSegments });
      }
    }),
  );
  return out;
}

function extractMethods(source) {
  const methods = new Set();
  for (const match of source.matchAll(METHOD_RE)) {
    methods.add(match[1]);
  }
  for (const match of source.matchAll(METHOD_REEXPORT_RE)) {
    for (const exported of match[1].split(",")) {
      const method = exported
        .trim()
        .split(/\s+as\s+/i)[0]
        ?.trim();
      if (HTTP_METHODS.has(method)) methods.add(method);
    }
  }
  return Array.from(methods).sort();
}

function scopeForRoute(route) {
  if (route.startsWith("/api/v1/") || route === "/api/v1") return "public";
  if (route.startsWith("/api/elevenlabs/")) return "public";
  if (route.startsWith("/api/auth/")) return "auth";
  if (route.startsWith("/api/internal/")) return "internal";
  if (route.startsWith("/api/cron/")) return "cron";
  if (route.startsWith("/api/webhooks/")) return "webhook";
  if (route.includes("/webhook")) return "webhook";
  if (route.startsWith("/api/stripe/")) return "billing-webhook-or-checkout";
  if (route.startsWith("/api/mcp") || route.startsWith("/api/mcps/")) return "mcp-transport";
  return "app-or-dashboard";
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const parts = row.route.split("/").filter(Boolean);
    const key = row.route.startsWith("/api/v1/") ? parts[2] : (parts[1] ?? "root");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function table(rows, columns) {
  const header = `| ${columns.map((column) => column.title).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => column.value(row)).join(" | ")} |`);
  return [header, separator, ...body].join("\n");
}

function routeTable(rows) {
  return table(rows, [
    { title: "Method", value: (row) => row.method },
    { title: "Route", value: (row) => `\`${row.route}\`` },
    { title: "Source", value: (row) => `\`${row.file}\`` },
  ]);
}

function coverageTable(rows) {
  return table(rows, [
    { title: "Method", value: (row) => row.method },
    { title: "Route", value: (row) => `\`${row.route}\`` },
    { title: "SDK Method", value: (row) => `\`${row.sdkMethod}\`` },
    { title: "Source", value: (row) => `\`${row.file}\`` },
  ]);
}

const cwd = await findCloudRoot(process.cwd());
const generatedPublicRoutes = await readGeneratedPublicRouteMethods(cwd);
const routeFiles = await walkRoutes(path.join(cwd, "app", "api"));
const routePairs = [];

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile.fullPath, "utf8");
  const route =
    "/api" +
    (routeFile.relativeSegments.length
      ? `/${routeFile.relativeSegments.map(segmentToRouteParam).join("/")}`
      : "");
  const file = path.relative(cwd, routeFile.fullPath);
  for (const method of extractMethods(source)) {
    if (method === "OPTIONS" || method === "HEAD") continue;
    routePairs.push({ method, route, file, scope: scopeForRoute(route) });
  }
}

routePairs.sort((a, b) => `${a.route} ${a.method}`.localeCompare(`${b.route} ${b.method}`));

const publicPairs = routePairs.filter((row) => row.scope === "public");
const coveredPublicPairs = publicPairs
  .filter((row) => generatedPublicRoutes.has(`${row.method} ${row.route}`))
  .map((row) => ({ ...row, sdkMethod: generatedPublicRoutes.get(`${row.method} ${row.route}`) }));
const missingPublicPairs = publicPairs.filter(
  (row) => !generatedPublicRoutes.has(`${row.method} ${row.route}`),
);
const generatedRoutesWithoutRouteFile = Array.from(generatedPublicRoutes.entries())
  .filter(([key]) => !publicPairs.some((row) => `${row.method} ${row.route}` === key))
  .map(([key, sdkMethod]) => ({ key, sdkMethod }));
const highLevelRoutesWithoutRouteFile = Array.from(SDK_TYPED_ROUTES.entries())
  .filter(([key]) => !routePairs.some((row) => `${row.method} ${row.route}` === key))
  .map(([key, sdkMethod]) => ({ key, sdkMethod }));

const routeScopeSummary = Array.from(
  routePairs.reduce((summary, row) => {
    summary.set(row.scope, (summary.get(row.scope) ?? 0) + 1);
    return summary;
  }, new Map()),
).sort(([a], [b]) => a.localeCompare(b));

const missingGroupSummary =
  groupRows(missingPublicPairs)
    .map(([group, rows]) => `| ${group} | ${rows.length} |`)
    .join("\n") || "| none | 0 |";

const lines = [
  "# Eliza Cloud SDK Route Coverage Audit",
  "",
  "Generated by `bun run audit:routes` from the real Next.js route tree under `app/api`.",
  "",
  "## Summary",
  "",
  `- Total route method pairs under \`app/api\`: ${routePairs.length}`,
  `- Public SDK-candidate route method pairs under \`/api/v1\` and \`/api/elevenlabs\`: ${publicPairs.length}`,
  `- Public route method pairs with generated SDK wrappers: ${coveredPublicPairs.length}`,
  `- Public route method pairs missing generated SDK wrappers: ${missingPublicPairs.length}`,
  `- Generated SDK route wrappers with no matching public route file: ${generatedRoutesWithoutRouteFile.length}`,
  `- High-level SDK helper route declarations with no matching route file: ${highLevelRoutesWithoutRouteFile.length}`,
  "",
  "## Route Scope Counts",
  "",
  "| Scope | Route Method Pairs |",
  "| --- | --- |",
  ...routeScopeSummary.map(([scope, count]) => `| ${scope} | ${count} |`),
  "",
  "## Missing Public SDK Wrappers By Group",
  "",
  "| Group | Missing Route Method Pairs |",
  "| --- | --- |",
  missingGroupSummary,
  "",
  "## Covered Public Routes",
  "",
  coverageTable(coveredPublicPairs),
  "",
  "## Missing Public Routes",
  "",
];

for (const [group, rows] of groupRows(missingPublicPairs)) {
  lines.push(`### ${group}`, "", routeTable(rows), "");
}
if (missingPublicPairs.length === 0) {
  lines.push("None.", "");
}

lines.push("## Non-Public Route Inventory", "");
for (const [scope, rows] of groupRows(routePairs.filter((row) => row.scope !== "public"))) {
  lines.push(`### ${scope}`, "", routeTable(rows), "");
}

if (generatedRoutesWithoutRouteFile.length > 0) {
  lines.push("## Generated SDK Routes Without Matching Public Route File", "");
  lines.push(
    table(generatedRoutesWithoutRouteFile, [
      { title: "Route", value: (row) => `\`${row.key}\`` },
      { title: "SDK Method", value: (row) => `\`${row.sdkMethod}\`` },
    ]),
  );
  lines.push("");
}

if (highLevelRoutesWithoutRouteFile.length > 0) {
  lines.push("## High-Level SDK Helper Routes Without Matching Route File", "");
  lines.push(
    table(highLevelRoutesWithoutRouteFile, [
      { title: "Route", value: (row) => `\`${row.key}\`` },
      { title: "SDK Method", value: (row) => `\`${row.sdkMethod}\`` },
    ]),
  );
  lines.push("");
}

process.stdout.write(`${lines.join("\n")}\n`);

if (missingPublicPairs.length > 0 || generatedRoutesWithoutRouteFile.length > 0) {
  console.error(
    `Route coverage failed: ${missingPublicPairs.length} missing, ${generatedRoutesWithoutRouteFile.length} orphan generated routes.`,
  );
  process.exitCode = 1;
}
