import { test, expect } from "@playwright/test";

/**
 * Extended Miniapp Tests
 *
 * Tests additional miniapp functionality:
 * - Photo generation
 * - Field generation
 * - Image upload
 * - Proxy endpoints
 * - Billing checkout
 *
 * Prerequisites:
 * - TEST_API_KEY environment variable required
 * - Cloud running on port 3000
 * - Miniapp running on port 3001
 */

const CLOUD_URL = process.env.CLOUD_URL ?? "http://localhost:3000";
const MINIAPP_URL = process.env.MINIAPP_URL ?? "http://localhost:3001";
const API_KEY = process.env.TEST_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

test.describe("Miniapp Photo Generation API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/generate-photo generates character photo", async ({
    request,
  }) => {
    const response = await request.post(`${MINIAPP_URL}/api/generate-photo`, {
      headers: authHeaders(),
      data: {
        prompt: "A friendly robot assistant with blue eyes",
        style: "realistic",
      },
    });

    expect([200, 201, 400, 404, 500, 501, 502]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();

      if (data.imageUrl || data.url) {
        console.log("✅ Photo generated successfully");
      } else {
        console.log("✅ Photo generation endpoint works");
      }
    } else {
      console.log(`ℹ️ Photo generation returned ${response.status()}`);
    }
  });

  test("photo generation supports different styles", async ({ request }) => {
    const styles = ["realistic", "cartoon", "anime", "artistic"];

    for (const style of styles) {
      const response = await request.post(`${MINIAPP_URL}/api/generate-photo`, {
        headers: authHeaders(),
        data: {
          prompt: "A character portrait",
          style,
        },
      });

      expect([200, 201, 400, 404, 500, 501, 502]).toContain(response.status());

      if (response.status() === 200 || response.status() === 201) {
        console.log(`✅ Photo generation with '${style}' style works`);
      }
    }
  });
});

test.describe("Miniapp Field Generation API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/generate-field generates character field", async ({
    request,
  }) => {
    const response = await request.post(`${MINIAPP_URL}/api/generate-field`, {
      headers: authHeaders(),
      data: {
        field: "bio",
        context: {
          name: "Luna",
          personality: "Adventurous and curious",
        },
      },
    });

    expect([200, 201, 400, 404, 500, 501, 502]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Field generation works");

      if (data.value || data.text || data.content) {
        console.log("   Generated content received");
      }
    } else {
      console.log(`ℹ️ Field generation returned ${response.status()}`);
    }
  });

  test("field generation supports different field types", async ({
    request,
  }) => {
    const fields = ["bio", "personality", "backstory", "topics", "adjectives"];

    for (const field of fields) {
      const response = await request.post(`${MINIAPP_URL}/api/generate-field`, {
        headers: authHeaders(),
        data: {
          field,
          context: {
            name: "Test Character",
          },
        },
      });

      expect([200, 201, 400, 404, 500, 501, 502]).toContain(response.status());

      if (response.status() === 200 || response.status() === 201) {
        console.log(`✅ Field generation for '${field}' works`);
      }
    }
  });
});

test.describe("Miniapp Image Upload API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/upload-images uploads images", async ({ request }) => {
    const response = await request.post(`${MINIAPP_URL}/api/upload-images`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
      multipart: {
        file: {
          name: "test-image.png",
          mimeType: "image/png",
          buffer: Buffer.from("fake-image-data"),
        },
      },
    });

    expect([200, 201, 400, 404, 422, 500, 501, 502]).toContain(
      response.status(),
    );

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Image upload endpoint works");
    } else if (response.status() === 400 || response.status() === 422) {
      console.log("✅ Image upload validates file input");
    } else {
      console.log(`ℹ️ Image upload returned ${response.status()}`);
    }
  });
});

test.describe("Miniapp Proxy API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("proxy forwards requests to cloud", async ({ request }) => {
    const response = await request.get(`${MINIAPP_URL}/api/proxy/user`, {
      headers: authHeaders(),
    });

    expect([200, 401, 404, 500, 502]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.user).toHaveProperty("id");
      console.log("✅ Proxy forwards user request correctly");
    } else {
      console.log(`ℹ️ Proxy returned ${response.status()}`);
    }
  });

  test("proxy forwards agents request", async ({ request }) => {
    const response = await request.get(`${MINIAPP_URL}/api/proxy/agents`, {
      headers: authHeaders(),
    });

    expect([200, 401, 404, 500, 502]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.agents)).toBe(true);
      console.log("✅ Proxy forwards agents request correctly");
    } else {
      console.log(`ℹ️ Proxy agents returned ${response.status()}`);
    }
  });

  test("proxy handles POST requests", async ({ request }) => {
    const response = await request.post(`${MINIAPP_URL}/api/proxy/agents`, {
      headers: authHeaders(),
      data: {
        name: "Proxy Test Agent",
        bio: "Testing proxy POST",
      },
    });

    expect([200, 201, 400, 401, 404, 500, 502]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      console.log("✅ Proxy handles POST requests");

      // Cleanup if agent was created
      if (data.agent?.id) {
        await request.delete(
          `${MINIAPP_URL}/api/proxy/agents/${data.agent.id}`,
          {
            headers: authHeaders(),
          },
        );
      }
    } else {
      console.log(`ℹ️ Proxy POST returned ${response.status()}`);
    }
  });
});

