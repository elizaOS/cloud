import { describe, expect, it } from "bun:test";
import {
  validateBudgetTokens,
  getThinkingConfig,
  buildThinkingParam,
  supportsExtendedThinking,
  type ThinkingConfig,
  type CharacterThinkingSettings,
} from "./src/lib/anthropic-thinking";

describe("anthropic-thinking", () => {
  describe("validateBudgetTokens", () => {
    it("returns default budget when undefined", () => {
      expect(validateBudgetTokens(undefined)).toBe(10000);
    });

    it("clamps to minimum budget", () => {
      expect(validateBudgetTokens(500)).toBe(1000);
      expect(validateBudgetTokens(0)).toBe(1000);
      expect(validateBudgetTokens(-100)).toBe(1000);
    });

    it("clamps to maximum budget", () => {
      expect(validateBudgetTokens(150000)).toBe(100000);
      expect(validateBudgetTokens(100001)).toBe(100000);
    });

    it("returns valid values within range", () => {
      expect(validateBudgetTokens(1000)).toBe(1000);
      expect(validateBudgetTokens(50000)).toBe(50000);
      expect(validateBudgetTokens(100000)).toBe(100000);
    });
  });

  describe("getThinkingConfig", () => {
    it("returns disabled config when settings undefined", () => {
      expect(getThinkingConfig(undefined)).toEqual({ enabled: false });
    });

    it("returns disabled config when anthropicThinking undefined", () => {
      expect(getThinkingConfig({})).toEqual({ enabled: false });
    });

    it("returns disabled config when enabled is false", () => {
      const settings: CharacterThinkingSettings = {
        anthropicThinking: { enabled: false },
      };
      expect(getThinkingConfig(settings)).toEqual({ enabled: false });
    });

    it("returns enabled config with default budget", () => {
      const settings: CharacterThinkingSettings = {
        anthropicThinking: { enabled: true },
      };
      expect(getThinkingConfig(settings)).toEqual({
        enabled: true,
        budgetTokens: 10000,
      });
    });

    it("returns enabled config with custom budget", () => {
      const settings: CharacterThinkingSettings = {
        anthropicThinking: { enabled: true, budgetTokens: 25000 },
      };
      expect(getThinkingConfig(settings)).toEqual({
        enabled: true,
        budgetTokens: 25000,
      });
    });

    it("validates and clamps budget tokens", () => {
      const settings: CharacterThinkingSettings = {
        anthropicThinking: { enabled: true, budgetTokens: 500 },
      };
      expect(getThinkingConfig(settings)).toEqual({
        enabled: true,
        budgetTokens: 1000,
      });
    });
  });

  describe("buildThinkingParam", () => {
    it("returns undefined when disabled", () => {
      const config: ThinkingConfig = { enabled: false };
      expect(buildThinkingParam(config)).toBeUndefined();
    });

    it("returns thinking param when enabled with budget", () => {
      const config: ThinkingConfig = { enabled: true, budgetTokens: 15000 };
      expect(buildThinkingParam(config)).toEqual({
        type: "enabled",
        budget_tokens: 15000,
      });
    });

    it("uses default budget when budgetTokens undefined", () => {
      const config: ThinkingConfig = { enabled: true };
      expect(buildThinkingParam(config)).toEqual({
        type: "enabled",
        budget_tokens: 10000,
      });
    });
  });

  describe("supportsExtendedThinking", () => {
    it("returns true for claude-3-5-sonnet models", () => {
      expect(supportsExtendedThinking("claude-3-5-sonnet-20241022")).toBe(true);
      expect(supportsExtendedThinking("claude-3-5-sonnet")).toBe(true);
      expect(supportsExtendedThinking("Claude-3-5-Sonnet")).toBe(true);
    });

    it("returns true for claude-3.5-sonnet models", () => {
      expect(supportsExtendedThinking("claude-3.5-sonnet")).toBe(true);
    });

    it("returns true for claude-3-opus models", () => {
      expect(supportsExtendedThinking("claude-3-opus-20240229")).toBe(true);
      expect(supportsExtendedThinking("claude-3-opus")).toBe(true);
      expect(supportsExtendedThinking("Claude-3-Opus")).toBe(true);
    });

    it("returns false for unsupported models", () => {
      expect(supportsExtendedThinking("claude-3-haiku")).toBe(false);
      expect(supportsExtendedThinking("claude-2")).toBe(false);
      expect(supportsExtendedThinking("gpt-4")).toBe(false);
      expect(supportsExtendedThinking("gemini-pro")).toBe(false);
    });
  });
});
