import { describe, test, expect } from "bun:test";
import {
  projectManagerCharacter,
  communityManagerCharacter,
  devRelCharacter,
  liaisonCharacter,
  socialMediaManagerCharacter,
} from "../../../lib/eliza/characters/org/index";

type McpSettings = {
  servers?: Record<string, { url: string; transport: string }>;
};

describe("Org Agent MCP Tool Verification", () => {
  describe("Jimmy (Project Manager)", () => {
    const char = projectManagerCharacter;

    test("should have org-tools MCP configured", () => {
      const mcp = char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.["org-tools"]).toBeDefined();
      expect(mcp?.servers?.["org-tools"]?.url).toBe("/api/mcp/org/sse");
    });

    test("should have credentials MCP configured", () => {
      const mcp = char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.credentials).toBeDefined();
      expect(mcp?.servers?.credentials?.url).toBe("/api/mcp/credentials/sse");
    });

    test("system prompt should document todo management", () => {
      const system = char.system || "";
      expect(system.toLowerCase()).toContain("todo");
    });

    test("system prompt should document check-in functionality", () => {
      const system = char.system || "";
      expect(system.toLowerCase()).toContain("check");
    });

    test("system prompt should document team tools", () => {
      const system = char.system || "";
      expect(system.toLowerCase()).toContain("team");
    });
  });

  describe("Eli5 (Community Manager)", () => {
    const char = communityManagerCharacter;

    test("should have org-tools MCP configured", () => {
      const mcp = char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.["org-tools"]).toBeDefined();
      expect(mcp?.servers?.["org-tools"]?.url).toBe("/api/mcp/org/sse");
    });

    test("should have credentials MCP configured", () => {
      const mcp = char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.credentials).toBeDefined();
    });
  });

  describe("Eddy (DevRel)", () => {
    const char = devRelCharacter;

    test("should have org-tools MCP configured", () => {
      const mcp = char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.["org-tools"]).toBeDefined();
      expect(mcp?.servers?.["org-tools"]?.url).toBe("/api/mcp/org/sse");
    });

    test("should have credentials MCP configured", () => {
      const mcp = char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.credentials).toBeDefined();
    });
  });

  describe("Ruby (Liaison)", () => {
    const char = liaisonCharacter;

    test("should have org-tools MCP configured", () => {
      const mcp = char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.["org-tools"]).toBeDefined();
      expect(mcp?.servers?.["org-tools"]?.url).toBe("/api/mcp/org/sse");
    });

    test("should have credentials MCP configured", () => {
      const mcp = char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.credentials).toBeDefined();
    });
  });

  describe("Laura (Social Media Manager)", () => {
    const char = socialMediaManagerCharacter;

    test("should have org-tools MCP configured", () => {
      const mcp = char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.["org-tools"]).toBeDefined();
      expect(mcp?.servers?.["org-tools"]?.url).toBe("/api/mcp/org/sse");
    });

    test("should have credentials MCP configured", () => {
      const mcp = char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.credentials).toBeDefined();
    });
  });
});

describe("MCP Endpoint Availability", () => {
  const mcpEndpoints = [
    { name: "org-tools", path: "/api/mcp/org/sse" },
    { name: "credentials", path: "/api/mcp/credentials/sse" },
  ];

  for (const endpoint of mcpEndpoints) {
    test(`${endpoint.name} endpoint path should be valid format`, () => {
      expect(endpoint.path).toMatch(/^\/api\/mcp\/[a-z-]+\/sse$/);
    });
  }
});

describe("All Agents Have Required MCPs", () => {
  const agents = [
    { name: "Jimmy", char: projectManagerCharacter },
    { name: "Eli5", char: communityManagerCharacter },
    { name: "Eddy", char: devRelCharacter },
    { name: "Ruby", char: liaisonCharacter },
    { name: "Laura", char: socialMediaManagerCharacter },
  ];

  for (const agent of agents) {
    test(`${agent.name} should have credentials MCP for OAuth`, () => {
      const mcp = agent.char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.credentials).toBeDefined();
      expect(mcp?.servers?.credentials?.url).toBe("/api/mcp/credentials/sse");
    });

    test(`${agent.name} should have org-tools for team functionality`, () => {
      const mcp = agent.char.settings?.mcp as McpSettings;
      expect(mcp?.servers?.["org-tools"]).toBeDefined();
    });

    test(`${agent.name} should include @elizaos/plugin-mcp`, () => {
      expect(agent.char.plugins).toContain("@elizaos/plugin-mcp");
    });

    test(`${agent.name} should include database plugin`, () => {
      expect(agent.char.plugins).toContain("@elizaos/plugin-sql");
    });
  }
});
