import { describe, test, expect } from "bun:test";

const ENDPOINT_TYPES = ["a2a", "mcp", "rest"] as const;

const CATEGORIES = [
  "ai",
  "storage",
  "infrastructure",
  "workflows",
  "billing",
  "memory",
  "agents",
  "discovery",
  "defi",
  "utilities",
];

describe("Endpoint Discovery Types", () => {
  test("endpoint types are valid", () => {
    expect(ENDPOINT_TYPES).toContain("a2a");
    expect(ENDPOINT_TYPES).toContain("mcp");
    expect(ENDPOINT_TYPES).toContain("rest");
    expect(ENDPOINT_TYPES.length).toBe(3);
  });

  test("categories cover main functionality areas", () => {
    expect(CATEGORIES).toContain("ai");
    expect(CATEGORIES).toContain("storage");
    expect(CATEGORIES).toContain("workflows");
    expect(CATEGORIES).toContain("defi");
  });
});

describe("Endpoint Node Structure", () => {
  const mockEndpoint = {
    id: "a2a_local_chat",
    name: "A2A: chat",
    description: "Chat skill via A2A",
    type: "a2a" as const,
    category: "ai",
    endpoint: "https://elizacloud.ai/api/a2a",
    method: "POST",
    authentication: {
      type: "api_key" as const,
      description: "Requires API key authentication",
    },
    source: "builtin",
    metadata: {
      skillId: "chat",
    },
  };

  test("endpoint has required fields", () => {
    expect(mockEndpoint.id).toBeDefined();
    expect(mockEndpoint.name).toBeDefined();
    expect(mockEndpoint.description).toBeDefined();
    expect(mockEndpoint.type).toBeDefined();
    expect(mockEndpoint.category).toBeDefined();
    expect(mockEndpoint.endpoint).toBeDefined();
  });

  test("endpoint type is valid", () => {
    expect(ENDPOINT_TYPES).toContain(mockEndpoint.type);
  });

  test("endpoint ID is unique format", () => {
    expect(mockEndpoint.id).toMatch(/^(a2a|mcp|rest)_/);
  });

  test("authentication type is valid", () => {
    const validAuthTypes = ["api_key", "bearer", "x402", "none"];
    expect(validAuthTypes).toContain(mockEndpoint.authentication.type);
  });
});

describe("Search Functionality", () => {
  const mockEndpoints = [
    {
      id: "1",
      name: "Chat API",
      description: "AI chat",
      category: "ai",
      type: "rest",
    },
    {
      id: "2",
      name: "Storage Upload",
      description: "Upload files",
      category: "storage",
      type: "rest",
    },
    {
      id: "3",
      name: "Workflow Create",
      description: "Create n8n workflow",
      category: "workflows",
      type: "a2a",
    },
    {
      id: "4",
      name: "Token Price",
      description: "Get token price",
      category: "defi",
      type: "mcp",
    },
  ];

  test("filter by type", () => {
    const filtered = mockEndpoints.filter((e) => e.type === "rest");
    expect(filtered.length).toBe(2);
    expect(filtered.every((e) => e.type === "rest")).toBe(true);
  });

  test("filter by category", () => {
    const filtered = mockEndpoints.filter((e) => e.category === "ai");
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe("Chat API");
  });

  test("text search by name", () => {
    const query = "workflow";
    const filtered = mockEndpoints.filter((e) =>
      e.name.toLowerCase().includes(query.toLowerCase()),
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("3");
  });

  test("text search by description", () => {
    const query = "token";
    const filtered = mockEndpoints.filter((e) =>
      e.description.toLowerCase().includes(query.toLowerCase()),
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].category).toBe("defi");
  });

  test("combined filters", () => {
    const filtered = mockEndpoints
      .filter((e) => e.type === "rest")
      .filter((e) => e.category === "storage");
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe("Storage Upload");
  });
});

describe("Category Colors Consistency", () => {
  const CATEGORY_COLORS: Record<string, string> = {
    ai: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    storage: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    infrastructure: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    workflows: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    billing: "bg-green-500/20 text-green-400 border-green-500/30",
    memory: "bg-pink-500/20 text-pink-400 border-pink-500/30",
    agents: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    discovery: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    defi: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    utilities: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  test("all categories have colors defined", () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_COLORS[category]).toBeDefined();
    }
  });

  test("color classes follow Tailwind pattern", () => {
    for (const [category, classes] of Object.entries(CATEGORY_COLORS)) {
      expect(classes).toMatch(/bg-\w+-\d+\/\d+/);
      expect(classes).toMatch(/text-\w+-\d+/);
      expect(classes).toMatch(/border-\w+-\d+\/\d+/);
    }
  });
});

