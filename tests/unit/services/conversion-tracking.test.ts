import { describe, it, expect } from "bun:test";
import { parseUTMParams, generateCampaignUrl } from "@/lib/services/conversion-tracking";

describe("Conversion Tracking", () => {
  describe("parseUTMParams", () => {
    it("parses UTM params from full URL", () => {
      const url = "https://example.com?utm_source=google&utm_medium=cpc&utm_campaign=summer2024";
      const params = parseUTMParams(url);

      expect(params.utm_source).toBe("google");
      expect(params.utm_medium).toBe("cpc");
      expect(params.utm_campaign).toBe("summer2024");
    });

    it("parses UTM params from query string only", () => {
      const queryString = "utm_source=facebook&utm_content=banner1";
      const params = parseUTMParams(queryString);

      expect(params.utm_source).toBe("facebook");
      expect(params.utm_content).toBe("banner1");
      expect(params.utm_medium).toBeUndefined();
    });

    it("parses UTM params from URLSearchParams", () => {
      const searchParams = new URLSearchParams("utm_source=twitter&utm_term=ai+tools");
      const params = parseUTMParams(searchParams);

      expect(params.utm_source).toBe("twitter");
      expect(params.utm_term).toBe("ai tools");
    });

    it("parses UTM params from Record object", () => {
      const record = { utm_source: "linkedin", utm_campaign: "b2b" };
      const params = parseUTMParams(record);

      expect(params.utm_source).toBe("linkedin");
      expect(params.utm_campaign).toBe("b2b");
    });

    it("returns undefined for missing params", () => {
      const params = parseUTMParams("other_param=value");

      expect(params.utm_source).toBeUndefined();
      expect(params.utm_medium).toBeUndefined();
      expect(params.utm_campaign).toBeUndefined();
    });
  });

  describe("generateCampaignUrl", () => {
    it("generates URL with required UTM params", () => {
      const url = generateCampaignUrl("https://app.example.com", "camp-123", "meta");

      expect(url).toContain("utm_source=meta");
      expect(url).toContain("utm_medium=cpc");
      expect(url).toContain("utm_campaign=camp-123");
    });

    it("includes optional content param", () => {
      const url = generateCampaignUrl("https://app.example.com", "camp-123", "google", {
        content: "creative-456",
      });

      expect(url).toContain("utm_content=creative-456");
    });

    it("includes optional term param", () => {
      const url = generateCampaignUrl("https://app.example.com", "camp-123", "google", {
        term: "ai assistant",
      });

      expect(url).toContain("utm_term=ai+assistant");
    });

    it("allows custom medium", () => {
      const url = generateCampaignUrl("https://app.example.com", "camp-123", "email", {
        medium: "newsletter",
      });

      expect(url).toContain("utm_medium=newsletter");
    });

    it("preserves existing query params", () => {
      const url = generateCampaignUrl("https://app.example.com?ref=homepage", "camp-123", "meta");

      expect(url).toContain("ref=homepage");
      expect(url).toContain("utm_source=meta");
    });
  });
});

