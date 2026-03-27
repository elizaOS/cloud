import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  anthropicThinkingProviderOptions,
  mergeAnthropicCotProviderOptions,
  mergeGatewayGroqPreferenceWithAnthropicCot,
  mergeGoogleImageModalitiesWithAnthropicCot,
  mergeProviderOptions,
  parseAnthropicCotBudgetFromEnv,
  parseAnthropicCotBudgetMaxFromEnv,
  parseThinkingBudgetFromCharacterSettings,
  resolveAnthropicThinkingBudgetTokens,
} from "@/lib/providers/anthropic-thinking";

const COT_ENV_KEY = "ANTHROPIC_COT_BUDGET";
const COT_MAX_ENV_KEY = "ANTHROPIC_COT_BUDGET_MAX";

describe("resolveAnthropicThinkingBudgetTokens", () => {
  let prevBudget: string | undefined;
  let prevMax: string | undefined;

  beforeEach(() => {
    prevBudget = process.env[COT_ENV_KEY];
    prevMax = process.env[COT_MAX_ENV_KEY];
    delete process.env[COT_ENV_KEY];
    delete process.env[COT_MAX_ENV_KEY];
  });

  afterEach(() => {
    if (prevBudget === undefined) {
      delete process.env[COT_ENV_KEY];
    } else {
      process.env[COT_ENV_KEY] = prevBudget;
    }
    if (prevMax === undefined) {
      delete process.env[COT_MAX_ENV_KEY];
    } else {
      process.env[COT_MAX_ENV_KEY] = prevMax;
    }
  });

  test("returns null for non-Anthropic model", () => {
    const result = resolveAnthropicThinkingBudgetTokens("openai/gpt-4", {});
    expect(result).toBeNull();
  });

  test("returns null for Anthropic model that does not support extended thinking", () => {
    const result = resolveAnthropicThinkingBudgetTokens("anthropic/claude-3-haiku", {});
    expect(result).toBeNull();
  });

  test("uses per-agent budget when provided for supported Anthropic model", () => {
    const result = resolveAnthropicThinkingBudgetTokens(
      "anthropic/claude-sonnet-4",
      {},
      5000,
    );
    expect(result).toBe(5000);
  });

  test("returns null when per-agent budget is 0 (explicitly disabled)", () => {
    const result = resolveAnthropicThinkingBudgetTokens(
      "anthropic/claude-sonnet-4",
      { [COT_ENV_KEY]: "10000" },
      0,
    );
    expect(result).toBeNull();
  });

  test("falls back to env budget when per-agent budget is undefined", () => {
    const result = resolveAnthropicThinkingBudgetTokens(
      "anthropic/claude-sonnet-4",
      { [COT_ENV_KEY]: "8000" },
    );
    expect(result).toBe(8000);
  });

  test("returns null when both per-agent and env budgets are unset", () => {
    const result = resolveAnthropicThinkingBudgetTokens("anthropic/claude-sonnet-4", {});
    expect(result).toBeNull();
  });

  test("clamps budget to max cap when max is set and budget exceeds it", () => {
    const result = resolveAnthropicThinkingBudgetTokens(
      "anthropic/claude-sonnet-4",
      { [COT_MAX_ENV_KEY]: "3000" },
      5000,
    );
    expect(result).toBe(3000);
  });

  test("does not clamp budget when under max cap", () => {
    const result = resolveAnthropicThinkingBudgetTokens(
      "anthropic/claude-sonnet-4",
      { [COT_MAX_ENV_KEY]: "10000" },
      5000,
    );
    expect(result).toBe(5000);
  });

  test("clamps env fallback budget to max cap", () => {
    const result = resolveAnthropicThinkingBudgetTokens("anthropic/claude-sonnet-4", {
      [COT_ENV_KEY]: "15000",
      [COT_MAX_ENV_KEY]: "10000",
    });
    expect(result).toBe(10000);
  });
});



