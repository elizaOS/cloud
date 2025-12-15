import { describe, test, expect } from "bun:test";

// Simulate the URL parameter handling logic
function buildPromptUrl(destination: string, prompt: string): string {
  if (!prompt.trim()) {
    return destination;
  }
  return `${destination}?prompt=${encodeURIComponent(prompt)}`;
}

function parsePromptFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url, "http://localhost");
    const prompt = urlObj.searchParams.get("prompt");
    return prompt;
  } catch {
    return null;
  }
}

describe("URL Parameter Building", () => {
  test("empty prompt returns just the destination", () => {
    expect(buildPromptUrl("/dashboard/build", "")).toBe("/dashboard/build");
    expect(buildPromptUrl("/dashboard/build", "   ")).toBe("/dashboard/build");
  });

  test("simple prompt is correctly encoded", () => {
    const url = buildPromptUrl("/dashboard/build", "create an agent");
    expect(url).toBe("/dashboard/build?prompt=create%20an%20agent");
  });

  test("special characters are properly encoded", () => {
    const url = buildPromptUrl(
      "/dashboard/build",
      "agent with $100 budget & features?",
    );
    expect(url).toContain("%24"); // $
    expect(url).toContain("%26"); // &
    expect(url).toContain("%3F"); // ?
  });

  test("unicode is properly encoded", () => {
    const url = buildPromptUrl("/dashboard/build", "agent that speaks 日本語");
    const decoded = parsePromptFromUrl(url);
    expect(decoded).toBe("agent that speaks 日本語");
  });

  test("newlines and tabs are encoded", () => {
    const url = buildPromptUrl("/dashboard/build", "line1\nline2\ttab");
    expect(url).toContain("%0A"); // \n
    expect(url).toContain("%09"); // \t
  });

  test("quotes are encoded", () => {
    const url = buildPromptUrl("/dashboard/build", 'agent that says "hello"');
    expect(url).toContain("%22"); // "
  });
});

describe("URL Parameter Parsing", () => {
  test("extracts prompt from valid URL", () => {
    const prompt = parsePromptFromUrl(
      "/dashboard/build?prompt=create%20an%20agent",
    );
    expect(prompt).toBe("create an agent");
  });

  test("returns null for URL without prompt", () => {
    const prompt = parsePromptFromUrl("/dashboard/build");
    expect(prompt).toBeNull();
  });

  test("handles empty prompt parameter", () => {
    const prompt = parsePromptFromUrl("/dashboard/build?prompt=");
    expect(prompt).toBe("");
  });

  test("handles multiple parameters", () => {
    const prompt = parsePromptFromUrl(
      "/dashboard/build?prompt=test&other=value",
    );
    expect(prompt).toBe("test");
  });

  test("decodes special characters correctly", () => {
    const url =
      "/dashboard/build?prompt=agent%20with%20%24100%20%26%20features%3F";
    const prompt = parsePromptFromUrl(url);
    expect(prompt).toBe("agent with $100 & features?");
  });

  test("handles malformed URLs gracefully", () => {
    // Invalid URL format
    const prompt = parsePromptFromUrl("not-a-url");
    // With base URL, it should still work
    expect(prompt).toBeNull();
  });
});

describe("Round-trip Encoding/Decoding", () => {
  const testCases = [
    "simple prompt",
    "prompt with $pecial ch@racters!",
    "日本語テスト",
    "emoji test 🚀🤖",
    "multi\nline\nprompt",
    'quotes "inside" prompt',
    "very " + "long ".repeat(100) + "prompt",
    "   spaces   everywhere   ",
    "path/like/prompt",
    "url?like=prompt&params",
  ];

  testCases.forEach((original, index) => {
    test(`round-trip case ${index + 1}: preserves "${original.slice(0, 30)}..."`, () => {
      const encoded = buildPromptUrl("/dashboard/build", original);
      const decoded = parsePromptFromUrl(encoded);
      expect(decoded).toBe(original);
    });
  });
});

describe("Destination Path Validation", () => {
  const validDestinations = [
    "/dashboard/build",
    "/dashboard/fragments",
    "/dashboard/image",
    "/dashboard/video",
    "/dashboard/workflows",
    "/dashboard/apps",
  ];

  validDestinations.forEach((dest) => {
    test(`${dest} is a valid destination`, () => {
      const url = buildPromptUrl(dest, "test prompt");
      expect(url).toStartWith(dest);
      expect(url).toContain("?prompt=");
    });
  });

  test("destination path is not modified by encoding", () => {
    const url = buildPromptUrl("/dashboard/build", "test");
    expect(url.split("?")[0]).toBe("/dashboard/build");
  });
});

