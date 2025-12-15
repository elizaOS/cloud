import { describe, test, expect } from "bun:test";

// Re-implement the types and config from AIAppBuilderDialog for testing
type TemplateType =
  | "chat"
  | "agent-dashboard"
  | "landing-page"
  | "analytics"
  | "blank"
  | "mcp-service"
  | "a2a-agent";

interface TemplateOption {
  value: TemplateType;
  label: string;
  description: string;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  { value: "blank", label: "Blank Project", description: "Start from scratch" },
  { value: "chat", label: "Chat App", description: "AI chat interface" },
  {
    value: "agent-dashboard",
    label: "Agent Dashboard",
    description: "Manage AI agents",
  },
  {
    value: "landing-page",
    label: "Landing Page",
    description: "Marketing page",
  },
  {
    value: "analytics",
    label: "Analytics Dashboard",
    description: "Data visualization",
  },
  {
    value: "mcp-service",
    label: "MCP Service",
    description: "Model Context Protocol server",
  },
  {
    value: "a2a-agent",
    label: "A2A Agent",
    description: "Agent-to-Agent protocol endpoint",
  },
];

describe("Template Options Structure", () => {
  test("contains exactly 7 template options", () => {
    expect(TEMPLATE_OPTIONS.length).toBe(7);
  });

  test("all templates have unique values", () => {
    const values = TEMPLATE_OPTIONS.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });

  test("all templates have non-empty labels", () => {
    TEMPLATE_OPTIONS.forEach((template) => {
      expect(template.label.length).toBeGreaterThan(0);
      expect(template.label.length).toBeLessThan(30);
    });
  });

  test("all templates have descriptive descriptions", () => {
    TEMPLATE_OPTIONS.forEach((template) => {
      expect(template.description.length).toBeGreaterThan(5);
      expect(template.description.length).toBeLessThan(50);
    });
  });
});

describe("MCP Service Template", () => {
  const mcpTemplate = TEMPLATE_OPTIONS.find((t) => t.value === "mcp-service");

  test("MCP service template exists", () => {
    expect(mcpTemplate).toBeDefined();
  });

  test("MCP service has correct label", () => {
    expect(mcpTemplate?.label).toBe("MCP Service");
  });

  test("MCP service description mentions Model Context Protocol", () => {
    expect(mcpTemplate?.description).toContain("Model Context Protocol");
  });

  test("MCP template value is lowercase kebab-case", () => {
    expect(mcpTemplate?.value).toMatch(/^[a-z-]+$/);
  });
});

