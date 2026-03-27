import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  anthropicThinkingProviderOptions,
  mergeProviderOptions,
  parseAnthropicCotBudgetFromEnv,
} from "@/lib/providers/anthropic-thinking";

describe("parseAnthropicCotBudgetFromEnv", () => {
  const key = "ANTHROPIC_COT_BUDGET";
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env[key];
    delete process.env[key];
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
  });

  test("unset and empty → null", () => {
    expect(parseAnthropicCotBudgetFromEnv({})).toBeNull();
    expect(parseAnthropicCotBudgetFromEnv({ [key]: "" })).toBeNull();
  });

  test("0 → null", () => {
    expect(parseAnthropicCotBudgetFromEnv({ [key]: "0" })).toBeNull();
  });

  test("positive integer → number", () => {
    expect(parseAnthropicCotBudgetFromEnv({ [key]: "1024" })).toBe(1024);
    expect(parseAnthropicCotBudgetFromEnv({ [key]: " 2048 " })).toBe(2048);
  });

  test("invalid non-empty throws", () => {
    expect(() => parseAnthropicCotBudgetFromEnv({ [key]: "abc" })).toThrow(/non-negative integer/);
    expect(() => parseAnthropicCotBudgetFromEnv({ [key]: "12.5" })).toThrow(/non-negative integer/);
    expect(() => parseAnthropicCotBudgetFromEnv({ [key]: "12x" })).toThrow(/non-negative integer/);
  });
});

describe("anthropicThinkingProviderOptions", () => {
  const key = "ANTHROPIC_COT_BUDGET";
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env[key];
    delete process.env[key];
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
  });

  test("non-anthropic model → {}", () => {
    expect(anthropicThinkingProviderOptions("gpt-4o", {})).toEqual({});
    expect(anthropicThinkingProviderOptions("openai/gpt-4o", { [key]: "1024" })).toEqual({});
  });

  test("anthropic model + budget → thinking enabled", () => {
    const env = { [key]: "1024" };
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
