import { describe, expect, test } from "bun:test";

import {
  ANTHROPIC_WEB_SEARCH_INPUT_TOKEN_BUFFER,
  buildProviderNativeWebSearchTools,
  DEFAULT_ANTHROPIC_WEB_SEARCH_MAX_USES,
  isAnthropicWebSearchEnabled,
  supportsAnthropicWebSearch,
} from "@/lib/providers/anthropic-web-search";

describe("anthropic web search helpers", () => {
  test("supports allowlisted Anthropic models and dated variants", () => {
    expect(supportsAnthropicWebSearch("claude-sonnet-4-6")).toBe(true);
    expect(supportsAnthropicWebSearch("anthropic/claude-opus-4-6-20260301")).toBe(true);
    expect(supportsAnthropicWebSearch("claude-haiku-4-5")).toBe(false);
  });

  test("only enables web search for supported Anthropic models when explicitly requested", () => {
    expect(isAnthropicWebSearchEnabled("anthropic", "claude-sonnet-4-6", true)).toBe(true);
    expect(isAnthropicWebSearchEnabled("anthropic", "claude-sonnet-4-6", false)).toBe(false);
    expect(isAnthropicWebSearchEnabled("openai", "gpt-4o-mini", true)).toBe(false);
    expect(isAnthropicWebSearchEnabled("anthropic", "claude-haiku-4-5", true)).toBe(false);
  });

  test("builds Anthropic provider-native tools with the default maxUses", () => {
    const tools = buildProviderNativeWebSearchTools({
      provider: "anthropic",
      model: "anthropic/claude-sonnet-4-6",
      enabled: true,
    }) as { tools: { web_search: { type: string; id: string; args: { maxUses: number } } } };

    expect(tools.tools.web_search.type).toBe("provider");
    expect(tools.tools.web_search.id).toBe("anthropic.web_search_20260209");
    expect(tools.tools.web_search.args.maxUses).toBe(DEFAULT_ANTHROPIC_WEB_SEARCH_MAX_USES);
  });

  test("clamps requested maxUses and skips unsupported requests", () => {
    const disabled = buildProviderNativeWebSearchTools({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      enabled: false,
      maxUses: 99,
    });
    expect(disabled).toEqual({});

    const tools = buildProviderNativeWebSearchTools({
      provider: "anthropic",
      model: "claude-opus-4-6",
      enabled: true,
      maxUses: 99,
    }) as { tools: { web_search: { args: { maxUses: number } } } };
    expect(tools.tools.web_search.args.maxUses).toBe(10);
  });

  test("exports the reservation buffer used for search-enabled requests", () => {
    expect(ANTHROPIC_WEB_SEARCH_INPUT_TOKEN_BUFFER).toBe(10_000);
  });
});
