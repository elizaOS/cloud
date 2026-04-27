import { describe, expect, test } from "bun:test";
import {
  buildGatewayPreparedEntries,
  expandPricingCatalogModelCandidates,
  type GatewayCatalogModel,
  providerForPricingCandidate,
} from "@/lib/services/ai-pricing";
import { GATEWAY_PRICING_LEGACY_IDS_BY_TARGET } from "@/lib/services/ai-pricing-definitions";

describe("buildGatewayPreparedEntries", () => {
  test("regression: image-generation tag must not classify token input/output as image family", () => {
    const model: GatewayCatalogModel = {
      id: "google/gemini-2.5-flash-image",
      type: "language",
      tags: ["image-generation", "vision"],
      pricing: {
        input: "0.0000001",
        output: "0.0000002",
        image: "0.04",
      },
    };

    const entries = buildGatewayPreparedEntries(model);

    const inputRow = entries.find((e) => e.chargeType === "input");
    expect(inputRow).toBeDefined();
    expect(inputRow?.productFamily).toBe("language");
    expect(inputRow?.unit).toBe("token");

    const imageFlat = entries.find(
      (e) => e.productFamily === "image" && e.chargeType === "generation" && e.unit === "image",
    );
    expect(imageFlat).toBeDefined();
    expect(imageFlat?.unitPrice).toBe(0.04);
  });

  test("embedding model uses embedding family for token input", () => {
    const model: GatewayCatalogModel = {
      id: "alibaba/qwen3-embedding-4b",
      type: "embedding",
      tags: [],
      pricing: { input: "0.00000001" },
    };

    const entries = buildGatewayPreparedEntries(model);
    const inputRow = entries.find((e) => e.chargeType === "input");
    expect(inputRow?.productFamily).toBe("embedding");
  });

  test("web_search charge uses language family (not image) on image-generation models", () => {
    const model: GatewayCatalogModel = {
      id: "google/gemini-2.5-flash-image",
      type: "language",
      tags: ["image-generation", "vision"],
      pricing: { web_search: "5", input: "0.0000001" },
    };

    const entries = buildGatewayPreparedEntries(model);
    const ws = entries.find((e) => e.chargeType === "web_search");
    expect(ws?.productFamily).toBe("language");
    expect(ws?.unit).toBe("1k_requests");
  });
});

describe("providerForPricingCandidate", () => {
  test("uses prefix from canonical model id for cross-provider alias targets", () => {
    expect(providerForPricingCandidate("anthropic/claude-3-7-sonnet-20250219", "bedrock")).toBe(
      "anthropic",
    );
    expect(providerForPricingCandidate("vertex/gemini-2.0-flash", "google")).toBe("vertex");
  });

  test("falls back to request provider when model id has no slash", () => {
    expect(providerForPricingCandidate("some-legacy-id", "openai")).toBe("openai");
  });
});

describe("expandPricingCatalogModelCandidates", () => {
  test("forward gateway alias: legacy id gains current catalog target", () => {
    const ids = expandPricingCatalogModelCandidates("bedrock/claude-3-5-sonnet-20240620-v1");
    expect(ids[0]).toBe("bedrock/claude-3-5-sonnet-20240620-v1");
    expect(ids).toContain("anthropic/claude-3.7-sonnet");
  });

  test("reverse alias: catalog target includes legacy ids that map to it", () => {
    const ids = expandPricingCatalogModelCandidates("anthropic/claude-3.7-sonnet");
    expect(ids[0]).toBe("anthropic/claude-3.7-sonnet");
    expect(ids).toContain("bedrock/claude-3-5-sonnet-20240620-v1");
    expect(GATEWAY_PRICING_LEGACY_IDS_BY_TARGET["anthropic/claude-3.7-sonnet"]).toContain(
      "bedrock/claude-3-5-sonnet-20240620-v1",
    );
  });

  test("Anthropic dated snapshot suffix normalizes to stable catalog id", () => {
    const ids = expandPricingCatalogModelCandidates("anthropic/claude-sonnet-4-5-20250929");
    expect(ids).toContain("anthropic/claude-sonnet-4.5");
  });
});
