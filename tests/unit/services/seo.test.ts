import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "crypto";
import { seoService } from "@/lib/services/seo";
import {
  seoArtifactsRepository,
  seoProviderCallsRepository,
  seoRequestsRepository,
} from "@/db/repositories";
import { creditsService } from "@/lib/services/credits";
import type {
  NewSeoRequest,
  SeoArtifact,
  SeoProviderCall,
  SeoRequest,
} from "@/db/schemas/seo";

// In-memory fakes for repositories
const requestsStore = new Map<string, SeoRequest>();
const artifactsStore: SeoArtifact[] = [];
const providerCallsStore: SeoProviderCall[] = [];

const originalRequestsRepo = {
  create: seoRequestsRepository.create,
  findById: seoRequestsRepository.findById,
  findByIdempotency: seoRequestsRepository.findByIdempotency,
  updateStatus: seoRequestsRepository.updateStatus,
  listByOrganization: seoRequestsRepository.listByOrganization,
};

const originalArtifactsRepo = {
  create: seoArtifactsRepository.create,
  listByRequest: seoArtifactsRepository.listByRequest,
};

const originalProviderCallsRepo = {
  create: seoProviderCallsRepository.create,
  listByRequest: seoProviderCallsRepository.listByRequest,
  updateStatus: seoProviderCallsRepository.updateStatus,
};

const originalDeductCredits = creditsService.deductCredits;

