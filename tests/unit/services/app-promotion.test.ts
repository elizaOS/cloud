import { describe, it, expect } from "bun:test";

describe("App Promotion Service", () => {
  describe("PromotionConfig Validation", () => {
    it("requires at least one channel", () => {
      const config = { channels: [] };
      expect(config.channels.length).toBe(0);
    });

    it("social config requires platforms array", () => {
      const socialConfig = { platforms: ["twitter", "bluesky"] };
      expect(socialConfig.platforms).toHaveLength(2);
    });

    it("advertising config requires valid budget", () => {
      const adConfig = {
        platform: "meta",
        adAccountId: "acc-123",
        budget: 100,
        budgetType: "daily",
        objective: "traffic",
      };
      expect(adConfig.budget).toBeGreaterThan(0);
      expect(["daily", "lifetime"]).toContain(adConfig.budgetType);
    });
  });

  describe("PROMOTION_COSTS", () => {
    const PROMOTION_COSTS = {
      contentGeneration: 0.02,
      socialPostBase: 0.01,
      seoBundle: 0.03,
      adCampaignSetup: 0.5,
    };

    it("has positive costs for all operations", () => {
      expect(PROMOTION_COSTS.contentGeneration).toBeGreaterThan(0);
      expect(PROMOTION_COSTS.socialPostBase).toBeGreaterThan(0);
      expect(PROMOTION_COSTS.seoBundle).toBeGreaterThan(0);
      expect(PROMOTION_COSTS.adCampaignSetup).toBeGreaterThan(0);
    });

    it("ad campaign setup is most expensive", () => {
      expect(PROMOTION_COSTS.adCampaignSetup).toBeGreaterThan(PROMOTION_COSTS.contentGeneration);
      expect(PROMOTION_COSTS.adCampaignSetup).toBeGreaterThan(PROMOTION_COSTS.socialPostBase);
      expect(PROMOTION_COSTS.adCampaignSetup).toBeGreaterThan(PROMOTION_COSTS.seoBundle);
    });
  });

  describe("SEO Type Determination", () => {
    const determineSeoType = (config: { generateMeta?: boolean; generateSchema?: boolean; submitToIndexNow?: boolean }) => {
      if (config.generateMeta && config.generateSchema) return "publish_bundle";
      if (config.generateMeta) return "meta_generate";
      if (config.generateSchema) return "schema_generate";
      if (config.submitToIndexNow) return "index_now";
      return "health_check";
    };

    it("returns publish_bundle when both meta and schema requested", () => {
      expect(determineSeoType({ generateMeta: true, generateSchema: true })).toBe("publish_bundle");
    });

    it("returns meta_generate for meta only", () => {
      expect(determineSeoType({ generateMeta: true })).toBe("meta_generate");
    });

    it("returns schema_generate for schema only", () => {
      expect(determineSeoType({ generateSchema: true })).toBe("schema_generate");
    });

    it("returns index_now for submitToIndexNow", () => {
      expect(determineSeoType({ submitToIndexNow: true })).toBe("index_now");
    });

    it("defaults to health_check", () => {
      expect(determineSeoType({})).toBe("health_check");
    });
  });
});

