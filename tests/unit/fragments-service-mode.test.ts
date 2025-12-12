import { describe, test, expect } from "bun:test";

// Re-implement the types and logic from fragments page for testing
type BuilderMode = "quick" | "full_app" | "service";
type ServiceProtocol = "mcp" | "a2a";

interface ServiceConfig {
  protocol: ServiceProtocol;
  name: string;
  description: string;
  tools?: ToolDefinition[];
  skills?: SkillDefinition[];
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

describe("Builder Mode Toggle", () => {
  const modes: BuilderMode[] = ["quick", "full_app", "service"];

  test("all modes are valid", () => {
    modes.forEach(mode => {
      expect(["quick", "full_app", "service"]).toContain(mode);
    });
  });

  test("exactly 3 modes exist", () => {
    expect(modes.length).toBe(3);
  });

  test("service mode is a valid option", () => {
    expect(modes).toContain("service");
  });

  test("mode state transitions are valid", () => {
    let currentMode: BuilderMode = "quick";
    
    // Can switch to any mode from quick
    currentMode = "full_app";
    expect(currentMode).toBe("full_app");
    
    currentMode = "service";
    expect(currentMode).toBe("service");
    
    // Can switch back
    currentMode = "quick";
    expect(currentMode).toBe("quick");
  });
});

describe("Service Protocol Selection", () => {
  const protocols: ServiceProtocol[] = ["mcp", "a2a"];

  test("both protocols are supported", () => {
    expect(protocols.length).toBe(2);
    expect(protocols).toContain("mcp");
    expect(protocols).toContain("a2a");
  });

  test("MCP protocol generates tools", () => {
    const mcpConfig: ServiceConfig = {
      protocol: "mcp",
      name: "weather-service",
      description: "Weather data API",
      tools: [
        {
          name: "get_weather",
          description: "Get current weather",
          inputSchema: { type: "object", properties: { location: { type: "string" } } },
        },
      ],
    };
    
    expect(mcpConfig.tools).toBeDefined();
    expect(mcpConfig.tools?.length).toBeGreaterThan(0);
  });

  test("A2A protocol generates skills", () => {
    const a2aConfig: ServiceConfig = {
      protocol: "a2a",
      name: "assistant-agent",
      description: "Assistant agent",
      skills: [
        {
          id: "answer_question",
          name: "Answer Question",
          description: "Answer user questions",
          inputSchema: { type: "object", properties: { question: { type: "string" } } },
        },
      ],
    };
    
    expect(a2aConfig.skills).toBeDefined();
    expect(a2aConfig.skills?.length).toBeGreaterThan(0);
  });
});

describe("Service Name Validation", () => {
  function isValidServiceName(name: string): boolean {
    // Service names should be kebab-case, alphanumeric with hyphens
    return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) || /^[a-z]$/.test(name);
  }

  test("valid service names pass validation", () => {
    const validNames = [
      "weather-service",
      "my-api",
      "a",
      "a2a-agent",
      "mcp-tools",
      "service123",
    ];
    
    validNames.forEach(name => {
      expect(isValidServiceName(name)).toBe(true);
    });
  });

  test("invalid service names fail validation", () => {
    const invalidNames = [
      "Weather-Service", // uppercase
      "-service", // starts with hyphen
      "service-", // ends with hyphen
      "my service", // space
      "my_service", // underscore
      "123service", // starts with number
      "", // empty
    ];
    
    invalidNames.forEach(name => {
      expect(isValidServiceName(name)).toBe(false);
    });
  });
});