function hydrateRequest(data: Partial<NewSeoRequest>): SeoRequest {
  const now = new Date();
  return {
    id: randomUUID(),
    organization_id: data.organization_id!,
    app_id: data.app_id ?? null,
    user_id: data.user_id ?? null,
    api_key_id: data.api_key_id ?? null,
    type: data.type!,
    status: (data as SeoRequest).status ?? "pending",
    page_url: data.page_url ?? null,
    locale: data.locale ?? "en-US",
    search_engine: data.search_engine ?? "google",
    device: data.device ?? "desktop",
    environment: data.environment ?? "production",
    agent_identifier: data.agent_identifier ?? null,
    keywords: data.keywords ?? [],
    prompt_context: data.prompt_context ?? null,
    idempotency_key: data.idempotency_key ?? null,
    total_cost: data.total_cost ?? "0",
    error: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
}

beforeEach(() => {
  requestsStore.clear();
  artifactsStore.length = 0;
  providerCallsStore.length = 0;

  // Stub repository methods with in-memory behavior
  seoRequestsRepository.create = async (data: NewSeoRequest) => {
    const r = hydrateRequest(data);
    requestsStore.set(r.id, r);
    return r;
  };
  seoRequestsRepository.findById = async (id: string) => requestsStore.get(id);
  seoRequestsRepository.findByIdempotency = async (orgId: string, key: string) =>
    [...requestsStore.values()].find(
      (r) => r.organization_id === orgId && r.idempotency_key === key,
    );
  seoRequestsRepository.updateStatus = async (id, status, extras) => {
    const current = requestsStore.get(id);
    if (!current) return undefined;
    const updated: SeoRequest = {
      ...current,
      ...extras,
      status,
      updated_at: new Date(),
      completed_at: status === "completed" ? new Date() : current.completed_at,
    };
    requestsStore.set(id, updated);
    return updated;
  };
  seoRequestsRepository.listByOrganization = async (orgId: string) =>
    [...requestsStore.values()].filter((r) => r.organization_id === orgId);

  seoArtifactsRepository.create = async (data) => {
    const artifact: SeoArtifact = {
      ...data,
      id: randomUUID(),
      created_at: new Date(),
    };
    artifactsStore.push(artifact);
    return artifact;
  };
  seoArtifactsRepository.listByRequest = async (requestId: string) =>
    artifactsStore.filter((a) => a.request_id === requestId);

  seoProviderCallsRepository.create = async (data) => {
    const call: SeoProviderCall = {
      ...data,
      id: randomUUID(),
      status: "pending",
      started_at: new Date(),
      created_at: new Date(),
      completed_at: null,
    };
    providerCallsStore.push(call);
    return call;
  };
  seoProviderCallsRepository.listByRequest = async (requestId: string) =>
    providerCallsStore.filter((c) => c.request_id === requestId);
  seoProviderCallsRepository.updateStatus = async (id, status, extras) => {
    const call = providerCallsStore.find((c) => c.id === id);
    if (!call) return undefined;
    Object.assign(call, extras, { status, completed_at: new Date() });
    return call;
  };

  // Stub database update used by seoService (we don't need persistence here)
  // Stub credit deduction to avoid touching real DB
  creditsService.deductCredits = async () => ({
    success: true,
    newBalance: 0,
    transaction: null,
  });

  // Set required env vars
  process.env.DATAFORSEO_LOGIN = "login";
  process.env.DATAFORSEO_PASSWORD = "password";
  process.env.SERPAPI_KEY = "serp-key";
  process.env.INDEXNOW_KEY = "indexnow-key";
  process.env.INDEXNOW_KEY_LOCATION = "https://example.com/indexnow-key.txt";
  process.env.SEO_SKIP_DB_PERSIST = "true";

  // Stub fetch for external calls
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.includes("dataforseo.com")) {
      return new Response(
        JSON.stringify({
          tasks: [
            {
              result: [
                {
                  keyword_data: [
                    { keyword: "alpha", search_volume: 100, cpc: 1.2, competition: 0.5 },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }

    if (url.includes("serpapi.com")) {
      return new Response(
        JSON.stringify({
          organic_results: [
            { position: 1, title: "Result 1", link: "https://example.com", snippet: "Snippet" },
          ],
        }),
        { status: 200 },
      );
    }

    if (url.includes("indexnow.org")) {
      return new Response(JSON.stringify({ submitted: true }), { status: 200 });
    }

    // Health check fetch to page
    if (url.startsWith("https://example.com/health")) {
      return new Response(
        `<html><head><link rel="canonical" href="https://example.com/canonical" /></head><body>ok</body></html>`,
        { status: 200 },
      );
    }

    return new Response("ok", { status: 200 });
  };
});

afterAll(() => {
  // Restore originals
  seoRequestsRepository.create = originalRequestsRepo.create;
  seoRequestsRepository.findById = originalRequestsRepo.findById;
  seoRequestsRepository.findByIdempotency = originalRequestsRepo.findByIdempotency;
  seoRequestsRepository.updateStatus = originalRequestsRepo.updateStatus;
  seoRequestsRepository.listByOrganization = originalRequestsRepo.listByOrganization;

  seoArtifactsRepository.create = originalArtifactsRepo.create;
  seoArtifactsRepository.listByRequest = originalArtifactsRepo.listByRequest;

  seoProviderCallsRepository.create = originalProviderCallsRepo.create;
  seoProviderCallsRepository.listByRequest = originalProviderCallsRepo.listByRequest;
  seoProviderCallsRepository.updateStatus = originalProviderCallsRepo.updateStatus;

  creditsService.deductCredits = originalDeductCredits;
});

describe("SeoService edge cases", () => {
  it("fails fast when pageUrl is missing for page-scoped types", async () => {
    await expect(
      seoService.createRequest({
        organizationId: "org-1",
        type: "meta_generate",
        keywords: ["test"],
      }),
    ).rejects.toThrow("pageUrl is required for this SEO request type");
  });

  it("reuses existing request when idempotencyKey matches", async () => {
    const first = await seoService.createRequest({
      organizationId: "org-1",
      type: "keyword_research",
      keywords: ["alpha"],
      idempotencyKey: "dup-key",
    });

    const second = await seoService.createRequest({
      organizationId: "org-1",
      type: "keyword_research",
      keywords: ["alpha"],
      idempotencyKey: "dup-key",
    });

    expect(second.request.id).toBe(first.request.id);
    expect(await seoArtifactsRepository.listByRequest(first.request.id)).toHaveLength(1);
  });

  it("rejects SERP snapshot when no query or keywords provided", async () => {
    await expect(
      seoService.createRequest({
        organizationId: "org-1",
        type: "serp_snapshot",
      }),
    ).rejects.toThrow("Query or keywords required for SERP snapshot");
  });

  it("performs health check and records artifact", async () => {
    const result = await seoService.createRequest({
      organizationId: "org-1",
      type: "health_check",
      pageUrl: "https://example.com/health",
    });

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe("health_report");
    expect(result.artifacts[0].data).toMatchObject({
      ok: true,
      canonical: "https://example.com/canonical",
      robots: true,
    });
  });
});