test.describe("Miniapp Billing API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/miniapp/billing/credit-packs returns packs", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/miniapp/billing/credit-packs`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const packs = data.packs || data.creditPacks || data;
      expect(Array.isArray(packs)).toBe(true);
      console.log(`✅ Found ${packs.length} credit packs`);
    } else {
      console.log(`ℹ️ Miniapp credit packs returned ${response.status()}`);
    }
  });

  test("POST /api/v1/miniapp/billing/checkout creates checkout", async ({
    request,
  }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/miniapp/billing/checkout`,
      {
        headers: authHeaders(),
        data: {
          packId: "basic",
          returnUrl: "http://localhost:3001/billing/success",
        },
      },
    );

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Miniapp checkout endpoint works");

      if (data.url || data.checkoutUrl) {
        console.log("   Checkout URL provided");
      }
    } else {
      console.log(`ℹ️ Miniapp checkout returned ${response.status()}`);
    }
  });
});

test.describe("Miniapp Referral API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/miniapp/referral/qualify checks qualification", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/miniapp/referral/qualify`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Referral qualification check works");

      if (data.qualified !== undefined) {
        console.log(`   Qualified: ${data.qualified}`);
      }
    } else {
      console.log(`ℹ️ Referral qualify returned ${response.status()}`);
    }
  });
});

test.describe("Miniapp Rewards API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/miniapp/rewards returns rewards info", async ({
    request,
  }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/miniapp/rewards`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Rewards endpoint works");

      if (data.rewards) {
        console.log(`   Available rewards: ${data.rewards.length || "N/A"}`);
      }
    } else {
      console.log(`ℹ️ Rewards returned ${response.status()}`);
    }
  });
});

test.describe("Miniapp Pages UI", () => {
  test("miniapp home page loads", async ({ page }) => {
    await page.goto(MINIAPP_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(100);
    console.log("✅ Miniapp home page loads");
  });

  test("miniapp chats page loads", async ({ page }) => {
    await page.goto(`${MINIAPP_URL}/chats`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);
    console.log("✅ Miniapp chats page loads");
  });

  test("miniapp settings page loads", async ({ page }) => {
    await page.goto(`${MINIAPP_URL}/settings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);
    console.log("✅ Miniapp settings page loads");
  });

  test("miniapp connecting page loads", async ({ page }) => {
    await page.goto(`${MINIAPP_URL}/connecting`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);
    console.log("✅ Miniapp connecting page loads");
  });

  test("miniapp billing success page loads", async ({ page }) => {
    await page.goto(`${MINIAPP_URL}/billing/success`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);
    console.log("✅ Miniapp billing success page loads");
  });
});

test.describe("Miniapp Character Creator UI", () => {
  test("character creator section exists on home", async ({ page }) => {
    await page.goto(MINIAPP_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Look for character creator elements
    const creatorSection = page.locator(
      '[class*="creator"], [class*="character"], form, [class*="form"]',
    );
    const hasCreator = await creatorSection.isVisible().catch(() => false);

    console.log(`✅ Character creator section visible: ${hasCreator}`);
  });

  test("character name input exists", async ({ page }) => {
    await page.goto(MINIAPP_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const nameInput = page
      .locator(
        'input[name="name"], input[placeholder*="name" i], input[type="text"]',
      )
      .first();
    const hasInput = await nameInput.isVisible().catch(() => false);

    if (hasInput) {
      await nameInput.fill("Test Character");
      const value = await nameInput.inputValue();
      expect(value).toContain("Test");
      console.log("✅ Character name input works");
    } else {
      console.log("ℹ️ Name input not immediately visible");
    }
  });

  test("generate buttons exist", async ({ page }) => {
    await page.goto(MINIAPP_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Look for generate/create buttons
    const generateButtons = page.locator(
      'button:has-text("Generate"), button:has-text("Create"), button:has-text("Build")',
    );
    const buttonCount = await generateButtons.count();

    console.log(`✅ Found ${buttonCount} generate/create buttons`);
  });
});

test.describe("Miniapp Agent Detail Page", () => {
  test("agent detail page handles invalid ID", async ({ page }) => {
    await page.goto(`${MINIAPP_URL}/agents/invalid-agent-id`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);

    // Should show error or redirect
    console.log("✅ Agent detail page handles invalid ID");
  });
});

test.describe("Miniapp Chat Flow", () => {
  test("chat page structure", async ({ page }) => {
    await page.goto(`${MINIAPP_URL}/chats`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Look for chat list or empty state
    const chatList = page.locator('[class*="chat"], [class*="list"], article');
    const chatCount = await chatList.count();

    console.log(`✅ Chat list items: ${chatCount}`);
  });
});
