import { describe, test, expect } from "bun:test";

describe("Advertising Service", () => {
  test("exports required methods", async () => {
    const { advertisingService } = await import("@/lib/services/advertising");
    expect(advertisingService.getSupportedPlatforms).toBeDefined();
    expect(advertisingService.connectAccount).toBeDefined();
    expect(advertisingService.listAccounts).toBeDefined();
    expect(advertisingService.createCampaign).toBeDefined();
    expect(advertisingService.pauseCampaign).toBeDefined();
    expect(advertisingService.startCampaign).toBeDefined();
    expect(advertisingService.deleteCampaign).toBeDefined();
  });

  test("returns meta as supported platform", async () => {
    const { advertisingService } = await import("@/lib/services/advertising");
    const platforms = advertisingService.getSupportedPlatforms();
    expect(platforms).toContain("meta");
  });
});

describe("Meta Ads Provider", () => {
  test("exports provider with correct platform", async () => {
    const { metaAdsProvider } = await import("@/lib/services/advertising/providers/meta");
    expect(metaAdsProvider.platform).toBe("meta");
  });

  test("exports required methods", async () => {
    const { metaAdsProvider } = await import("@/lib/services/advertising/providers/meta");
    expect(metaAdsProvider.validateCredentials).toBeDefined();
    expect(metaAdsProvider.refreshToken).toBeDefined();
    expect(metaAdsProvider.listAdAccounts).toBeDefined();
    expect(metaAdsProvider.createCampaign).toBeDefined();
    expect(metaAdsProvider.pauseCampaign).toBeDefined();
    expect(metaAdsProvider.activateCampaign).toBeDefined();
  });

  test("refreshToken requires app credentials", async () => {
    const { metaAdsProvider } = await import("@/lib/services/advertising/providers/meta");
    const originalAppId = process.env.META_APP_ID;
    const originalAppSecret = process.env.META_APP_SECRET;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    
    await expect(metaAdsProvider.refreshToken("fake-token")).rejects.toThrow(
      "META_APP_ID and META_APP_SECRET required"
    );
    
    process.env.META_APP_ID = originalAppId;
    process.env.META_APP_SECRET = originalAppSecret;
  });

  test("rejects empty access token", async () => {
    const { metaAdsProvider } = await import("@/lib/services/advertising/providers/meta");
    const result = await metaAdsProvider.validateCredentials("");
    expect(result.valid).toBe(false);
  });
});

describe("Service Singletons", () => {
  test("advertising service is singleton", async () => {
    const { advertisingService: s1 } = await import("@/lib/services/advertising");
    const { advertisingService: s2 } = await import("@/lib/services/advertising");
    expect(s1).toBe(s2);
  });
});
