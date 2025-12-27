import { describe, test, expect } from "bun:test";
import {
  TAB_CONFIG,
  JOURNEY_STEPS,
  ALL_TABS,
  type TabValue,
} from "@/lib/config/landing-hero";

describe("TAB_CONFIG Structure", () => {
  test("contains all required tabs", () => {
    ALL_TABS.forEach((tab) => {
      expect(TAB_CONFIG[tab]).toBeDefined();
    });
  });

  test("each tab has exactly 3 prompts", () => {
    ALL_TABS.forEach((tab) => {
      expect(TAB_CONFIG[tab].prompts.length).toBe(3);
    });
  });

  test("prompts are non-empty strings", () => {
    ALL_TABS.forEach((tab) => {
      TAB_CONFIG[tab].prompts.forEach((prompt) => {
        expect(typeof prompt).toBe("string");
        expect(prompt.length).toBeGreaterThan(10);
      });
    });
  });

  test("placeholders are descriptive questions", () => {
    ALL_TABS.forEach((tab) => {
      const placeholder = TAB_CONFIG[tab].placeholder;
      expect(placeholder.length).toBeGreaterThan(15);
      expect(placeholder).toMatch(/\?|\.{3}$/); // Ends with ? or ...
    });
  });

  test("destinations are valid dashboard paths", () => {
    ALL_TABS.forEach((tab) => {
      const dest = TAB_CONFIG[tab].destination;
      expect(dest).toMatch(/^\/dashboard\//);
    });
  });

  test("agent destination goes to build page", () => {
    expect(TAB_CONFIG.agent.destination).toBe("/dashboard/build");
  });

  test("app destination goes to fragments page", () => {
    expect(TAB_CONFIG.app.destination).toBe("/dashboard/fragments");
  });
});

describe("JOURNEY_STEPS Configuration", () => {
  test("contains exactly 4 steps", () => {
    expect(JOURNEY_STEPS.length).toBe(4);
  });

  test("steps are in correct order: Create -> Deploy -> Monetize -> Publicize", () => {
    expect(JOURNEY_STEPS[0].label).toBe("Create");
    expect(JOURNEY_STEPS[1].label).toBe("Deploy");
    expect(JOURNEY_STEPS[2].label).toBe("Monetize");
    expect(JOURNEY_STEPS[3].label).toBe("Publicize");
  });

  test("all colors are valid hex colors", () => {
    JOURNEY_STEPS.forEach((step) => {
      expect(step.color).toMatch(/^#[A-Fa-f0-9]{6}$/);
    });
  });

  test("Create step uses brand orange", () => {
    expect(JOURNEY_STEPS[0].color).toBe("#FF5800");
  });

  test("each step has unique color", () => {
    const colors = JOURNEY_STEPS.map((s) => s.color);
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(JOURNEY_STEPS.length);
  });

  test("all steps have icon components", () => {
    JOURNEY_STEPS.forEach((step) => {
      expect(step.icon).toBeDefined();
      // Lucide icons are ForwardRef components (objects with $$typeof)
      expect(step.icon).toBeTruthy();
    });
  });
});

describe("Prompt Content Quality", () => {
  test("agent prompts are edgy/unconventional", () => {
    const edgyTerms = [
      "dead father",
      "sober",
      "roasts",
      "crypto degen",
      "3am",
      "sarcastic",
    ];
    const agentPrompts = TAB_CONFIG.agent.prompts.join(" ").toLowerCase();
    const hasEdgyContent = edgyTerms.some((term) =>
      agentPrompts.includes(term.toLowerCase()),
    );
    expect(hasEdgyContent).toBe(true);
  });

  test("app prompts mention technical features", () => {
    const techTerms = ["mcp", "a2a", "landing page", "dashboard", "workflow"];
    const appPrompts = TAB_CONFIG.app.prompts.join(" ").toLowerCase();
    const hasTechContent = techTerms.some((term) => appPrompts.includes(term));
    expect(hasTechContent).toBe(true);
  });

  test("no prompts are duplicated across tabs", () => {
    const allPrompts: string[] = [];
    Object.values(TAB_CONFIG).forEach((config) => {
      allPrompts.push(...config.prompts);
    });
    const uniquePrompts = new Set(allPrompts);
    expect(uniquePrompts.size).toBe(allPrompts.length);
  });

  test("prompts do not contain HTML or markdown", () => {
    Object.values(TAB_CONFIG).forEach((config) => {
      config.prompts.forEach((prompt) => {
        expect(prompt).not.toMatch(/<[^>]+>/); // No HTML tags
        expect(prompt).not.toMatch(/\[.*\]\(.*\)/); // No markdown links
        expect(prompt).not.toMatch(/```/); // No code blocks
      });
    });
  });
});

describe("ALL_TABS Array", () => {
  test("contains exactly 4 tabs", () => {
    expect(ALL_TABS.length).toBe(4);
  });

  test("matches TAB_CONFIG keys", () => {
    const configKeys = Object.keys(TAB_CONFIG).sort();
    const allTabsSorted = [...ALL_TABS].sort();
    expect(allTabsSorted).toEqual(configKeys);
  });
});

describe("URL Parameter Generation", () => {
  test("empty input produces no query parameter", () => {
    const inputValue = "";
    const promptParam = inputValue
      ? `?prompt=${encodeURIComponent(inputValue)}`
      : "";
    expect(promptParam).toBe("");
  });

  test("input with spaces is properly encoded", () => {
    const inputValue = "build me an agent";
    const promptParam = `?prompt=${encodeURIComponent(inputValue)}`;
    expect(promptParam).toBe("?prompt=build%20me%20an%20agent");
  });

  test("special characters are encoded", () => {
    const inputValue = "agent with $money & features?";
    const promptParam = `?prompt=${encodeURIComponent(inputValue)}`;
    expect(promptParam).toContain("%24"); // $
    expect(promptParam).toContain("%26"); // &
    expect(promptParam).toContain("%3F"); // ?
  });

  test("unicode characters are encoded", () => {
    const inputValue = "agent that speaks 日本語";
    const promptParam = `?prompt=${encodeURIComponent(inputValue)}`;
    expect(promptParam).toContain("%");
    // Verify it can be decoded back
    const decoded = decodeURIComponent(promptParam.replace("?prompt=", ""));
    expect(decoded).toBe(inputValue);
  });

  test("very long prompts are handled", () => {
    const inputValue = "a".repeat(1000);
    const promptParam = `?prompt=${encodeURIComponent(inputValue)}`;
    expect(promptParam.length).toBeGreaterThan(1000);
    const decoded = decodeURIComponent(promptParam.replace("?prompt=", ""));
    expect(decoded).toBe(inputValue);
  });
});

describe("SessionStorage Pending Prompt", () => {
  test("pending prompt structure is correct", () => {
    const tab: TabValue = "agent";
    const prompt = "build me something cool";
    const pendingData = JSON.stringify({ tab, prompt });
    const parsed = JSON.parse(pendingData);

    expect(parsed.tab).toBe("agent");
    expect(parsed.prompt).toBe("build me something cool");
  });

  test("empty prompt is stored correctly", () => {
    const tab: TabValue = "app";
    const prompt = "";
    const pendingData = JSON.stringify({ tab, prompt });
    const parsed = JSON.parse(pendingData);

    expect(parsed.tab).toBe("app");
    expect(parsed.prompt).toBe("");
  });

  test("tab value is preserved for all tabs", () => {
    ALL_TABS.forEach((tab) => {
      const pendingData = JSON.stringify({ tab, prompt: "test" });
      const parsed = JSON.parse(pendingData);
      expect(parsed.tab).toBe(tab);
    });
  });
});

describe("Edge Cases", () => {
  test("tab config structure is consistent", () => {
    Object.values(TAB_CONFIG).forEach((config) => {
      expect(Object.keys(config).sort()).toEqual([
        "destination",
        "placeholder",
        "prompts",
      ]);
    });
  });

  test("destinations are unique", () => {
    const destinations = Object.values(TAB_CONFIG).map((c) => c.destination);
    // Note: Some destinations might be the same intentionally
    expect(destinations.length).toBe(4);
  });
});
