/**
 * E2E Tests for Org Agents Integration with Cloud Runtime
 *
 * Tests that org characters (Jimmy, Eli5, Eddy, Ruby, Laura) can be loaded
 * by the cloud's Eliza runtime and have access to org-tools MCP.
 */

import { describe, test, expect } from "bun:test";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import {
  ORG_CHARACTER_IDS,
  isOrgCharacter,
  getOrgCharacter,
  projectManagerCharacter,
  communityManagerCharacter,
  devRelCharacter,
  liaisonCharacter,
  socialMediaManagerCharacter,
} from "@/lib/eliza/characters/org";

describe("Org Characters Registry", () => {
  test("should export all org character IDs", () => {
    expect(ORG_CHARACTER_IDS).toContain("org-project-manager");
    expect(ORG_CHARACTER_IDS).toContain("org-community-manager");
    expect(ORG_CHARACTER_IDS).toContain("org-devrel");
    expect(ORG_CHARACTER_IDS).toContain("org-liaison");
    expect(ORG_CHARACTER_IDS).toContain("org-social-media-manager");
    expect(ORG_CHARACTER_IDS.length).toBeGreaterThanOrEqual(5);
  });

  test("should correctly identify org characters", () => {
    expect(isOrgCharacter("org-project-manager")).toBe(true);
    expect(isOrgCharacter("org-community-manager")).toBe(true);
    expect(isOrgCharacter("org-devrel")).toBe(true);
    expect(isOrgCharacter("org-liaison")).toBe(true);
    expect(isOrgCharacter("org-social-media-manager")).toBe(true);
    expect(isOrgCharacter("random-character")).toBe(false);
    expect(isOrgCharacter("user-custom-character")).toBe(false);
  });

  test("should return correct org character by ID", () => {
    const jimmy = getOrgCharacter("org-project-manager");
    expect(jimmy).toBeDefined();
    expect(jimmy?.name).toBe("Jimmy");

    const eli5 = getOrgCharacter("org-community-manager");
    expect(eli5).toBeDefined();
    expect(eli5?.name).toBe("Eli5");

    const eddy = getOrgCharacter("org-devrel");
    expect(eddy).toBeDefined();
    expect(eddy?.name).toBe("Eddy");

    const ruby = getOrgCharacter("org-liaison");
    expect(ruby).toBeDefined();
    expect(ruby?.name).toBe("Ruby");

    const laura = getOrgCharacter("org-social-media-manager");
    expect(laura).toBeDefined();
    expect(laura?.name).toBe("Laura");
  });

  test("should return null for non-org character", () => {
    expect(getOrgCharacter("random-id")).toBeNull();
  });
});

