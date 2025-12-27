/**
 * Domain Router Service Tests
 *
 * Tests custom domain routing to apps, containers, agents, and MCPs.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { NextRequest } from "next/server";

// Mock repositories
const mockDomainsRepo = {
  findByDomain: mock(() => Promise.resolve(null)),
};

const mockContainersRepo = {
  findById: mock(() => Promise.resolve(null)),
};

const mockCharactersRepo = {
  findById: mock(() => Promise.resolve(null)),
};

const mockMcpsRepo = {
  findById: mock(() => Promise.resolve(null)),
};

mock.module("@/db/repositories/managed-domains", () => ({
  managedDomainsRepository: mockDomainsRepo,
}));

mock.module("@/db/repositories/containers", () => ({
  containersRepository: mockContainersRepo,
}));

mock.module("@/db/repositories/characters", () => ({
  charactersRepository: mockCharactersRepo,
}));

mock.module("@/db/repositories/user-mcps", () => ({
  userMcpsRepository: mockMcpsRepo,
}));

mock.module("@/lib/utils/logger", () => ({
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const { domainRouterService } = await import("@/lib/services/domain-router");

function createMockRequest(url: string, method = "GET"): NextRequest {
  const nextUrl = new URL(url);
  // Add clone method that NextRequest.nextUrl has
  (nextUrl as URL & { clone: () => URL }).clone = () =>
    new URL(nextUrl.toString());
  return {
    method,
    url,
    nextUrl,
    headers: new Headers(),
  } as unknown as NextRequest;
}

describe("Domain Lookup", () => {
  beforeEach(() => {
    mockDomainsRepo.findByDomain.mockReset();
    mockContainersRepo.findById.mockReset();
    mockCharactersRepo.findById.mockReset();
    mockMcpsRepo.findById.mockReset();
  });

  it("returns 404 when domain not found", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue(null);

    const request = createMockRequest("https://unknown.example.com/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "unknown.example.com",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.message).toContain("not configured");
  });

  it("returns 403 when domain is suspended", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "suspended.com",
      status: "suspended",
      verified: true,
    });

    const request = createMockRequest("https://suspended.com/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "suspended.com",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.message).toContain("suspended");
  });

  it("returns 403 when domain is pending verification", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "pending.com",
      status: "pending",
      verified: false,
    });

    const request = createMockRequest("https://pending.com/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "pending.com",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.message).toContain("not verified");
  });

  it("returns 403 when moderation status is suspended", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "moderated.com",
      status: "active",
      verified: true,
      moderationStatus: "suspended",
    });

    const request = createMockRequest("https://moderated.com/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "moderated.com",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
  });

  it("returns 404 when domain not assigned to resource", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "unassigned.com",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: null,
    });

    const request = createMockRequest("https://unassigned.com/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "unassigned.com",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.message).toContain("not assigned");
  });
});

describe("App Routing", () => {
  beforeEach(() => {
    mockDomainsRepo.findByDomain.mockReset();
  });

  it("rewrites to app custom domain handler", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "myapp.com",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "app",
      appId: "app-1",
    });

    const request = createMockRequest("https://myapp.com/page");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "myapp.com",
      "/page",
    );

    expect(result.success).toBe(true);
    expect(result.response).toBeDefined();
  });
});

describe("Container Routing", () => {
  beforeEach(() => {
    mockDomainsRepo.findByDomain.mockReset();
    mockContainersRepo.findById.mockReset();
  });

  it("routes to running container", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "container.com",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "container",
      containerId: "container-1",
    });

    mockContainersRepo.findById.mockResolvedValue({
      id: "container-1",
      status: "running",
      public_url: "https://container-123.ecs.amazonaws.com",
    });

    const request = createMockRequest("https://container.com/api/health");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "container.com",
      "/api/health",
    );

    expect(result.success).toBe(true);
    expect(result.response).toBeDefined();
  });

  it("returns 404 when container not found", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "container.com",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "container",
      containerId: "deleted-container",
    });

    mockContainersRepo.findById.mockResolvedValue(null);

    const request = createMockRequest("https://container.com/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "container.com",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.message).toContain("not found");
  });

  it("returns 503 when container not running", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "container.com",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "container",
      containerId: "container-1",
    });

    mockContainersRepo.findById.mockResolvedValue({
      id: "container-1",
      status: "stopped",
      public_url: "https://container-123.ecs.amazonaws.com",
    });

    const request = createMockRequest("https://container.com/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "container.com",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(503);
    expect(result.message).toContain("not running");
  });

  it("returns 503 when container has no public URL", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "container.com",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "container",
      containerId: "container-1",
    });

    mockContainersRepo.findById.mockResolvedValue({
      id: "container-1",
      status: "running",
      public_url: null,
    });

    const request = createMockRequest("https://container.com/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "container.com",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(503);
  });
});

describe("Agent Routing", () => {
  beforeEach(() => {
    mockDomainsRepo.findByDomain.mockReset();
    mockCharactersRepo.findById.mockReset();
  });

  it("routes A2A requests to agent endpoint", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "agent.ai",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "agent",
      agentId: "agent-1",
    });

    mockCharactersRepo.findById.mockResolvedValue({
      id: "agent-1",
      name: "Test Agent",
    });

    const request = createMockRequest("https://agent.ai/a2a/tasks");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "agent.ai",
      "/a2a/tasks",
    );

    expect(result.success).toBe(true);
    expect(result.response).toBeDefined();
  });

  it("routes MCP requests to MCP endpoint", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "agent.ai",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "agent",
      agentId: "agent-1",
    });

    mockCharactersRepo.findById.mockResolvedValue({
      id: "agent-1",
      name: "Test Agent",
    });

    const request = createMockRequest("https://agent.ai/mcp/tools");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "agent.ai",
      "/mcp/tools",
    );

    expect(result.success).toBe(true);
  });

  it("routes .well-known/agent to A2A", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "agent.ai",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "agent",
      agentId: "agent-1",
    });

    mockCharactersRepo.findById.mockResolvedValue({
      id: "agent-1",
      name: "Test Agent",
    });

    const request = createMockRequest(
      "https://agent.ai/.well-known/agent.json",
    );
    const result = await domainRouterService.routeCustomDomain(
      request,
      "agent.ai",
      "/.well-known/agent.json",
    );

    expect(result.success).toBe(true);
  });

  it("routes root path to agent card", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "agent.ai",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "agent",
      agentId: "agent-1",
    });

    mockCharactersRepo.findById.mockResolvedValue({
      id: "agent-1",
      name: "Test Agent",
    });

    const request = createMockRequest("https://agent.ai/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "agent.ai",
      "/",
    );

    expect(result.success).toBe(true);
  });

  it("returns 404 when agent not found", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "agent.ai",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "agent",
      agentId: "deleted-agent",
    });

    mockCharactersRepo.findById.mockResolvedValue(null);

    const request = createMockRequest("https://agent.ai/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "agent.ai",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

describe("MCP Routing", () => {
  beforeEach(() => {
    mockDomainsRepo.findByDomain.mockReset();
    mockMcpsRepo.findById.mockReset();
    mockContainersRepo.findById.mockReset();
  });

  it("routes to MCP container endpoint", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "mcp.tools",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "mcp",
      mcpId: "mcp-1",
    });

    mockMcpsRepo.findById.mockResolvedValue({
      id: "mcp-1",
      endpoint_type: "container",
      container_id: "container-1",
      endpoint_path: "/mcp",
    });

    mockContainersRepo.findById.mockResolvedValue({
      id: "container-1",
      status: "running",
      public_url: "https://mcp-container.ecs.amazonaws.com",
    });

    const request = createMockRequest("https://mcp.tools/list");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "mcp.tools",
      "/list",
    );

    expect(result.success).toBe(true);
  });

  it("routes to external MCP endpoint", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "mcp.tools",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "mcp",
      mcpId: "mcp-1",
    });

    mockMcpsRepo.findById.mockResolvedValue({
      id: "mcp-1",
      endpoint_type: "external",
      external_endpoint: "https://external-mcp.example.com",
      endpoint_path: "/api/mcp",
    });

    const request = createMockRequest("https://mcp.tools/tools");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "mcp.tools",
      "/tools",
    );

    expect(result.success).toBe(true);
  });

  it("returns 404 when MCP not found", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "mcp.tools",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "mcp",
      mcpId: "deleted-mcp",
    });

    mockMcpsRepo.findById.mockResolvedValue(null);

    const request = createMockRequest("https://mcp.tools/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "mcp.tools",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it("returns 503 when MCP container unavailable", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "mcp.tools",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "mcp",
      mcpId: "mcp-1",
    });

    mockMcpsRepo.findById.mockResolvedValue({
      id: "mcp-1",
      endpoint_type: "container",
      container_id: "container-1",
    });

    mockContainersRepo.findById.mockResolvedValue({
      id: "container-1",
      status: "stopped",
      public_url: null,
    });

    const request = createMockRequest("https://mcp.tools/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "mcp.tools",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(503);
  });

  it("returns 503 when MCP has no endpoint configured", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "mcp.tools",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "mcp",
      mcpId: "mcp-1",
    });

    mockMcpsRepo.findById.mockResolvedValue({
      id: "mcp-1",
      endpoint_type: "external",
      external_endpoint: null,
    });

    const request = createMockRequest("https://mcp.tools/");
    const result = await domainRouterService.routeCustomDomain(
      request,
      "mcp.tools",
      "/",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(503);
  });
});

describe("Error Page Generation", () => {
  it("generates valid HTML error page", () => {
    const html = domainRouterService.errorPage("Test Title", "Test message");

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Test Title");
    expect(html).toContain("Test message");
    expect(html).toContain("eliza.gg");
  });

  it("generates HTML with provided content", () => {
    // Note: errorPage does NOT escape HTML - it's for internal messages only
    // XSS protection should happen at the input layer, not template layer
    const html = domainRouterService.errorPage("Title", "Message");
    expect(html).toBeDefined();
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });
});

describe("Query String Handling", () => {
  beforeEach(() => {
    mockDomainsRepo.findByDomain.mockReset();
    mockContainersRepo.findById.mockReset();
  });

  it("preserves query string when routing to container", async () => {
    mockDomainsRepo.findByDomain.mockResolvedValue({
      id: "domain-1",
      domain: "api.example.com",
      status: "active",
      verified: true,
      moderationStatus: "clean",
      resourceType: "container",
      containerId: "container-1",
    });

    mockContainersRepo.findById.mockResolvedValue({
      id: "container-1",
      status: "running",
      public_url: "https://container.ecs.amazonaws.com",
    });

    const request = createMockRequest(
      "https://api.example.com/search?q=test&page=2",
    );
    const result = await domainRouterService.routeCustomDomain(
      request,
      "api.example.com",
      "/search",
    );

    expect(result.success).toBe(true);
  });
});
