import { expect, test } from "@playwright/test";

const CLOUD_URL = process.env.CLOUD_URL ?? "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

test.describe("Referrals & Rewards API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test.describe("Referral Code", () => {
    test("GET /api/v1/miniapp/referral - should return referral code info", async ({
      request,
    }) => {
      const response = await request.get(
        `${CLOUD_URL}/api/v1/miniapp/referral`,
        {
          headers: authHeaders(),
        },
      );

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.referral).toBeDefined();
      expect(data.referral.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{6}$/);
      expect(data.referral.shareUrl).toContain(data.referral.code);
      expect(data.referral.stats).toBeDefined();
      expect(data.referral.stats.totalReferrals).toBeGreaterThanOrEqual(0);
      expect(data.referral.stats.totalEarnings).toBeGreaterThanOrEqual(0);
      expect(data.referral.rewards).toBeDefined();
      expect(data.referral.rewards.signupBonus).toBeGreaterThan(0);
      expect(data.referral.rewards.referredBonus).toBeGreaterThan(0);
      expect(data.referral.rewards.commissionRate).toBeGreaterThan(0);
    });

    test("GET /api/v1/miniapp/referral - should return consistent code", async ({
      request,
    }) => {
      const response1 = await request.get(
        `${CLOUD_URL}/api/v1/miniapp/referral`,
        {
          headers: authHeaders(),
        },
      );
      const data1 = await response1.json();

      const response2 = await request.get(
        `${CLOUD_URL}/api/v1/miniapp/referral`,
        {
          headers: authHeaders(),
        },
      );
      const data2 = await response2.json();

      expect(data1.referral.code).toBe(data2.referral.code);
    });

    test("POST /api/v1/miniapp/referral/apply - should reject own referral code", async ({
      request,
    }) => {
      // Get our own code
      const codeResponse = await request.get(
        `${CLOUD_URL}/api/v1/miniapp/referral`,
        {
          headers: authHeaders(),
        },
      );
      const { referral } = await codeResponse.json();

      // Try to apply our own code
      const response = await request.post(
        `${CLOUD_URL}/api/v1/miniapp/referral/apply`,
        {
          headers: authHeaders(),
          data: { code: referral.code },
        },
      );

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("own referral code");
    });

    test("POST /api/v1/miniapp/referral/apply - should reject invalid code", async ({
      request,
    }) => {
      const response = await request.post(
        `${CLOUD_URL}/api/v1/miniapp/referral/apply`,
        {
          headers: authHeaders(),
          data: { code: "INVALID-123456" },
        },
      );

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("Invalid");
    });

    test("POST /api/v1/miniapp/referral/apply - should reject empty code", async ({
      request,
    }) => {
      const response = await request.post(
        `${CLOUD_URL}/api/v1/miniapp/referral/apply`,
        {
          headers: authHeaders(),
          data: { code: "" },
        },
      );

      expect(response.status()).toBe(400);
    });

    test("POST /api/v1/miniapp/referral/qualify - should handle qualification", async ({
      request,
    }) => {
      // Call the qualify endpoint - it should work even if user wasn't referred
      const response = await request.post(
        `${CLOUD_URL}/api/v1/miniapp/referral/qualify`,
        {
          headers: authHeaders(),
        },
      );

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      // qualified will be false if user wasn't referred or already qualified
      expect(typeof data.qualified).toBe("boolean");
    });

    test("POST /api/v1/miniapp/referral/qualify - should require authentication", async ({
      request,
    }) => {
      const response = await request.post(
        `${CLOUD_URL}/api/v1/miniapp/referral/qualify`,
      );
      expect(response.status()).toBe(401);
    });
  });

  test.describe("Social Rewards", () => {
    test("GET /api/v1/miniapp/rewards - should return rewards status", async ({
      request,
    }) => {
      const response = await request.get(
        `${CLOUD_URL}/api/v1/miniapp/rewards`,
        {
          headers: authHeaders(),
        },
      );

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.rewards).toBeDefined();
      expect(data.rewards.sharing).toBeDefined();
      expect(data.rewards.sharing.status).toBeDefined();
      expect(data.rewards.sharing.status.x).toBeDefined();
      expect(data.rewards.sharing.status.farcaster).toBeDefined();
      expect(data.rewards.referrals).toBeDefined();
      expect(data.rewards.referrals.qualifiedEarnings).toBeGreaterThanOrEqual(
        0,
      );
      expect(data.rewards.rewardRates).toBeDefined();
      expect(data.rewards.rewardRates.shareX).toBeGreaterThan(0);
      expect(data.rewards.rewardRates.shareFarcaster).toBeGreaterThan(0);
      expect(data.rewards.rewardRates.qualifiedBonus).toBeGreaterThan(0);
    });

    test("POST /api/v1/miniapp/rewards/share - should claim X share reward", async ({
      request,
    }) => {
      const response = await request.post(
        `${CLOUD_URL}/api/v1/miniapp/rewards/share`,
        {
          headers: authHeaders(),
          data: {
            platform: "x",
            shareType: "app_share",
            shareUrl: "https://twitter.com/test/status/123",
          },
        },
      );

      expect(response.status()).toBe(200);
      const data = await response.json();

      // First claim should succeed
      if (data.success) {
        expect(data.amount).toBeGreaterThan(0);
        expect(data.message).toContain("earned");
      } else {
        // Already claimed today
        expect(data.error).toContain("already");
      }
    });

    test("POST /api/v1/miniapp/rewards/share - should reject duplicate claim same day", async ({
      request,
    }) => {
      // First claim
      await request.post(`${CLOUD_URL}/api/v1/miniapp/rewards/share`, {
        headers: authHeaders(),
        data: {
          platform: "farcaster",
          shareType: "app_share",
        },
      });

      // Second claim same day should fail with alreadyAwarded flag
      const response = await request.post(
        `${CLOUD_URL}/api/v1/miniapp/rewards/share`,
        {
          headers: authHeaders(),
          data: {
            platform: "farcaster",
            shareType: "app_share",
          },
        },
      );

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("already");
      expect(data.alreadyAwarded).toBe(true);
    });

    test("POST /api/v1/miniapp/rewards/share - should reject invalid platform", async ({
      request,
    }) => {
      const response = await request.post(
        `${CLOUD_URL}/api/v1/miniapp/rewards/share`,
        {
          headers: authHeaders(),
          data: {
            platform: "invalid_platform",
            shareType: "app_share",
          },
        },
      );

      expect(response.status()).toBe(400);
    });

    test("POST /api/v1/miniapp/rewards/share - should reject invalid share type", async ({
      request,
    }) => {
      const response = await request.post(
        `${CLOUD_URL}/api/v1/miniapp/rewards/share`,
        {
          headers: authHeaders(),
          data: {
            platform: "x",
            shareType: "invalid_type",
          },
        },
      );

      expect(response.status()).toBe(400);
    });

    test("POST /api/v1/miniapp/rewards/share - should handle concurrent requests (race condition protection)", async ({
      request,
    }) => {
      // Send 5 concurrent requests for telegram platform (less likely to be already claimed)
      const promises = Array.from({ length: 5 }, () =>
        request.post(`${CLOUD_URL}/api/v1/miniapp/rewards/share`, {
          headers: authHeaders(),
          data: {
            platform: "telegram",
            shareType: "app_share",
          },
        }),
      );

      const responses = await Promise.all(promises);
      const results = await Promise.all(responses.map((r) => r.json()));

      // Count successful claims
      const successCount = results.filter((r) => r.success === true).length;
      const alreadyAwardedCount = results.filter(
        (r) => r.alreadyAwarded === true,
      ).length;

      // At most ONE should succeed, rest should be rejected as already awarded
      // (Unless already claimed from a previous test run, then 0 succeed)
      expect(successCount).toBeLessThanOrEqual(1);

      // All responses should either be success or already awarded
      for (const result of results) {
        expect(result.success === true || result.alreadyAwarded === true).toBe(
          true,
        );
      }

      console.log(
        `✅ Race condition test: ${successCount} success, ${alreadyAwardedCount} already awarded`,
      );
    });

    test("GET /api/v1/miniapp/rewards - should reflect claimed status after share", async ({
      request,
    }) => {
      // First claim discord (least likely to be used in other tests)
      await request.post(`${CLOUD_URL}/api/v1/miniapp/rewards/share`, {
        headers: authHeaders(),
        data: {
          platform: "discord",
          shareType: "app_share",
        },
      });

      // Get rewards status
      const response = await request.get(
        `${CLOUD_URL}/api/v1/miniapp/rewards`,
        {
          headers: authHeaders(),
        },
      );

      expect(response.status()).toBe(200);
      const data = await response.json();

      // Discord should show as claimed
      expect(data.rewards.sharing.status.discord.claimed).toBe(true);

      console.log("✅ Rewards status correctly reflects claimed share");
    });
  });

  test.describe("Authentication", () => {
    test("GET /api/v1/miniapp/referral - should require authentication", async ({
      request,
    }) => {
      const response = await request.get(
        `${CLOUD_URL}/api/v1/miniapp/referral`,
      );
      expect(response.status()).toBe(401);
    });

    test("GET /api/v1/miniapp/rewards - should require authentication", async ({
      request,
    }) => {
      const response = await request.get(`${CLOUD_URL}/api/v1/miniapp/rewards`);
      expect(response.status()).toBe(401);
    });

    test("POST /api/v1/miniapp/rewards/share - should require authentication", async ({
      request,
    }) => {
      const response = await request.post(
        `${CLOUD_URL}/api/v1/miniapp/rewards/share`,
        {
          data: {
            platform: "x",
            shareType: "app_share",
          },
        },
      );
      expect(response.status()).toBe(401);
    });
  });
});