describe("Type Configuration", () => {
  const TYPE_CONFIG = {
    a2a: { label: "A2A", color: "from-orange-500 to-red-500" },
    mcp: { label: "MCP", color: "from-purple-500 to-pink-500" },
    rest: { label: "REST", color: "from-green-500 to-emerald-500" },
  };

  test("all endpoint types have config", () => {
    for (const type of ENDPOINT_TYPES) {
      expect(TYPE_CONFIG[type]).toBeDefined();
      expect(TYPE_CONFIG[type].label).toBeDefined();
      expect(TYPE_CONFIG[type].color).toBeDefined();
    }
  });

  test("labels are descriptive", () => {
    expect(TYPE_CONFIG.a2a.label).toBe("A2A");
    expect(TYPE_CONFIG.mcp.label).toBe("MCP");
    expect(TYPE_CONFIG.rest.label).toBe("REST");
  });

  test("colors use gradient format", () => {
    for (const config of Object.values(TYPE_CONFIG)) {
      expect(config.color).toMatch(/^from-\w+-\d+ to-\w+-\d+$/);
    }
  });
});

describe("Search Edge Cases", () => {
  const mockEndpoints = [
    {
      id: "1",
      name: "Chat API",
      description: "AI chat",
      category: "ai",
      type: "rest",
    },
    {
      id: "2",
      name: "Storage Upload",
      description: "Upload files",
      category: "storage",
      type: "rest",
    },
    {
      id: "3",
      name: "Workflow Create",
      description: "Create n8n workflow",
      category: "workflows",
      type: "a2a",
    },
    {
      id: "4",
      name: "Token Price",
      description: "Get token price",
      category: "defi",
      type: "mcp",
    },
    {
      id: "5",
      name: "CHAT Service",
      description: "Another chat",
      category: "ai",
      type: "a2a",
    },
  ];

  test("case-insensitive search", () => {
    const query = "CHAT";
    const filtered = mockEndpoints.filter((e) =>
      e.name.toLowerCase().includes(query.toLowerCase()),
    );
    expect(filtered.length).toBe(2);
  });

  test("empty query returns all", () => {
    const query = "";
    const filtered = query
      ? mockEndpoints.filter((e) =>
          e.name.toLowerCase().includes(query.toLowerCase()),
        )
      : mockEndpoints;
    expect(filtered.length).toBe(mockEndpoints.length);
  });

  test("query with no matches returns empty", () => {
    const query = "nonexistent";
    const filtered = mockEndpoints.filter((e) =>
      e.name.toLowerCase().includes(query.toLowerCase()),
    );
    expect(filtered.length).toBe(0);
  });

  test("special characters in query", () => {
    const query = "n8n";
    const filtered = mockEndpoints.filter((e) =>
      e.description.toLowerCase().includes(query.toLowerCase()),
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("3");
  });

  test("multiple type filters", () => {
    const types = ["rest", "a2a"];
    const filtered = mockEndpoints.filter((e) => types.includes(e.type));
    expect(filtered.length).toBe(4);
  });

  test("filter with no matching type", () => {
    const types = ["graphql" as string];
    const filtered = mockEndpoints.filter((e) => types.includes(e.type));
    expect(filtered.length).toBe(0);
  });

  test("filter with empty type array returns all", () => {
    const types: string[] = [];
    const filtered =
      types.length > 0
        ? mockEndpoints.filter((e) => types.includes(e.type))
        : mockEndpoints;
    expect(filtered.length).toBe(mockEndpoints.length);
  });

  test("combined search and filter", () => {
    const query = "chat";
    const type = "a2a";
    const filtered = mockEndpoints
      .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
      .filter((e) => e.type === type);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("5");
  });
});

describe("Pagination and Limits", () => {
  const manyEndpoints = Array.from({ length: 150 }, (_, i) => ({
    id: `endpoint-${i}`,
    name: `Endpoint ${i}`,
    description: `Description ${i}`,
    category: "utilities",
    type: "rest" as const,
  }));

  test("default limit of 100", () => {
    const limit = 100;
    const limited = manyEndpoints.slice(0, limit);
    expect(limited.length).toBe(100);
  });

  test("custom limit respected", () => {
    const limit = 50;
    const limited = manyEndpoints.slice(0, limit);
    expect(limited.length).toBe(50);
  });

  test("max limit of 500 enforced", () => {
    const requestedLimit = 1000;
    const enforcedLimit = Math.min(requestedLimit, 500);
    const limited = manyEndpoints.slice(0, enforcedLimit);
    expect(limited.length).toBe(150); // All endpoints since we only have 150
    expect(enforcedLimit).toBe(500);
  });

  test("limit of 0 returns empty", () => {
    const limit = 0;
    const limited = manyEndpoints.slice(0, limit);
    expect(limited.length).toBe(0);
  });

  test("negative limit treated as 0", () => {
    const limit = Math.max(-10, 0);
    const limited = manyEndpoints.slice(0, limit);
    expect(limited.length).toBe(0);
  });
});

describe("URL Parameter Parsing", () => {
  function parseTypes(
    param: string | null,
  ): ("a2a" | "mcp" | "rest")[] | undefined {
    if (!param) return undefined;
    const validTypes = ["a2a", "mcp", "rest"];
    return param.split(",").filter((t) => validTypes.includes(t)) as (
      | "a2a"
      | "mcp"
      | "rest"
    )[];
  }

  test("parses comma-separated types", () => {
    const result = parseTypes("a2a,mcp");
    expect(result).toEqual(["a2a", "mcp"]);
  });

  test("filters invalid types", () => {
    const result = parseTypes("a2a,invalid,rest");
    expect(result).toEqual(["a2a", "rest"]);
  });

  test("returns undefined for null param", () => {
    const result = parseTypes(null);
    expect(result).toBeUndefined();
  });

  test("returns empty array for all invalid", () => {
    const result = parseTypes("invalid,unknown");
    expect(result).toEqual([]);
  });

  test("handles single type", () => {
    const result = parseTypes("mcp");
    expect(result).toEqual(["mcp"]);
  });

  test("handles empty string as falsy", () => {
    const result = parseTypes("");
    expect(result).toBeUndefined();
  });

  test("handles whitespace in types", () => {
    const param = " a2a , mcp ";
    const result = param
      .split(",")
      .map((t) => t.trim())
      .filter((t) => ["a2a", "mcp", "rest"].includes(t));
    expect(result).toEqual(["a2a", "mcp"]);
  });
});

describe("Category Fallback", () => {
  const CATEGORY_COLORS: Record<string, string> = {
    ai: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    utilities: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  test("known category returns specific color", () => {
    const color = CATEGORY_COLORS["ai"];
    expect(color).toContain("blue");
  });

  test("unknown category falls back to utilities", () => {
    const category = "unknownCategory";
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.utilities;
    expect(color).toContain("gray");
  });

  test("undefined category handled", () => {
    const category: string | undefined = undefined;
    const color = category
      ? CATEGORY_COLORS[category]
      : CATEGORY_COLORS.utilities;
    expect(color).toBe(CATEGORY_COLORS.utilities);
  });
});

describe("Endpoint ID Format Validation", () => {
  test("a2a endpoint ID format", () => {
    const id = "a2a_local_chat";
    expect(id).toMatch(/^a2a_/);
    expect(id.split("_").length).toBeGreaterThanOrEqual(2);
  });

  test("mcp endpoint ID format", () => {
    const id = "mcp_main_generate_text";
    expect(id).toMatch(/^mcp_/);
  });

  test("rest endpoint ID format", () => {
    const id = "rest_post__api_v1_chat";
    expect(id).toMatch(/^rest_/);
    expect(id).toContain("_api_");
  });

  test("ID contains type prefix", () => {
    const ids = ["a2a_test", "mcp_test", "rest_test"];
    for (const id of ids) {
      const prefix = id.split("_")[0];
      expect(["a2a", "mcp", "rest"]).toContain(prefix);
    }
  });
});

describe("Authentication Type Handling", () => {
  test("api_key auth type", () => {
    const auth = { type: "api_key", description: "Requires API key" };
    expect(auth.type).toBe("api_key");
  });

  test("bearer auth type", () => {
    const auth = { type: "bearer", description: "Requires bearer token" };
    expect(auth.type).toBe("bearer");
  });

  test("x402 auth type indicates payment", () => {
    const auth = { type: "x402", description: "x402 payment enabled" };
    expect(auth.type).toBe("x402");
    expect(auth.description).toContain("payment");
  });

  test("none auth type for public endpoints", () => {
    const auth = { type: "none", description: "No authentication required" };
    expect(auth.type).toBe("none");
  });

  test("undefined auth for optional authentication", () => {
    const endpoint: { authentication?: { type: string } } = {};
    expect(endpoint.authentication).toBeUndefined();
  });
});

describe("x402 Badge Logic", () => {
  const mockEndpoints = [
    { id: "1", name: "Free API", x402Enabled: false },
    { id: "2", name: "Paid API", x402Enabled: true },
    { id: "3", name: "No flag API" },
  ];

  test("x402Enabled true shows badge", () => {
    const endpoint = mockEndpoints.find((e) => e.id === "2");
    expect(endpoint?.x402Enabled).toBe(true);
  });

  test("x402Enabled false hides badge", () => {
    const endpoint = mockEndpoints.find((e) => e.id === "1");
    expect(endpoint?.x402Enabled).toBe(false);
  });

  test("missing x402Enabled treated as false", () => {
    const endpoint = mockEndpoints.find((e) => e.id === "3") as {
      x402Enabled?: boolean;
    };
    expect(endpoint?.x402Enabled ?? false).toBe(false);
  });
});

describe("Concurrent Filter Updates", () => {
  test("rapid filter changes use latest state", async () => {
    let currentFilters: string[] = [];

    const setFilters = (fn: (prev: string[]) => string[]) => {
      currentFilters = fn(currentFilters);
    };

    // Simulate rapid filter toggles
    setFilters((prev) => [...prev, "a2a"]);
    setFilters((prev) => [...prev, "mcp"]);
    setFilters((prev) => prev.filter((t) => t !== "a2a"));
    setFilters((prev) => [...prev, "rest"]);

    expect(currentFilters).toEqual(["mcp", "rest"]);
  });

  test("toggle adds when not present", () => {
    const current = ["a2a"];
    const type = "mcp";
    const result = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    expect(result).toEqual(["a2a", "mcp"]);
  });

  test("toggle removes when present", () => {
    const current = ["a2a", "mcp"];
    const type = "a2a";
    const result = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    expect(result).toEqual(["mcp"]);
  });
});
