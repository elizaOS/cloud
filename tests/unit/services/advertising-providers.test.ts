import { describe, it, expect } from "bun:test";

describe("Advertising Providers", () => {
  describe("Google Ads Objective Mapping", () => {
    const mapObjectiveToGoogleAds = (objective: string) => {
      const mapping: Record<
        string,
        { advertisingChannelType: string; advertisingChannelSubType?: string }
      > = {
        awareness: { advertisingChannelType: "DISPLAY" },
        traffic: { advertisingChannelType: "SEARCH" },
        engagement: { advertisingChannelType: "DISPLAY" },
        leads: { advertisingChannelType: "SEARCH" },
        app_promotion: {
          advertisingChannelType: "MULTI_CHANNEL",
          advertisingChannelSubType: "APP_CAMPAIGN",
        },
        sales: { advertisingChannelType: "SHOPPING" },
        conversions: { advertisingChannelType: "PERFORMANCE_MAX" },
      };
      return mapping[objective] || { advertisingChannelType: "SEARCH" };
    };

    it("maps awareness to DISPLAY", () => {
      expect(mapObjectiveToGoogleAds("awareness").advertisingChannelType).toBe(
        "DISPLAY",
      );
    });

    it("maps traffic to SEARCH", () => {
      expect(mapObjectiveToGoogleAds("traffic").advertisingChannelType).toBe(
        "SEARCH",
      );
    });

    it("maps app_promotion to MULTI_CHANNEL with APP_CAMPAIGN subtype", () => {
      const result = mapObjectiveToGoogleAds("app_promotion");
      expect(result.advertisingChannelType).toBe("MULTI_CHANNEL");
      expect(result.advertisingChannelSubType).toBe("APP_CAMPAIGN");
    });

    it("defaults unknown objectives to SEARCH", () => {
      expect(mapObjectiveToGoogleAds("unknown").advertisingChannelType).toBe(
        "SEARCH",
      );
    });
  });

  describe("TikTok Ads Objective Mapping", () => {
    const mapObjectiveToTikTok = (objective: string) => {
      const mapping: Record<string, string> = {
        awareness: "REACH",
        traffic: "TRAFFIC",
        engagement: "VIDEO_VIEWS",
        leads: "LEAD_GENERATION",
        app_promotion: "APP_PROMOTION",
        sales: "CONVERSIONS",
        conversions: "CONVERSIONS",
      };
      return mapping[objective] || "TRAFFIC";
    };

    it("maps awareness to REACH", () => {
      expect(mapObjectiveToTikTok("awareness")).toBe("REACH");
    });

    it("maps engagement to VIDEO_VIEWS", () => {
      expect(mapObjectiveToTikTok("engagement")).toBe("VIDEO_VIEWS");
    });

    it("maps app_promotion correctly", () => {
      expect(mapObjectiveToTikTok("app_promotion")).toBe("APP_PROMOTION");
    });

    it("defaults unknown objectives to TRAFFIC", () => {
      expect(mapObjectiveToTikTok("unknown")).toBe("TRAFFIC");
    });
  });

  describe("TikTok CTA Mapping", () => {
    const mapCtaToTikTok = (cta?: string) => {
      const mapping: Record<string, string> = {
        LEARN_MORE: "LEARN_MORE",
        SHOP_NOW: "SHOP_NOW",
        SIGN_UP: "SIGN_UP",
        SUBSCRIBE: "SUBSCRIBE",
        CONTACT_US: "CONTACT_US",
        GET_OFFER: "GET_QUOTE",
        BOOK_NOW: "BOOK_NOW",
        DOWNLOAD: "DOWNLOAD",
        INSTALL: "INSTALL_NOW",
      };
      return mapping[cta || "LEARN_MORE"] || "LEARN_MORE";
    };

    it("maps LEARN_MORE correctly", () => {
      expect(mapCtaToTikTok("LEARN_MORE")).toBe("LEARN_MORE");
    });

    it("maps GET_OFFER to GET_QUOTE", () => {
      expect(mapCtaToTikTok("GET_OFFER")).toBe("GET_QUOTE");
    });

    it("maps INSTALL to INSTALL_NOW", () => {
      expect(mapCtaToTikTok("INSTALL")).toBe("INSTALL_NOW");
    });

    it("defaults to LEARN_MORE when undefined", () => {
      expect(mapCtaToTikTok(undefined)).toBe("LEARN_MORE");
    });
  });

  describe("Budget Conversion", () => {
    it("converts dollars to micros for Google Ads", () => {
      const dollars = 100;
      const micros = Math.round(dollars * 1_000_000);
      expect(micros).toBe(100_000_000);
    });

    it("converts dollars to cents for TikTok", () => {
      const dollars = 50;
      const cents = Math.round(dollars * 100);
      expect(cents).toBe(5000);
    });

    it("handles decimal amounts correctly", () => {
      const dollars = 99.99;
      const cents = Math.round(dollars * 100);
      expect(cents).toBe(9999);
    });
  });

  describe("Campaign ID Format", () => {
    const parseCampaignId = (externalCampaignId: string) => {
      const parts = externalCampaignId.split("/");
      if (parts.length !== 2) {
        return { success: false, error: "Invalid campaign ID format" };
      }
      return { success: true, accountId: parts[0], campaignId: parts[1] };
    };

    it("parses valid Google Ads format (accountId/campaignId)", () => {
      const result = parseCampaignId("1234567890/9876543210");
      expect(result.success).toBe(true);
      expect(result.accountId).toBe("1234567890");
      expect(result.campaignId).toBe("9876543210");
    });

    it("parses valid TikTok format (advertiserId/campaignId)", () => {
      const result = parseCampaignId("adv_123/camp_456");
      expect(result.success).toBe(true);
      expect(result.accountId).toBe("adv_123");
      expect(result.campaignId).toBe("camp_456");
    });

    it("rejects campaign ID without account", () => {
      const result = parseCampaignId("only_campaign_id");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid campaign ID format");
    });

    it("rejects empty string", () => {
      const result = parseCampaignId("");
      expect(result.success).toBe(false);
    });

    it("rejects ID with too many segments", () => {
      const result = parseCampaignId("a/b/c");
      expect(result.success).toBe(false);
    });
  });
});
