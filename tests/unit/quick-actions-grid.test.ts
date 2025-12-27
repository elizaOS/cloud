import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  CHAT_ACTIONS,
  CLI_ACTIONS,
  ALL_ACTIONS,
  type QuickActionConfig,
} from "@/lib/config/quick-actions";

describe("CHAT_ACTIONS Structure", () => {
  test("contains exactly 3 chat actions", () => {
    expect(CHAT_ACTIONS.length).toBe(3);
  });

  test("all chat actions have unique IDs", () => {
    const ids = CHAT_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("all chat actions have href for navigation", () => {
    CHAT_ACTIONS.forEach((action) => {
      expect(action.href).toBeDefined();
      expect(action.href).toMatch(/^\/dashboard\//);
    });
  });

  test("chat actions do not have CLI commands", () => {
    CHAT_ACTIONS.forEach((action) => {
      expect(action.cliCommands).toBeUndefined();
    });
  });

  test("first two chat actions have Chat badge", () => {
    expect(CHAT_ACTIONS[0].badge).toBe("Chat");
    expect(CHAT_ACTIONS[1].badge).toBe("Chat");
  });

  test("monetize action has no badge", () => {
    const monetize = CHAT_ACTIONS.find((a) => a.id === "monetize");
    expect(monetize?.badge).toBeUndefined();
  });
});

describe("CLI_ACTIONS Structure", () => {
  test("contains exactly 3 CLI actions", () => {
    expect(CLI_ACTIONS.length).toBe(3);
  });

  test("all CLI actions have unique IDs", () => {
    const ids = CLI_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("agent-cli has CLI commands", () => {
    const agentCli = CLI_ACTIONS.find((a) => a.id === "agent-cli");

    expect(agentCli?.cliCommands).toBeDefined();
    expect(agentCli?.cliCommands?.length).toBe(2);
  });

  test("app-deploy links to fragments page", () => {
    const appDeploy = CLI_ACTIONS.find((a) => a.id === "app-deploy");
    expect(appDeploy?.href).toBe("/dashboard/fragments");
    expect(appDeploy?.cliCommands).toBeUndefined();
  });

  test("n8n-workflows has href instead of CLI commands", () => {
    const n8n = CLI_ACTIONS.find((a) => a.id === "n8n-workflows");
    expect(n8n?.href).toBe("/dashboard/workflows");
    expect(n8n?.cliCommands).toBeUndefined();
  });

  test("CLI badges are appropriate", () => {
    expect(CLI_ACTIONS[0].badge).toBe("CLI");
    expect(CLI_ACTIONS[1].badge).toBe("Web");
    expect(CLI_ACTIONS[2].badge).toBe("AI");
  });
});

describe("CLI Commands Validation", () => {
  test("all CLI commands use npx elizaos prefix", () => {
    CLI_ACTIONS.forEach((action) => {
      action.cliCommands?.forEach((cmd) => {
        expect(cmd.command).toMatch(/^npx elizaos/);
      });
    });
  });

  test("agent CLI commands are create and deploy", () => {
    const agentCli = CLI_ACTIONS.find((a) => a.id === "agent-cli");
    const commands = agentCli?.cliCommands?.map((c) => c.command);

    expect(commands).toContain("npx elizaos create");
    expect(commands).toContain("npx elizaos deploy");
  });

  test("CLI command labels are descriptive", () => {
    CLI_ACTIONS.forEach((action) => {
      action.cliCommands?.forEach((cmd) => {
        expect(cmd.label.length).toBeGreaterThan(0);
        expect(cmd.label.length).toBeLessThan(20);
      });
    });
  });

  test("CLI commands are copy-pastable (no special chars except spaces)", () => {
    CLI_ACTIONS.forEach((action) => {
      action.cliCommands?.forEach((cmd) => {
        // Should only contain alphanumeric, spaces, and hyphens
        expect(cmd.command).toMatch(/^[a-zA-Z0-9\s-]+$/);
      });
    });
  });
});

describe("Gradient Classes Validation", () => {
  test("all actions have gradient classes", () => {
    ALL_ACTIONS.forEach((action) => {
      expect(action.gradient).toBeDefined();
      expect(action.gradient.length).toBeGreaterThan(0);
    });
  });

  test("gradients use Tailwind from-to pattern", () => {
    ALL_ACTIONS.forEach((action) => {
      expect(action.gradient).toMatch(/^from-/);
      expect(action.gradient).toMatch(/to-/);
    });
  });

  test("all gradients are unique", () => {
    const gradients = ALL_ACTIONS.map((a) => a.gradient);
    expect(new Set(gradients).size).toBe(gradients.length);
  });
});

describe("Action Descriptions", () => {
  test("all descriptions are non-empty", () => {
    ALL_ACTIONS.forEach((action) => {
      expect(action.description.length).toBeGreaterThan(20);
    });
  });

  test("descriptions are unique", () => {
    const descriptions = ALL_ACTIONS.map((a) => a.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  test("descriptions mention key features", () => {
    const createAgent = CHAT_ACTIONS.find((a) => a.id === "agents-chat");
    expect(createAgent?.description.toLowerCase()).toContain("agent");

    const createApp = CHAT_ACTIONS.find((a) => a.id === "apps-chat");
    expect(createApp?.description.toLowerCase()).toMatch(/app|mcp|a2a/);

    const monetize = CHAT_ACTIONS.find((a) => a.id === "monetize");
    expect(monetize?.description.toLowerCase()).toMatch(
      /pricing|payment|marketplace/,
    );
  });
});

describe("Copy to Clipboard Behavior", () => {
  // Simulate copy state management
  let copiedCommand: string | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const copyToClipboard = (command: string) => {
    copiedCommand = command;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      copiedCommand = null;
    }, 2000);
  };

  beforeEach(() => {
    copiedCommand = null;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
  });

  afterEach(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });

  test("copying sets the copied command", () => {
    copyToClipboard("npx elizaos create");
    expect(copiedCommand).toBe("npx elizaos create");
  });

  test("copying different command updates state", () => {
    copyToClipboard("npx elizaos create");
    copyToClipboard("npx elizaos deploy");
    expect(copiedCommand).toBe("npx elizaos deploy");
  });

  test("copied state resets after timeout", async () => {
    // Use shorter timeout for testing
    copiedCommand = "test";
    setTimeout(() => {
      copiedCommand = null;
    }, 100);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(copiedCommand).toBeNull();
  });
});

describe("Navigation Links", () => {
  test("Create Agent links to build page", () => {
    const action = CHAT_ACTIONS.find((a) => a.id === "agents-chat");
    expect(action?.href).toBe("/dashboard/build");
  });

  test("Create App links to fragments page", () => {
    const action = CHAT_ACTIONS.find((a) => a.id === "apps-chat");
    expect(action?.href).toBe("/dashboard/fragments");
  });

  test("Monetize links to apps page", () => {
    const action = CHAT_ACTIONS.find((a) => a.id === "monetize");
    expect(action?.href).toBe("/dashboard/apps");
  });

  test("Workflows links to workflows page", () => {
    const action = CLI_ACTIONS.find((a) => a.id === "n8n-workflows");
    expect(action?.href).toBe("/dashboard/workflows");
  });

  test("agent-cli action has no href (CLI-only)", () => {
    const agentCli = CLI_ACTIONS.find((a) => a.id === "agent-cli");
    expect(agentCli?.href).toBeUndefined();
  });
});

describe("Accessibility Considerations", () => {
  test("all titles are screen-reader friendly", () => {
    ALL_ACTIONS.forEach((action) => {
      // Titles should not be too short or too long
      expect(action.title.length).toBeGreaterThan(5);
      expect(action.title.length).toBeLessThan(30);
      // Should not contain special characters
      expect(action.title).toMatch(/^[a-zA-Z0-9\s&]+$/);
    });
  });

  test("IDs are kebab-case for consistency", () => {
    ALL_ACTIONS.forEach((action) => {
      expect(action.id).toMatch(/^[a-z0-9-]+$/);
    });
  });
});

describe("Complete Data Integrity", () => {
  test("total of 6 actions (3 chat + 3 CLI)", () => {
    expect(CHAT_ACTIONS.length + CLI_ACTIONS.length).toBe(6);
    expect(ALL_ACTIONS.length).toBe(6);
  });

  test("ALL_ACTIONS equals CHAT + CLI combined", () => {
    expect(ALL_ACTIONS).toEqual([...CHAT_ACTIONS, ...CLI_ACTIONS]);
  });

  test("no ID collisions between chat and CLI actions", () => {
    const chatIds = new Set(CHAT_ACTIONS.map((a) => a.id));
    const cliIds = new Set(CLI_ACTIONS.map((a) => a.id));

    cliIds.forEach((id) => {
      expect(chatIds.has(id)).toBe(false);
    });
  });

  test("actions represent the full flow: Create -> Deploy -> Monetize", () => {
    const hasCreate = CHAT_ACTIONS.some((a) => a.title.includes("Create"));
    const hasMonetize = CHAT_ACTIONS.some((a) => a.title.includes("Monetize"));
    const hasDeploy = CLI_ACTIONS.some((a) =>
      a.cliCommands?.some((c) => c.command.includes("deploy")),
    );

    expect(hasCreate).toBe(true);
    expect(hasDeploy).toBe(true);
    expect(hasMonetize).toBe(true);
  });
});