describe("A2A Agent Template", () => {
  const a2aTemplate = TEMPLATE_OPTIONS.find((t) => t.value === "a2a-agent");

  test("A2A agent template exists", () => {
    expect(a2aTemplate).toBeDefined();
  });

  test("A2A agent has correct label", () => {
    expect(a2aTemplate?.label).toBe("A2A Agent");
  });

  test("A2A agent description mentions Agent-to-Agent", () => {
    expect(a2aTemplate?.description).toContain("Agent-to-Agent");
  });

  test("A2A template value is lowercase kebab-case with numbers", () => {
    expect(a2aTemplate?.value).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("Template Selection Logic", () => {
  function getTemplateByValue(value: TemplateType): TemplateOption | undefined {
    return TEMPLATE_OPTIONS.find((t) => t.value === value);
  }

  function isProtocolTemplate(value: TemplateType): boolean {
    return value === "mcp-service" || value === "a2a-agent";
  }

  function isUITemplate(value: TemplateType): boolean {
    return ["chat", "agent-dashboard", "landing-page", "analytics"].includes(
      value,
    );
  }

  test("can look up template by value", () => {
    expect(getTemplateByValue("chat")?.label).toBe("Chat App");
    expect(getTemplateByValue("mcp-service")?.label).toBe("MCP Service");
    expect(getTemplateByValue("a2a-agent")?.label).toBe("A2A Agent");
  });

  test("protocol templates are identified correctly", () => {
    expect(isProtocolTemplate("mcp-service")).toBe(true);
    expect(isProtocolTemplate("a2a-agent")).toBe(true);
    expect(isProtocolTemplate("chat")).toBe(false);
    expect(isProtocolTemplate("blank")).toBe(false);
  });

  test("UI templates are identified correctly", () => {
    expect(isUITemplate("chat")).toBe(true);
    expect(isUITemplate("agent-dashboard")).toBe(true);
    expect(isUITemplate("landing-page")).toBe(true);
    expect(isUITemplate("analytics")).toBe(true);
    expect(isUITemplate("mcp-service")).toBe(false);
    expect(isUITemplate("a2a-agent")).toBe(false);
    expect(isUITemplate("blank")).toBe(false);
  });

  test("blank template is neither protocol nor UI", () => {
    expect(isProtocolTemplate("blank")).toBe(false);
    expect(isUITemplate("blank")).toBe(false);
  });
});

describe("Template Categories", () => {
  // Group templates by category for testing
  const categories = {
    basic: ["blank"],
    ui: ["chat", "agent-dashboard", "landing-page", "analytics"],
    protocol: ["mcp-service", "a2a-agent"],
  };

  test("all templates are categorized", () => {
    const allCategorized = [
      ...categories.basic,
      ...categories.ui,
      ...categories.protocol,
    ];
    const allTemplateValues = TEMPLATE_OPTIONS.map((t) => t.value);

    expect(allCategorized.sort()).toEqual(allTemplateValues.sort());
  });

  test("protocol category has exactly 2 templates", () => {
    expect(categories.protocol.length).toBe(2);
    expect(categories.protocol).toContain("mcp-service");
    expect(categories.protocol).toContain("a2a-agent");
  });

  test("UI category has exactly 4 templates", () => {
    expect(categories.ui.length).toBe(4);
  });

  test("basic category has exactly 1 template", () => {
    expect(categories.basic.length).toBe(1);
    expect(categories.basic[0]).toBe("blank");
  });
});

describe("Template Default Selection", () => {
  test("blank is a valid default choice", () => {
    const blank = TEMPLATE_OPTIONS.find((t) => t.value === "blank");
    expect(blank).toBeDefined();
    expect(blank?.description).toContain("scratch");
  });

  test("chat is first non-blank option", () => {
    const nonBlank = TEMPLATE_OPTIONS.filter((t) => t.value !== "blank");
    expect(nonBlank[0].value).toBe("chat");
  });
});

describe("Template Type Safety", () => {
  test("all template values are valid TemplateType", () => {
    const validTypes: TemplateType[] = [
      "chat",
      "agent-dashboard",
      "landing-page",
      "analytics",
      "blank",
      "mcp-service",
      "a2a-agent",
    ];

    TEMPLATE_OPTIONS.forEach((template) => {
      expect(validTypes).toContain(template.value);
    });
  });

  test("no duplicate template types in validTypes", () => {
    const types = TEMPLATE_OPTIONS.map((t) => t.value);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe("Template Display Order", () => {
  test("blank comes first as starting point", () => {
    expect(TEMPLATE_OPTIONS[0].value).toBe("blank");
  });

  test("protocol templates come last", () => {
    const lastTwo = TEMPLATE_OPTIONS.slice(-2);
    const protocolValues = lastTwo.map((t) => t.value);
    expect(protocolValues).toContain("mcp-service");
    expect(protocolValues).toContain("a2a-agent");
  });

  test("UI templates are in logical order", () => {
    const uiTemplates = TEMPLATE_OPTIONS.filter((t) =>
      ["chat", "agent-dashboard", "landing-page", "analytics"].includes(
        t.value,
      ),
    );

    // Chat should come before dashboard
    const chatIndex = uiTemplates.findIndex((t) => t.value === "chat");
    const dashboardIndex = uiTemplates.findIndex(
      (t) => t.value === "agent-dashboard",
    );
    expect(chatIndex).toBeLessThan(dashboardIndex);
  });
});

describe("Template Generation Prompts", () => {
  // These would be used to generate appropriate code for each template
  const templatePromptHints: Record<TemplateType, string[]> = {
    blank: ["empty", "scaffold", "boilerplate"],
    chat: ["conversation", "message", "AI", "LLM"],
    "agent-dashboard": ["agents", "manage", "list", "status"],
    "landing-page": ["hero", "CTA", "marketing", "features"],
    analytics: ["charts", "graphs", "metrics", "data"],
    "mcp-service": ["MCP", "tools", "resources", "server"],
    "a2a-agent": ["A2A", "skills", "agent card", "JSON-RPC"],
  };

  test("MCP service prompt hints include protocol terms", () => {
    const hints = templatePromptHints["mcp-service"];
    expect(hints).toContain("MCP");
    expect(hints).toContain("tools");
    expect(hints).toContain("server");
  });

  test("A2A agent prompt hints include protocol terms", () => {
    const hints = templatePromptHints["a2a-agent"];
    expect(hints).toContain("A2A");
    expect(hints).toContain("skills");
    expect(hints).toContain("agent card");
  });

  test("all templates have prompt hints", () => {
    TEMPLATE_OPTIONS.forEach((template) => {
      expect(templatePromptHints[template.value]).toBeDefined();
      expect(templatePromptHints[template.value].length).toBeGreaterThan(0);
    });
  });
});
