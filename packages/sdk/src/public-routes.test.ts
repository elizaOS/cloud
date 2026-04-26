import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ElizaCloudClient } from "./client.js";
import { ELIZA_CLOUD_PUBLIC_ENDPOINTS } from "./public-routes.js";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const METHOD_RE =
  /export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
const METHOD_REEXPORT_RE = /export\s*\{\s*([^}]+)\s*\}\s*from\b/g;

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await readdir(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findCloudRoot(startDir: string): Promise<string> {
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

function segmentToRouteParam(segment: string): string {
  if (!segment.startsWith("[") || !segment.endsWith("]")) return segment;
  const inner = segment.slice(1, -1);
  return `{${inner.startsWith("...") ? inner.slice(3) : inner}}`;
}

async function walkRoutes(
  dir: string,
  relativeSegments: string[] = [],
  out: Array<{ fullPath: string; relativeSegments: string[] }> = []
) {
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
    })
  );
  return out;
}

function extractMethods(source: string): string[] {
  const methods = new Set<string>();
  for (const match of source.matchAll(METHOD_RE)) {
    methods.add(match[1]);
  }
  for (const match of source.matchAll(METHOD_REEXPORT_RE)) {
    for (const exported of match[1].split(",")) {
      const method = exported.trim().split(/\s+as\s+/i)[0]?.trim();
      if (HTTP_METHODS.has(method)) methods.add(method);
    }
  }
  return Array.from(methods)
    .filter((method) => method !== "OPTIONS" && method !== "HEAD")
    .sort();
}

async function discoverPublicRouteKeys(): Promise<string[]> {
  const cloudRoot = await findCloudRoot(process.cwd());
  const routeFiles = await walkRoutes(path.join(cloudRoot, "app", "api"));
  const keys: string[] = [];

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile.fullPath, "utf8");
    const route =
      "/api" +
      (routeFile.relativeSegments.length
        ? `/${routeFile.relativeSegments.map(segmentToRouteParam).join("/")}`
        : "");
    if (!route.startsWith("/api/v1/") && !route.startsWith("/api/elevenlabs/")) {
      continue;
    }

    for (const method of extractMethods(source)) {
      keys.push(`${method} ${route}`);
    }
  }

  return keys.sort();
}

describe("generated public route SDK surface", () => {
  it("has one generated SDK route for every public route method pair", async () => {
    const discovered = await discoverPublicRouteKeys();
    const generated = Object.keys(ELIZA_CLOUD_PUBLIC_ENDPOINTS).sort();

    expect(generated).toEqual(discovered);
  });

  it("exposes callable JSON and raw methods for every generated route", () => {
    const client = new ElizaCloudClient();
    const routeClient = client.routes as unknown as Record<string, unknown>;

    for (const definition of Object.values(ELIZA_CLOUD_PUBLIC_ENDPOINTS)) {
      expect(typeof routeClient[definition.methodName]).toBe("function");
      expect(typeof routeClient[`${definition.methodName}Raw`]).toBe("function");
    }
  });

  it("builds encoded normal and catch-all path params", async () => {
    const requests: string[] = [];
    const client = new ElizaCloudClient({
      baseUrl: "http://cloud.test",
      fetchImpl: async (input, init) => {
        requests.push(`${init?.method ?? "GET"} ${String(input)}`);
        return Response.json({ success: true });
      },
    });

    await client.routes.call("GET /api/v1/agents/{agentId}/n8n/{path}", {
      pathParams: { agentId: "agent 1", path: "workflow/run" },
      query: { q: "hello world" },
    });

    expect(requests.at(-1)).toBe(
      "GET http://cloud.test/api/v1/agents/agent%201/n8n/workflow/run?q=hello+world"
    );

    await client.routes.call("GET /api/v1/agents/{agentId}/n8n/{path}", {
      pathParams: { agentId: "agent 1", path: ["workflow", "run next"] },
    });

    expect(requests.at(-1)).toBe(
      "GET http://cloud.test/api/v1/agents/agent%201/n8n/workflow/run%20next"
    );
  });

  it("throws a clear error when required path params are missing", () => {
    const client = new ElizaCloudClient({ baseUrl: "http://cloud.test" });

    expect(() =>
      client.routes.call("GET /api/v1/agents/{agentId}", {
        pathParams: {} as { agentId: string | number },
      })
    ).toThrow('Missing path parameter "agentId"');
  });

  it("throws a clear error for unexpected and multi-segment normal path params", () => {
    const client = new ElizaCloudClient({ baseUrl: "http://cloud.test" });

    expect(() =>
      client.routes.call("GET /api/v1/models", {
        pathParams: { extra: "value" },
      } as never)
    ).toThrow('Unexpected path parameter "extra"');

    expect(() =>
      client.routes.call("GET /api/v1/agents/{agentId}", {
        pathParams: { agentId: ["agent", "1"] },
      } as never)
    ).toThrow('Path parameter "agentId"');
  });

  it("returns raw responses for raw calls and always-binary generated methods", async () => {
    const requests: string[] = [];
    const client = new ElizaCloudClient({
      baseUrl: "http://cloud.test",
      fetchImpl: async (input, init) => {
        requests.push(`${init?.method ?? "GET"} ${String(input)}`);
        return new Response("audio-bytes", {
          headers: { "Content-Type": "audio/mpeg" },
        });
      },
    });

    const raw = await client.routes.postApiV1VoiceTts({
      json: { text: "hello" },
    });

    expect(raw).toBeInstanceOf(Response);
    expect(await raw.text()).toBe("audio-bytes");
    expect(requests.at(-1)).toBe("POST http://cloud.test/api/v1/voice/tts");
  });
});