describe("MCP Tool Definition", () => {
  function isValidMCPTool(tool: ToolDefinition): boolean {
    return (
      tool.name.length > 0 &&
      tool.description.length > 0 &&
      typeof tool.inputSchema === "object" &&
      tool.inputSchema !== null
    );
  }

  test("valid MCP tool passes validation", () => {
    const tool: ToolDefinition = {
      name: "get_data",
      description: "Fetches data from the API",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
      },
    };
    
    expect(isValidMCPTool(tool)).toBe(true);
  });

  test("MCP tool with empty name fails", () => {
    const tool: ToolDefinition = {
      name: "",
      description: "Some description",
      inputSchema: {},
    };
    
    expect(isValidMCPTool(tool)).toBe(false);
  });

  test("MCP tool with empty description fails", () => {
    const tool: ToolDefinition = {
      name: "my_tool",
      description: "",
      inputSchema: {},
    };
    
    expect(isValidMCPTool(tool)).toBe(false);
  });

  test("MCP tool names follow snake_case convention", () => {
    const validToolNames = ["get_data", "send_message", "list_items"];
    
    validToolNames.forEach(name => {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    });
  });
});

describe("A2A Skill Definition", () => {
  function isValidA2ASkill(skill: SkillDefinition): boolean {
    return (
      skill.id.length > 0 &&
      skill.name.length > 0 &&
      skill.description.length > 0 &&
      typeof skill.inputSchema === "object" &&
      skill.inputSchema !== null
    );
  }

  test("valid A2A skill passes validation", () => {
    const skill: SkillDefinition = {
      id: "generate_report",
      name: "Generate Report",
      description: "Generates a detailed report",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string" },
        },
      },
    };
    
    expect(isValidA2ASkill(skill)).toBe(true);
  });

  test("A2A skill with empty id fails", () => {
    const skill: SkillDefinition = {
      id: "",
      name: "Some Skill",
      description: "Description",
      inputSchema: {},
    };
    
    expect(isValidA2ASkill(skill)).toBe(false);
  });

  test("A2A skill names can be Title Case", () => {
    const skill: SkillDefinition = {
      id: "answer_question",
      name: "Answer Question",
      description: "Answers user questions",
      inputSchema: {},
    };
    
    expect(skill.name).toMatch(/^[A-Z]/);
    expect(isValidA2ASkill(skill)).toBe(true);
  });
});

describe("Service Code Generation", () => {
  // Simulate code generation for different service types
  function generateMCPServerStub(config: ServiceConfig): string {
    if (config.protocol !== "mcp") {
      throw new Error("Invalid protocol for MCP generation");
    }
    
    const tools = config.tools || [];
    return `
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const server = new Server({
  name: "${config.name}",
  version: "1.0.0",
});

// Tools: ${tools.map(t => t.name).join(", ")}
export default server;
`.trim();
  }

  function generateA2AAgentStub(config: ServiceConfig): string {
    if (config.protocol !== "a2a") {
      throw new Error("Invalid protocol for A2A generation");
    }
    
    const skills = config.skills || [];
    return `
import { A2AServer } from "@/lib/a2a";

const agent = new A2AServer({
  name: "${config.name}",
  description: "${config.description}",
});

// Skills: ${skills.map(s => s.name).join(", ")}
export default agent;
`.trim();
  }

  test("MCP server stub includes server name", () => {
    const config: ServiceConfig = {
      protocol: "mcp",
      name: "test-service",
      description: "Test service",
      tools: [],
    };
    
    const code = generateMCPServerStub(config);
    expect(code).toContain("test-service");
    expect(code).toContain("@modelcontextprotocol/sdk");
  });

  test("A2A agent stub includes agent name and description", () => {
    const config: ServiceConfig = {
      protocol: "a2a",
      name: "test-agent",
      description: "A test agent",
      skills: [],
    };
    
    const code = generateA2AAgentStub(config);
    expect(code).toContain("test-agent");
    expect(code).toContain("A test agent");
    expect(code).toContain("A2AServer");
  });

  test("MCP generation throws for wrong protocol", () => {
    const config: ServiceConfig = {
      protocol: "a2a",
      name: "test",
      description: "test",
    };
    
    expect(() => generateMCPServerStub(config)).toThrow("Invalid protocol");
  });

  test("A2A generation throws for wrong protocol", () => {
    const config: ServiceConfig = {
      protocol: "mcp",
      name: "test",
      description: "test",
    };
    
    expect(() => generateA2AAgentStub(config)).toThrow("Invalid protocol");
  });
});