describe("Edge Cases and Boundary Conditions", () => {
  test("very long prompt (10000 chars)", () => {
    const longPrompt = "a".repeat(10000);
    const url = buildPromptUrl("/dashboard/build", longPrompt);
    const decoded = parsePromptFromUrl(url);
    expect(decoded).toBe(longPrompt);
  });

  test("prompt with only whitespace", () => {
    const url = buildPromptUrl("/dashboard/build", "    ");
    expect(url).toBe("/dashboard/build");
  });

  test("prompt with leading/trailing whitespace preserved after encoding", () => {
    const prompt = "  leading and trailing  ";
    const url = buildPromptUrl("/dashboard/build", prompt);
    const decoded = parsePromptFromUrl(url);
    expect(decoded).toBe(prompt);
  });

  test("prompt containing URL-like strings", () => {
    const prompt = "go to https://example.com/path?query=value";
    const url = buildPromptUrl("/dashboard/build", prompt);
    const decoded = parsePromptFromUrl(url);
    expect(decoded).toBe(prompt);
  });

  test("prompt containing HTML-like content", () => {
    const prompt = "<script>alert('xss')</script>";
    const url = buildPromptUrl("/dashboard/build", prompt);
    const decoded = parsePromptFromUrl(url);
    expect(decoded).toBe(prompt);
    // Verify it's encoded, not raw
    expect(url).not.toContain("<script>");
  });

  test("prompt containing SQL-like content", () => {
    const prompt = "'; DROP TABLE users; --";
    const url = buildPromptUrl("/dashboard/build", prompt);
    const decoded = parsePromptFromUrl(url);
    expect(decoded).toBe(prompt);
  });

  test("null-byte and control characters", () => {
    const prompt = "test\x00null\x01ctrl";
    const url = buildPromptUrl("/dashboard/build", prompt);
    const decoded = parsePromptFromUrl(url);
    expect(decoded).toBe(prompt);
  });
});

describe("Integration Simulation", () => {
  test("TopHero -> Build page flow", () => {
    // Simulate user typing in TopHero
    const userInput = "create an agent that talks like my dad";
    const activeTab = "agent";

    // TopHero generates URL
    const destination =
      activeTab === "agent" ? "/dashboard/build" : "/dashboard/fragments";
    const generatedUrl = buildPromptUrl(destination, userInput);

    // Build page parses URL
    const extractedPrompt = parsePromptFromUrl(generatedUrl);

    expect(extractedPrompt).toBe(userInput);
  });

  test("TopHero -> Fragments page flow", () => {
    const userInput = "build an MCP service for weather data";
    const activeTab = "app";

    const destination =
      activeTab === "agent" ? "/dashboard/build" : "/dashboard/fragments";
    const generatedUrl = buildPromptUrl(destination, userInput);

    const extractedPrompt = parsePromptFromUrl(generatedUrl);

    expect(extractedPrompt).toBe(userInput);
    expect(generatedUrl).toContain("/dashboard/fragments");
  });

  test("clicking example prompt flow", () => {
    const examplePrompt =
      "An agent based on my dead father who gives life advice";

    // User clicks example prompt
    const url = buildPromptUrl("/dashboard/build", examplePrompt);

    // Page receives and parses
    const received = parsePromptFromUrl(url);

    expect(received).toBe(examplePrompt);
  });

  test("direct input without clicking example", () => {
    const userInput = "custom agent request";

    const url = buildPromptUrl("/dashboard/build", userInput);
    const received = parsePromptFromUrl(url);

    expect(received).toBe(userInput);
  });
});

describe("Session Storage Simulation", () => {
  interface PendingPromptData {
    tab: "agent" | "app" | "image" | "video";
    prompt: string;
  }

  function serializePendingPrompt(data: PendingPromptData): string {
    return JSON.stringify(data);
  }

  function deserializePendingPrompt(str: string): PendingPromptData {
    return JSON.parse(str) as PendingPromptData;
  }

  test("pending prompt serialization preserves data", () => {
    const original: PendingPromptData = {
      tab: "agent",
      prompt: "build me something cool",
    };

    const serialized = serializePendingPrompt(original);
    const deserialized = deserializePendingPrompt(serialized);

    expect(deserialized).toEqual(original);
  });

  test("all tab types can be serialized", () => {
    const tabs: Array<"agent" | "app" | "image" | "video"> = [
      "agent",
      "app",
      "image",
      "video",
    ];

    tabs.forEach((tab) => {
      const data: PendingPromptData = { tab, prompt: "test" };
      const serialized = serializePendingPrompt(data);
      const deserialized = deserializePendingPrompt(serialized);
      expect(deserialized.tab).toBe(tab);
    });
  });

  test("special characters in prompt survive serialization", () => {
    const data: PendingPromptData = {
      tab: "agent",
      prompt: "prompt with 'quotes' and \"double quotes\" and $pecial chars",
    };

    const serialized = serializePendingPrompt(data);
    const deserialized = deserializePendingPrompt(serialized);

    expect(deserialized.prompt).toBe(data.prompt);
  });

  test("empty prompt is handled", () => {
    const data: PendingPromptData = { tab: "app", prompt: "" };

    const serialized = serializePendingPrompt(data);
    const deserialized = deserializePendingPrompt(serialized);

    expect(deserialized.prompt).toBe("");
  });
});
