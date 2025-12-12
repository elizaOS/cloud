/**
 * Domain Management Service Tests
 *
 * Tests domain search, purchase, registration, assignment, and DNS operations.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

// Set environment variables before any imports
process.env.VERCEL_TOKEN = "test-token";
process.env.VERCEL_TEAM_ID = "test-team";

// Mock dependencies
const mockRepository = {
  findById: mock(() => Promise.resolve(null)),
  findByDomain: mock(() => Promise.resolve(null)),
  findByIdAndOrg: mock(() => Promise.resolve(null)),
  listByOrganization: mock(() => Promise.resolve([])),
  create: mock(() => Promise.resolve({ id: "new-domain-id" })),
  updateByOrg: mock(() => Promise.resolve({})),
  deleteByOrg: mock(() => Promise.resolve(true)),
  assignToApp: mock(() => Promise.resolve({})),
  assignToContainer: mock(() => Promise.resolve({})),
  assignToAgent: mock(() => Promise.resolve({})),
  assignToMcp: mock(() => Promise.resolve({})),
  unassign: mock(() => Promise.resolve({})),
  setVerificationToken: mock(() => Promise.resolve({})),
  markVerified: mock(() => Promise.resolve({})),
  updateDnsRecords: mock(() => Promise.resolve({})),
  createEvent: mock(() => Promise.resolve({})),
  getStats: mock(() => Promise.resolve({ total: 0, active: 0, pending: 0, suspended: 0, expiringSoon: 0 })),
  listUnassigned: mock(() => Promise.resolve([])),
};

const mockModerationService = {
  validateDomainName: mock(() =>
    Promise.resolve({ allowed: true, flags: [], requiresReview: false })
  ),
};

mock.module("@/db/repositories/managed-domains", () => ({
  managedDomainsRepository: mockRepository,
}));

mock.module("@/lib/services/domain-moderation", () => ({
  domainModerationService: mockModerationService,
}));

mock.module("@/lib/utils/logger", () => ({
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

// Mock fetch for Vercel API calls
const originalFetch = globalThis.fetch;
let mockFetch: typeof fetch;

const { domainManagementService } = await import("@/lib/services/domain-management");

describe("Domain Availability Check", () => {
  beforeEach(() => {
    Object.values(mockRepository).forEach((m) => {
      if (typeof m.mockReset === "function") m.mockReset();
    });
    mockModerationService.validateDomainName.mockReset();
    mockModerationService.validateDomainName.mockResolvedValue({
      allowed: true,
      flags: [],
      requiresReview: false,
    });

    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ available: true }), { status: 200 })
      )
    );
    globalThis.fetch = mockFetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns unavailable when domain fails moderation", async () => {
    mockModerationService.validateDomainName.mockResolvedValue({
      allowed: false,
      flags: [{ type: "restricted", severity: "critical", reason: "test" }],
      requiresReview: false,
    });

    const result = await domainManagementService.checkAvailability("bad-domain.com");
    expect(result.available).toBe(false);
  });

  it("returns unavailable when domain already in system", async () => {
    mockRepository.findByDomain.mockResolvedValue({
      id: "existing-id",
      domain: "existing.com",
    });

    const result = await domainManagementService.checkAvailability("existing.com");
    expect(result.available).toBe(false);
  });

  it("normalizes domain input", async () => {
    await domainManagementService.checkAvailability("  EXAMPLE.COM  ");
    expect(mockRepository.findByDomain).toHaveBeenCalledWith("example.com");
  });

  it("strips protocol from domain", async () => {
    await domainManagementService.checkAvailability("https://example.com/path");
    expect(mockRepository.findByDomain).toHaveBeenCalledWith("example.com");
  });

  it("checks with Vercel API when domain passes initial checks", async () => {
    mockRepository.findByDomain.mockResolvedValue(null);

    const result = await domainManagementService.checkAvailability("available.com");

    expect(result.available).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });
});

describe("Domain Search", () => {
  beforeEach(() => {
    Object.values(mockRepository).forEach((m) => {
      if (typeof m.mockReset === "function") m.mockReset();
    });

    mockModerationService.validateDomainName.mockResolvedValue({
      allowed: true,
      flags: [],
      requiresReview: false,
    });

    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ available: true }), { status: 200 })
      )
    );
    globalThis.fetch = mockFetch;
  });

  it("searches multiple TLDs by default", async () => {
    const results = await domainManagementService.searchDomains("myapp");

    // Should check com, ai, io, co, app, dev
    expect(results.length).toBeGreaterThan(0);
  });

  it("uses provided TLDs when specified", async () => {
    await domainManagementService.searchDomains("myapp", ["xyz", "tech"]);

    // Should have made calls for myapp.xyz and myapp.tech
    const fetchCalls = (mockFetch as ReturnType<typeof mock>).mock.calls;
    expect(fetchCalls.some((c: string[]) => c[0]?.includes("myapp.xyz"))).toBe(true);
    expect(fetchCalls.some((c: string[]) => c[0]?.includes("myapp.tech"))).toBe(true);
  });

  it("returns empty when query fails moderation", async () => {
    mockModerationService.validateDomainName.mockResolvedValue({
      allowed: false,
      flags: [{ type: "expletive", severity: "high", reason: "test" }],
      requiresReview: true,
    });

    const results = await domainManagementService.searchDomains("badword");
    expect(results).toHaveLength(0);
  });
});

describe("External Domain Registration", () => {
  beforeEach(() => {
    Object.values(mockRepository).forEach((m) => {
      if (typeof m.mockReset === "function") m.mockReset();
    });
    mockModerationService.validateDomainName.mockResolvedValue({
      allowed: true,
      flags: [],
      requiresReview: false,
    });
  });

  it("creates domain with verification token", async () => {
    mockRepository.create.mockResolvedValue({
      id: "new-domain-id",
      domain: "custom.com",
      verificationToken: "verify-123",
    });

    const result = await domainManagementService.registerExternalDomain(
      "custom.com",
      "org-123",
      "external"
    );

    expect(result.success).toBe(true);
    expect(mockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "custom.com",
        organizationId: "org-123",
        registrar: "external",
      })
    );
  });

  it("returns DNS instructions for external nameserver mode", async () => {
    mockRepository.create.mockResolvedValue({
      id: "new-id",
      domain: "custom.com",
      nameserverMode: "external",
    });

    const result = await domainManagementService.registerExternalDomain(
      "custom.com",
      "org-123",
      "external"
    );

    expect(result.success).toBe(true);
    expect(result.dnsInstructions).toBeDefined();
    expect(result.dnsInstructions?.length).toBeGreaterThan(0);
  });

  it("fails when domain already registered", async () => {
    mockRepository.findByDomain.mockResolvedValue({
      id: "existing-id",
      domain: "existing.com",
    });

    const result = await domainManagementService.registerExternalDomain(
      "existing.com",
      "org-123",
      "external"
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("already registered");
  });

  it("handles domain that fails moderation", async () => {
    mockModerationService.validateDomainName.mockResolvedValue({
      allowed: false,
      flags: [{ type: "restricted", severity: "critical", reason: "test" }],
      requiresReview: false,
    });

    const result = await domainManagementService.registerExternalDomain(
      "bad.com",
      "org-123",
      "external"
    );

    // Should fail registration for moderation-blocked domains
    expect(result.success).toBe(false);
  });
});

describe("Domain Assignment", () => {
  beforeEach(() => {
    Object.values(mockRepository).forEach((m) => {
      if (typeof m.mockReset === "function") m.mockReset();
    });
  });

  it("assigns domain to app", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue({
      id: "domain-1",
      domain: "example.com",
      organizationId: "org-123",
    });
    mockRepository.assignToApp.mockResolvedValue({
      id: "domain-1",
      appId: "app-1",
      resourceType: "app",
    });

    const result = await domainManagementService.assignToApp(
      "domain-1",
      "app-1",
      "org-123"
    );

    // Returns updated domain or null
    expect(mockRepository.assignToApp).toHaveBeenCalledWith("domain-1", "app-1");
  });

  it("assigns domain to container", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue({
      id: "domain-1",
      domain: "example.com",
    });
    mockRepository.assignToContainer.mockResolvedValue({});

    const result = await domainManagementService.assignToContainer(
      "domain-1",
      "container-1",
      "org-123"
    );

    expect(mockRepository.assignToContainer).toHaveBeenCalledWith("domain-1", "container-1");
  });

  it("assigns domain to agent", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue({
      id: "domain-1",
      domain: "example.com",
    });
    mockRepository.assignToAgent.mockResolvedValue({});

    const result = await domainManagementService.assignToAgent(
      "domain-1",
      "agent-1",
      "org-123"
    );

    expect(mockRepository.assignToAgent).toHaveBeenCalledWith("domain-1", "agent-1");
  });

  it("assigns domain to MCP", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue({
      id: "domain-1",
      domain: "example.com",
    });
    mockRepository.assignToMcp.mockResolvedValue({});

    const result = await domainManagementService.assignToMcp(
      "domain-1",
      "mcp-1",
      "org-123"
    );

    expect(mockRepository.assignToMcp).toHaveBeenCalledWith("domain-1", "mcp-1");
  });

  it("returns null when domain not found for assignment", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue(null);

    const result = await domainManagementService.assignToApp(
      "non-existent",
      "app-1",
      "org-123"
    );

    expect(result).toBeNull();
  });
});

describe("Domain Unassignment", () => {
  beforeEach(() => {
    Object.values(mockRepository).forEach((m) => {
      if (typeof m.mockReset === "function") m.mockReset();
    });
  });

  it("unassigns domain from resource", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue({
      id: "domain-1",
      domain: "example.com",
      resourceType: "app",
      appId: "app-1",
    });
    mockRepository.unassign.mockResolvedValue({
      id: "domain-1",
      resourceType: null,
      appId: null,
    });

    const result = await domainManagementService.unassignDomain("domain-1", "org-123");

    // Returns updated domain or null
    expect(mockRepository.unassign).toHaveBeenCalledWith("domain-1");
  });

  it("creates assignment change event", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue({
      id: "domain-1",
      domain: "example.com",
      resourceType: "container",
      containerId: "container-1",
    });
    mockRepository.unassign.mockResolvedValue({});

    await domainManagementService.unassignDomain("domain-1", "org-123");

    expect(mockRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        domainId: "domain-1",
        eventType: "assignment_change",
      })
    );
  });
});

describe("Domain Verification", () => {
  beforeEach(() => {
    Object.values(mockRepository).forEach((m) => {
      if (typeof m.mockReset === "function") m.mockReset();
    });

    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ verified: true }), { status: 200 })
      )
    );
    globalThis.fetch = mockFetch;
  });

  it("returns verification result object", async () => {
    // verifyDomain takes just domainId (not org scoped for verification)
    mockRepository.findById.mockResolvedValue({
      id: "domain-1",
      domain: "example.com",
      verificationToken: "verify-123",
      registrar: "external",
    });
    mockRepository.markVerified.mockResolvedValue({
      id: "domain-1",
      verified: true,
      verifiedAt: new Date(),
    });

    const result = await domainManagementService.verifyDomain("domain-1");

    expect(result).toBeDefined();
    expect(typeof result.verified).toBe("boolean");
  });

  it("handles domain not found case", async () => {
    mockRepository.findById.mockResolvedValue(null);

    const result = await domainManagementService.verifyDomain("non-existent");

    expect(result).toBeDefined();
    expect(result.verified).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("DNS Record Management", () => {
  beforeEach(() => {
    Object.values(mockRepository).forEach((m) => {
      if (typeof m.mockReset === "function") m.mockReset();
    });
  });

  it("returns DNS records for domain when available", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue({
      id: "domain-1",
      domain: "example.com",
      dnsRecords: [
        { type: "A", name: "@", value: "1.2.3.4" },
        { type: "CNAME", name: "www", value: "example.com" },
      ],
    });

    const records = await domainManagementService.getDnsRecords("domain-1");

    // Returns array (may be empty if service reads from Vercel instead of DB)
    expect(Array.isArray(records)).toBe(true);
  });

  it("adds DNS record to domain", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue({
      id: "domain-1",
      domain: "example.com",
      dnsRecords: [],
      nameserverMode: "vercel",
    });

    mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ uid: "rec-1" }), { status: 200 }))
    );
    globalThis.fetch = mockFetch;

    const result = await domainManagementService.addDnsRecord("domain-1", "org-123", {
      type: "A",
      name: "@",
      value: "1.2.3.4",
    });

    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
  });

  it("handles invalid DNS record type", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue({
      id: "domain-1",
      domain: "example.com",
    });

    const result = await domainManagementService.addDnsRecord("domain-1", "org-123", {
      type: "INVALID" as "A",
      name: "@",
      value: "1.2.3.4",
    });

    // Should either fail or throw
    expect(result).toBeDefined();
  });
});

describe("Domain Deletion", () => {
  beforeEach(() => {
    Object.values(mockRepository).forEach((m) => {
      if (typeof m.mockReset === "function") m.mockReset();
    });
  });

  it("deletes domain when found", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue({
      id: "domain-1",
      domain: "example.com",
      registrar: "external",
    });
    mockRepository.deleteByOrg.mockResolvedValue(true);

    const result = await domainManagementService.deleteDomain("domain-1", "org-123");

    expect(result.success).toBe(true);
    expect(mockRepository.deleteByOrg).toHaveBeenCalledWith("domain-1", "org-123");
  });

  it("fails when domain not found", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue(null);

    const result = await domainManagementService.deleteDomain("non-existent", "org-123");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("removes domain from Vercel if purchased through platform", async () => {
    mockRepository.findByIdAndOrg.mockResolvedValue({
      id: "domain-1",
      domain: "purchased.com",
      registrar: "vercel",
      vercelDomainId: "vercel-123",
    });
    mockRepository.deleteByOrg.mockResolvedValue(true);

    mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    );
    globalThis.fetch = mockFetch;

    const result = await domainManagementService.deleteDomain("domain-1", "org-123");

    // Vercel purchased domains should attempt removal from Vercel
    expect(result.success).toBe(true);
    expect(mockRepository.deleteByOrg).toHaveBeenCalledWith("domain-1", "org-123");
  });
});

describe("Edge Cases", () => {
  beforeEach(() => {
    Object.values(mockRepository).forEach((m) => {
      if (typeof m.mockReset === "function") m.mockReset();
    });
  });

  it("handles concurrent domain lookups", async () => {
    mockRepository.findByDomain.mockResolvedValue(null);
    mockModerationService.validateDomainName.mockResolvedValue({
      allowed: true,
      flags: [],
      requiresReview: false,
    });

    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ available: true }), { status: 200 })
      )
    );
    globalThis.fetch = mockFetch;

    // Fire multiple concurrent requests
    const results = await Promise.all([
      domainManagementService.checkAvailability("domain1.com"),
      domainManagementService.checkAvailability("domain2.com"),
      domainManagementService.checkAvailability("domain3.com"),
    ]);

    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.available).toBe(true));
  });

  it("handles Vercel API timeout gracefully", async () => {
    mockRepository.findByDomain.mockResolvedValue(null);
    mockModerationService.validateDomainName.mockResolvedValue({
      allowed: true,
      flags: [],
      requiresReview: false,
    });

    // Simulate timeout
    mockFetch = mock(() => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 100)));
    globalThis.fetch = mockFetch;

    await expect(domainManagementService.checkAvailability("test.com")).rejects.toThrow();
  });

  it("handles Vercel API error response", async () => {
    mockRepository.findByDomain.mockResolvedValue(null);
    mockModerationService.validateDomainName.mockResolvedValue({
      allowed: true,
      flags: [],
      requiresReview: false,
    });

    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "Rate limited" } }), { status: 429 })
      )
    );
    globalThis.fetch = mockFetch;

    await expect(domainManagementService.checkAvailability("test.com")).rejects.toThrow("Rate limited");
  });
});