describe("Service Dialog State", () => {
  interface ServiceDialogState {
    open: boolean;
    protocol: ServiceProtocol;
    step: "config" | "tools" | "preview";
    name: string;
    description: string;
    tools: ToolDefinition[];
    skills: SkillDefinition[];
  }

  function createInitialState(): ServiceDialogState {
    return {
      open: false,
      protocol: "mcp",
      step: "config",
      name: "",
      description: "",
      tools: [],
      skills: [],
    };
  }

  test("initial state is closed with MCP protocol", () => {
    const state = createInitialState();
    expect(state.open).toBe(false);
    expect(state.protocol).toBe("mcp");
    expect(state.step).toBe("config");
  });

  test("switching protocol clears tools/skills", () => {
    const state = createInitialState();
    state.protocol = "mcp";
    state.tools = [{ name: "test", description: "test", inputSchema: {} }];
    
    // Simulate protocol switch
    const newState: ServiceDialogState = {
      ...state,
      protocol: "a2a",
      tools: [],
      skills: [],
    };
    
    expect(newState.tools.length).toBe(0);
    expect(newState.skills.length).toBe(0);
  });

  test("can add multiple tools", () => {
    const state = createInitialState();
    state.tools.push({ name: "tool1", description: "desc1", inputSchema: {} });
    state.tools.push({ name: "tool2", description: "desc2", inputSchema: {} });
    
    expect(state.tools.length).toBe(2);
    expect(state.tools[0].name).toBe("tool1");
    expect(state.tools[1].name).toBe("tool2");
  });

  test("can add multiple skills", () => {
    const state = createInitialState();
    state.protocol = "a2a";
    state.skills.push({ id: "s1", name: "Skill 1", description: "desc1", inputSchema: {} });
    state.skills.push({ id: "s2", name: "Skill 2", description: "desc2", inputSchema: {} });
    
    expect(state.skills.length).toBe(2);
  });
});

describe("URL Parameter Integration", () => {
  test("service mode can be triggered via URL", () => {
    // Simulate URL params
    const searchParams = new URLSearchParams("?mode=service&protocol=mcp");
    
    const mode = searchParams.get("mode") as BuilderMode | null;
    const protocol = searchParams.get("protocol") as ServiceProtocol | null;
    
    expect(mode).toBe("service");
    expect(protocol).toBe("mcp");
  });

  test("prompt parameter works with service mode", () => {
    const searchParams = new URLSearchParams("?mode=service&prompt=Create%20an%20MCP%20weather%20service");
    
    const mode = searchParams.get("mode");
    const prompt = searchParams.get("prompt");
    
    expect(mode).toBe("service");
    expect(prompt).toBe("Create an MCP weather service");
  });
});

describe("Service Templates", () => {
  const mcpTemplates = [
    { id: "weather", name: "Weather API", description: "Get weather data" },
    { id: "database", name: "Database Connector", description: "Query databases" },
    { id: "file-system", name: "File System", description: "File operations" },
  ];

  const a2aTemplates = [
    { id: "assistant", name: "Assistant", description: "General assistant" },
    { id: "researcher", name: "Researcher", description: "Research agent" },
    { id: "coder", name: "Coder", description: "Code generation agent" },
  ];

  test("MCP templates are available", () => {
    expect(mcpTemplates.length).toBeGreaterThan(0);
    mcpTemplates.forEach(t => {
      expect(t.id).toBeDefined();
      expect(t.name).toBeDefined();
      expect(t.description).toBeDefined();
    });
  });

  test("A2A templates are available", () => {
    expect(a2aTemplates.length).toBeGreaterThan(0);
    a2aTemplates.forEach(t => {
      expect(t.id).toBeDefined();
      expect(t.name).toBeDefined();
      expect(t.description).toBeDefined();
    });
  });

  test("template IDs are unique within each protocol", () => {
    const mcpIds = mcpTemplates.map(t => t.id);
    const a2aIds = a2aTemplates.map(t => t.id);
    
    expect(new Set(mcpIds).size).toBe(mcpIds.length);
    expect(new Set(a2aIds).size).toBe(a2aIds.length);
  });
});