describe("anthropic COT env", () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env[COT_ENV_KEY];
    delete process.env[COT_ENV_KEY];
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env[COT_ENV_KEY];
    } else {
      process.env[COT_ENV_KEY] = prev;
    }
  });

  describe("parseAnthropicCotBudgetFromEnv", () => {
    test("unset and empty → null", () => {
      expect(parseAnthropicCotBudgetFromEnv({})).toBeNull();
      expect(parseAnthropicCotBudgetFromEnv({ [COT_ENV_KEY]: "" })).toBeNull();
    });

    test("0 → null", () => {
      expect(parseAnthropicCotBudgetFromEnv({ [COT_ENV_KEY]: "0" })).toBeNull();
    });

    test("positive integer → number", () => {
      expect(parseAnthropicCotBudgetFromEnv({ [COT_ENV_KEY]: "1024" })).toBe(1024);
      expect(parseAnthropicCotBudgetFromEnv({ [COT_ENV_KEY]: " 2048 " })).toBe(2048);
    });

    test("invalid non-empty throws", () => {
      expect(() => parseAnthropicCotBudgetFromEnv({ [COT_ENV_KEY]: "abc" })).toThrow(
        /non-negative integer/,
      );
      expect(() => parseAnthropicCotBudgetFromEnv({ [COT_ENV_KEY]: "12.5" })).toThrow(
        /non-negative integer/,
      );
      expect(() => parseAnthropicCotBudgetFromEnv({ [COT_ENV_KEY]: "12x" })).toThrow(
        /non-negative integer/,
      );
    });
  });

  describe("anthropicThinkingProviderOptions", () => {
    test("non-anthropic model → {}", () => {
      expect(anthropicThinkingProviderOptions("gpt-4o", {})).toEqual({});
      expect(anthropicThinkingProviderOptions("openai/gpt-4o", { [COT_ENV_KEY]: "1024" })).toEqual(
        {},
      );
    });

    test("anthropic model + budget → thinking enabled", () => {
      const env = { [COT_ENV_KEY]: "1024" };
      expect(anthropicThinkingProviderOptions("anthropic/claude-sonnet-4.5", env)).toEqual({
        providerOptions: {
          anthropic: { thinking: { type: "enabled", budgetTokens: 1024 } },
        },
      });
      expect(anthropicThinkingProviderOptions("claude-sonnet-4-5-20250929", env)).toEqual({
        providerOptions: {
          anthropic: { thinking: { type: "enabled", budgetTokens: 1024 } },
        },
      });
    });

    test("anthropic model + no budget → {}", () => {
      expect(anthropicThinkingProviderOptions("anthropic/claude-sonnet-4.5", {})).toEqual({});
    });

    test("per-agent 0 disables despite env default", () => {
      const env = { [COT_ENV_KEY]: "1024" };
      expect(anthropicThinkingProviderOptions("anthropic/claude-sonnet-4.5", env, 0)).toEqual({});
    });

    test("per-agent budget overrides env default", () => {
      const env = { [COT_ENV_KEY]: "1024" };
      expect(
        anthropicThinkingProviderOptions("anthropic/claude-sonnet-4.5", env, 2048),
      ).toEqual({
        providerOptions: {
          anthropic: { thinking: { type: "enabled", budgetTokens: 2048 } },
        },
      });
    });

    test("ANTHROPIC_COT_BUDGET_MAX clamps per-agent budget", () => {
      const env = { [COT_ENV_KEY]: "1024", [COT_MAX_ENV_KEY]: "500" };
      expect(
        anthropicThinkingProviderOptions("anthropic/claude-sonnet-4.5", env, 9000),
      ).toEqual({
        providerOptions: {
          anthropic: { thinking: { type: "enabled", budgetTokens: 500 } },
        },
      });
    });

    test("ANTHROPIC_COT_BUDGET_MAX clamps env default when no per-agent override", () => {
      const env = { [COT_ENV_KEY]: "9000", [COT_MAX_ENV_KEY]: "1000" };
      expect(anthropicThinkingProviderOptions("anthropic/claude-sonnet-4.5", env)).toEqual({
        providerOptions: {
          anthropic: { thinking: { type: "enabled", budgetTokens: 1000 } },
        },
      });
    });
  });

  describe("mergeAnthropicCotProviderOptions", () => {
    test("aliases mergeProviderOptions(undefined, anthropicThinking…)", () => {
      expect(mergeAnthropicCotProviderOptions("openai/gpt-4o", {})).toEqual({});
      const env = { [COT_ENV_KEY]: "1024" };
      expect(mergeAnthropicCotProviderOptions("anthropic/claude-sonnet-4.5", env)).toEqual(
        mergeProviderOptions(
          undefined,
          anthropicThinkingProviderOptions("anthropic/claude-sonnet-4.5", env),
        ),
      );
    });
  });

  describe("mergeGatewayGroqPreferenceWithAnthropicCot", () => {
    test("gateway order + anthropic when Claude + budget", () => {
      const env = { [COT_ENV_KEY]: "1024" };
      expect(mergeGatewayGroqPreferenceWithAnthropicCot("anthropic/claude-sonnet-4.5", env)).toEqual(
        mergeProviderOptions(
          { providerOptions: { gateway: { order: ["groq"] } } },
          anthropicThinkingProviderOptions("anthropic/claude-sonnet-4.5", env),
        ),
      );
    });
  });
});

