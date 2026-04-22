import { describe, expect, test } from "bun:test";
import { buildGatewayPreparedEntries, type GatewayCatalogModel } from "@/lib/services/ai-pricing";

describe("buildGatewayPreparedEntries", () => {
  test("image-generation language model: token rows use language, image generation stays image", () => {
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
});