describe("Org Character Configurations", () => {
  describe("Project Manager (Jimmy)", () => {
    test("should have correct name and ID", () => {
      expect(projectManagerCharacter.name).toBe("Jimmy");
      expect(projectManagerCharacter.id).toBe("org-project-manager");
    });

    test("should include MCP plugin", () => {
      expect(projectManagerCharacter.plugins).toContain("@elizaos/plugin-mcp");
    });

    test("should have org-tools MCP configured", () => {
      const mcpSettings = projectManagerCharacter.settings?.mcp as {
        servers: { "org-tools": { url: string } };
      };
      expect(mcpSettings?.servers?.["org-tools"]).toBeDefined();
      expect(mcpSettings?.servers?.["org-tools"]?.url).toContain(
        "/api/mcp/org/sse",
      );
    });

    test("should have project management topics", () => {
      expect(projectManagerCharacter.topics).toContain("project management");
      expect(projectManagerCharacter.topics).toContain("team coordination");
      expect(projectManagerCharacter.topics).toContain(
        "check-ins and standups",
      );
    });

    test("should have avatar configured", () => {
      expect(projectManagerCharacter.settings?.avatar).toContain("Jimmy");
    });
  });

  describe("Community Manager (Eli5)", () => {
    test("should have correct name and ID", () => {
      expect(communityManagerCharacter.name).toBe("Eli5");
      expect(communityManagerCharacter.id).toBe("org-community-manager");
    });

    test("should include MCP plugin", () => {
      expect(communityManagerCharacter.plugins).toContain(
        "@elizaos/plugin-mcp",
      );
    });

    test("should have community management topics", () => {
      expect(communityManagerCharacter.topics).toContain(
        "community moderation",
      );
      expect(communityManagerCharacter.topics).toContain("role management");
    });

    test("should have friendly style", () => {
      expect(communityManagerCharacter.style?.all).toContainEqual(
        expect.stringMatching(/friendly|cheerful|positive/i),
      );
    });
  });

  describe("DevRel (Eddy)", () => {
    test("should have correct name and ID", () => {
      expect(devRelCharacter.name).toBe("Eddy");
      expect(devRelCharacter.id).toBe("org-devrel");
    });

    test("should include knowledge plugin", () => {
      expect(devRelCharacter.plugins).toContain("@elizaos/plugin-knowledge");
    });

    test("should include MCP plugin", () => {
      expect(devRelCharacter.plugins).toContain("@elizaos/plugin-mcp");
    });

    test("should have developer support topics", () => {
      expect(devRelCharacter.topics).toContain("ElizaOS framework");
      expect(devRelCharacter.topics).toContain("plugin architecture");
      expect(devRelCharacter.topics).toContain("MCP tools");
    });
  });

  describe("Liaison (Ruby)", () => {
    test("should have correct name and ID", () => {
      expect(liaisonCharacter.name).toBe("Ruby");
      expect(liaisonCharacter.id).toBe("org-liaison");
    });

    test("should include MCP plugin", () => {
      expect(liaisonCharacter.plugins).toContain("@elizaos/plugin-mcp");
    });

    test("should have cross-platform topics", () => {
      expect(liaisonCharacter.topics).toContain(
        "cross-platform community management",
      );
      expect(liaisonCharacter.topics).toContain("Discord activities");
      expect(liaisonCharacter.topics).toContain("Telegram discussions");
    });
  });

  describe("Social Media Manager (Laura)", () => {
    test("should have correct name and ID", () => {
      expect(socialMediaManagerCharacter.name).toBe("Laura");
      expect(socialMediaManagerCharacter.id).toBe("org-social-media-manager");
    });

    test("should include MCP plugin", () => {
      expect(socialMediaManagerCharacter.plugins).toContain(
        "@elizaos/plugin-mcp",
      );
    });

    test("should have Twitter post generation disabled by default", () => {
      expect(
        socialMediaManagerCharacter.settings?.TWITTER_ENABLE_POST_GENERATION,
      ).toBe(false);
    });

    test("should have marketing topics", () => {
      expect(socialMediaManagerCharacter.topics).toContain(
        "impactful messaging",
      );
      expect(socialMediaManagerCharacter.topics).toContain(
        "anti-hype marketing",
      );
    });

    test("should have post examples", () => {
      expect(socialMediaManagerCharacter.postExamples?.length).toBeGreaterThan(
        0,
      );
    });
  });
});

// Agent Loader tests require full runtime and are tested in integration tests
// These tests verify the org character definitions work without DB connection
describe("Org Characters - Agent Mode Configuration", () => {
  test("project manager should have ASSISTANT mode for MCP", () => {
    // Verify project manager has correct plugins that trigger ASSISTANT mode
    const plugins = projectManagerCharacter.plugins || [];
    expect(plugins.includes("@elizaos/plugin-mcp")).toBe(true);
  });

  test("community manager should have ASSISTANT mode for MCP", () => {
    const plugins = communityManagerCharacter.plugins || [];
    expect(plugins.includes("@elizaos/plugin-mcp")).toBe(true);
  });

  test("devrel should have ASSISTANT mode for MCP and knowledge", () => {
    const plugins = devRelCharacter.plugins || [];
    expect(plugins.includes("@elizaos/plugin-mcp")).toBe(true);
    // Eddy has knowledge plugin which triggers ASSISTANT mode
    expect(plugins.includes("@elizaos/plugin-knowledge")).toBe(true);
  });

  test("liaison should have ASSISTANT mode for MCP", () => {
    const plugins = liaisonCharacter.plugins || [];
    expect(plugins.includes("@elizaos/plugin-mcp")).toBe(true);
  });

  test("social media manager should have ASSISTANT mode for MCP", () => {
    const plugins = socialMediaManagerCharacter.plugins || [];
    expect(plugins.includes("@elizaos/plugin-mcp")).toBe(true);
  });
});

describe("Org Character MCP Integration", () => {
  test("all org characters should have org-tools MCP configured", () => {
    const characters = [
      projectManagerCharacter,
      communityManagerCharacter,
      devRelCharacter,
      liaisonCharacter,
      socialMediaManagerCharacter,
    ];

    for (const char of characters) {
      const mcpSettings = char.settings?.mcp as {
        servers: { "org-tools": { url: string; transport: string } };
      };

      expect(mcpSettings?.servers?.["org-tools"]).toBeDefined();
      expect(mcpSettings?.servers?.["org-tools"]?.url).toBe("/api/mcp/org/sse");
      expect(mcpSettings?.servers?.["org-tools"]?.transport).toBe("sse");
    }
  });

  test("MCP plugin should be in all org character plugins", () => {
    const characters = [
      projectManagerCharacter,
      communityManagerCharacter,
      devRelCharacter,
      liaisonCharacter,
      socialMediaManagerCharacter,
    ];

    for (const char of characters) {
      expect(char.plugins).toContain("@elizaos/plugin-mcp");
    }
  });
});