describe("mergeGoogleImageModalitiesWithAnthropicCot", () => {
  test("matches explicit google merge + anthropic fragment", () => {
    expect(mergeGoogleImageModalitiesWithAnthropicCot("google/gemini-2.5-flash-image", {})).toEqual(
      mergeProviderOptions(
        { providerOptions: { google: { responseModalities: ["TEXT", "IMAGE"] } } },
        anthropicThinkingProviderOptions("google/gemini-2.5-flash-image", {}),
      ),
    );
  });
});

describe("parseAnthropicCotBudgetMaxFromEnv", () => {
  test("unset → null", () => {
    expect(parseAnthropicCotBudgetMaxFromEnv({})).toBeNull();
  });

  test("positive → cap", () => {
    expect(parseAnthropicCotBudgetMaxFromEnv({ [COT_MAX_ENV_KEY]: "8192" })).toBe(8192);
  });
});

describe("parseThinkingBudgetFromCharacterSettings", () => {
  test("missing or invalid → undefined", () => {
    expect(parseThinkingBudgetFromCharacterSettings(undefined)).toBeUndefined();
    expect(parseThinkingBudgetFromCharacterSettings({})).toBeUndefined();
    expect(
      parseThinkingBudgetFromCharacterSettings({
        anthropicThinkingBudgetTokens: "nope" as unknown as number,
      }),
    ).toBeUndefined();
  });

  test("integer ≥ 0", () => {
    expect(
      parseThinkingBudgetFromCharacterSettings({ anthropicThinkingBudgetTokens: 0 }),
    ).toBe(0);
    expect(
      parseThinkingBudgetFromCharacterSettings({ anthropicThinkingBudgetTokens: 42 }),
    ).toBe(42);
  });

  test("float input is truncated to integer", () => {
    expect(
      parseThinkingBudgetFromCharacterSettings({ anthropicThinkingBudgetTokens: 4000.9 }),
    ).toBe(4000);
    expect(
      parseThinkingBudgetFromCharacterSettings({ anthropicThinkingBudgetTokens: 1.1 }),
    ).toBe(1);
  });
});



describe("mergeProviderOptions", () => {
  test("empty + empty → {}", () => {
    expect(mergeProviderOptions(undefined, undefined)).toEqual({});
  });

  test("preserves google and adds anthropic", () => {
    const merged = mergeProviderOptions(
      { providerOptions: { google: { responseModalities: ["TEXT", "IMAGE"] } } },
      { providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: 512 } } } },
    );
    expect(merged).toEqual({
      providerOptions: {
        google: { responseModalities: ["TEXT", "IMAGE"] },
        anthropic: { thinking: { type: "enabled", budgetTokens: 512 } },
      },
    });
  });

  test("merges gateway.order with anthropic", () => {
    const merged = mergeProviderOptions(
      { providerOptions: { gateway: { order: ["groq"] } } },
      { providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: 1024 } } } },
    );
    expect(merged).toEqual({
      providerOptions: {
        gateway: { order: ["groq"] },
        anthropic: { thinking: { type: "enabled", budgetTokens: 1024 } },
      },
    });
  });

  test("both sides anthropic → later wins shallow fields", () => {
    const merged = mergeProviderOptions(
      { providerOptions: { anthropic: { sendReasoning: false } } },
      { providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: 100 } } } },
    );
    expect(merged.providerOptions.anthropic).toEqual({
      sendReasoning: false,
      thinking: { type: "enabled", budgetTokens: 100 },
    });
  });
});
