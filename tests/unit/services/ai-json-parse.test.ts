import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { parseAiJson } from "@/lib/utils/ai-json-parse";

const TestSchema = z.object({
  name: z.string(),
  value: z.number(),
});

describe("AI JSON Parse", () => {
  describe("parseAiJson", () => {
    it("parses clean JSON", () => {
      const input = '{"name": "test", "value": 42}';
      const result = parseAiJson(input, TestSchema);

      expect(result.name).toBe("test");
      expect(result.value).toBe(42);
    });

    it("extracts JSON from markdown code fence", () => {
      const input = '```json\n{"name": "test", "value": 42}\n```';
      const result = parseAiJson(input, TestSchema);

      expect(result.name).toBe("test");
      expect(result.value).toBe(42);
    });

    it("extracts JSON from code fence without language", () => {
      const input = '```\n{"name": "test", "value": 42}\n```';
      const result = parseAiJson(input, TestSchema);

      expect(result.name).toBe("test");
      expect(result.value).toBe(42);
    });

    it("extracts JSON with surrounding text", () => {
      const input = 'Here is the result:\n{"name": "test", "value": 42}\nDone!';
      const result = parseAiJson(input, TestSchema);

      expect(result.name).toBe("test");
      expect(result.value).toBe(42);
    });

    it("throws on invalid JSON", () => {
      const input = '{"name": "test", value: 42}';

      expect(() => parseAiJson(input, TestSchema)).toThrow(
        "Invalid JSON from AI",
      );
    });

    it("throws on schema validation failure", () => {
      const input = '{"name": "test", "value": "not a number"}';

      expect(() => parseAiJson(input, TestSchema)).toThrow("validation failed");
    });

    it("throws when no JSON found", () => {
      const input = "Just some plain text with no JSON";

      expect(() => parseAiJson(input, TestSchema)).toThrow("No JSON found");
    });

    it("includes context in error message for validation failures", () => {
      const input = '{"name": 123, "value": "wrong"}';

      expect(() => parseAiJson(input, TestSchema, "test context")).toThrow(
        "test context",
      );
    });

    it("handles arrays", () => {
      const ArraySchema = z.array(z.string());
      const input = '["a", "b", "c"]';
      const result = parseAiJson(input, ArraySchema);

      expect(result).toEqual(["a", "b", "c"]);
    });

    it("handles nested objects", () => {
      const NestedSchema = z.object({
        outer: z.object({
          inner: z.string(),
        }),
      });
      const input = '{"outer": {"inner": "value"}}';
      const result = parseAiJson(input, NestedSchema);

      expect(result.outer.inner).toBe("value");
    });
  });
});
