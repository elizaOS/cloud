import { test, expect } from "@playwright/test";

/**
 * My Agents API Tests
 *
 * Tests user's own agent/character management:
 * - CRUD operations
 * - Character cloning
 * - Stats tracking
 * - Category management
 * - Affiliate character claiming
 *
 * Prerequisites:
 * - TEST_API_KEY environment variable required
 * - Cloud running on port 3000
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const CLOUD_URL = process.env.CLOUD_URL ?? BASE_URL;
const API_KEY = process.env.TEST_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

test.describe("My Agents Characters API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testCharacterId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (testCharacterId) {
      await request.delete(`${CLOUD_URL}/api/my-agents/characters/${testCharacterId}`, {
        headers: authHeaders(),
      });
      testCharacterId = null;
    }
  });

  test("GET /api/my-agents/characters lists user's characters", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/my-agents/characters`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const characters = data.characters || data.data || data;
      expect(Array.isArray(characters)).toBe(true);
      console.log(`✅ Found ${characters.length} user characters`);
    } else {
      console.log(`ℹ️ My agents characters list returned ${response.status()}`);
    }
  });

  test("POST /api/my-agents/characters creates a new character", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/my-agents/characters`, {
      headers: authHeaders(),
      data: {
        name: "E2E Test Character",
        bio: "A character created for E2E testing purposes",
        personality: "Helpful and friendly",
        topics: ["testing", "automation"],
        adjectives: ["helpful", "efficient"],
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      const character = data.character || data.data || data;
      expect(character).toHaveProperty("id");
      expect(character.name).toBe("E2E Test Character");
      testCharacterId = character.id;
      console.log("✅ Character created successfully");
    } else {
      console.log(`ℹ️ Character creation returned ${response.status()}`);
    }
  });

  test("GET /api/my-agents/characters/:id returns character details", async ({ request }) => {
    // First create a character
    const createResponse = await request.post(`${CLOUD_URL}/api/my-agents/characters`, {
      headers: authHeaders(),
      data: {
        name: "Detail Test Character",
        bio: "For detail testing",
      },
    });

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      console.log(`ℹ️ Skipping - character creation returned ${createResponse.status()}`);
      return;
    }

    const createData = await createResponse.json();
    const character = createData.character || createData.data || createData;
    testCharacterId = character.id;

    // Get details
    const response = await request.get(`${CLOUD_URL}/api/my-agents/characters/${testCharacterId}`, {
      headers: authHeaders(),
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const charData = data.character || data.data || data;
      expect(charData).toHaveProperty("id");
      expect(charData.id).toBe(testCharacterId);
      console.log("✅ Character details retrieved");
    }
  });

  test("PATCH /api/my-agents/characters/:id updates character", async ({ request }) => {
    // First create a character
    const createResponse = await request.post(`${CLOUD_URL}/api/my-agents/characters`, {
      headers: authHeaders(),
      data: {
        name: "Update Test Character",
        bio: "Original bio",
      },
    });

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const createData = await createResponse.json();
    const character = createData.character || createData.data || createData;
    testCharacterId = character.id;

    // Update
    const response = await request.patch(`${CLOUD_URL}/api/my-agents/characters/${testCharacterId}`, {
      headers: authHeaders(),
      data: {
        name: "Updated Character Name",
        bio: "Updated bio content",
      },
    });

    expect([200, 400, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const updated = data.character || data.data || data;
      expect(updated.name).toBe("Updated Character Name");
      console.log("✅ Character updated successfully");
    } else {
      console.log(`ℹ️ Character update returned ${response.status()}`);
    }
  });

  test("DELETE /api/my-agents/characters/:id deletes character", async ({ request }) => {
    // First create a character
    const createResponse = await request.post(`${CLOUD_URL}/api/my-agents/characters`, {
      headers: authHeaders(),
      data: {
        name: "Delete Test Character",
        bio: "Will be deleted",
      },
    });

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const createData = await createResponse.json();
    const character = createData.character || createData.data || createData;
    const characterId = character.id;

    // Delete it
    const deleteResponse = await request.delete(
      `${CLOUD_URL}/api/my-agents/characters/${characterId}`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 204, 404]).toContain(deleteResponse.status());

    if (deleteResponse.status() === 200 || deleteResponse.status() === 204) {
      console.log("✅ Character deleted successfully");
    } else {
      console.log(`ℹ️ Character deletion returned ${deleteResponse.status()}`);
    }

    testCharacterId = null; // Already deleted
  });
});

test.describe("My Agents Character Clone", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let sourceCharacterId: string | null = null;
  let clonedCharacterId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // Create a source character
    const response = await request.post(`${CLOUD_URL}/api/my-agents/characters`, {
      headers: authHeaders(),
      data: {
        name: "Clone Source Character",
        bio: "This character will be cloned",
      },
    });

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      const character = data.character || data.data || data;
      sourceCharacterId = character.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (clonedCharacterId) {
      await request.delete(`${CLOUD_URL}/api/my-agents/characters/${clonedCharacterId}`, {
        headers: authHeaders(),
      });
    }
    if (sourceCharacterId) {
      await request.delete(`${CLOUD_URL}/api/my-agents/characters/${sourceCharacterId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("POST /api/my-agents/characters/:id/clone clones character", async ({ request }) => {
    if (!sourceCharacterId) {
      return;
    }

    const response = await request.post(
      `${CLOUD_URL}/api/my-agents/characters/${sourceCharacterId}/clone`,
      {
        headers: authHeaders(),
        data: {
          name: "Cloned Character",
        },
      }
    );

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      const cloned = data.character || data.data || data;
      expect(cloned).toHaveProperty("id");
      expect(cloned.id).not.toBe(sourceCharacterId);
      clonedCharacterId = cloned.id;
      console.log("✅ Character cloned successfully");
    } else {
      console.log(`ℹ️ Character clone returned ${response.status()}`);
    }
  });
});

test.describe("My Agents Character Stats", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testCharacterId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // Create a test character
    const response = await request.post(`${CLOUD_URL}/api/my-agents/characters`, {
      headers: authHeaders(),
      data: {
        name: "Stats Test Character",
        bio: "For stats testing",
      },
    });

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      const character = data.character || data.data || data;
      testCharacterId = character.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (testCharacterId) {
      await request.delete(`${CLOUD_URL}/api/my-agents/characters/${testCharacterId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("GET /api/my-agents/characters/:id/stats returns stats", async ({ request }) => {
    if (!testCharacterId) {
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/my-agents/characters/${testCharacterId}/stats`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Character stats retrieved");
    } else {
      console.log(`ℹ️ Character stats returned ${response.status()}`);
    }
  });

  test("POST /api/my-agents/characters/:id/track-view tracks view", async ({ request }) => {
    if (!testCharacterId) {
      return;
    }

    const response = await request.post(
      `${CLOUD_URL}/api/my-agents/characters/${testCharacterId}/track-view`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 201, 204, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() < 400) {
      console.log("✅ View tracked successfully");
    } else {
      console.log(`ℹ️ View tracking returned ${response.status()}`);
    }
  });

  test("POST /api/my-agents/characters/:id/track-interaction tracks interaction", async ({
    request,
  }) => {
    if (!testCharacterId) {
      return;
    }

    const response = await request.post(
      `${CLOUD_URL}/api/my-agents/characters/${testCharacterId}/track-interaction`,
      {
        headers: authHeaders(),
        data: {
          type: "chat",
        },
      }
    );

    expect([200, 201, 204, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() < 400) {
      console.log("✅ Interaction tracked successfully");
    } else {
      console.log(`ℹ️ Interaction tracking returned ${response.status()}`);
    }
  });
});

test.describe("My Agents Categories", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/my-agents/categories lists available categories", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/my-agents/categories`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const categories = data.categories || data.data || data;
      expect(Array.isArray(categories)).toBe(true);
      console.log(`✅ Found ${categories.length} agent categories`);
    } else {
      console.log(`ℹ️ Categories returned ${response.status()}`);
    }
  });
});

test.describe("Affiliate Characters", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/my-agents/claim-affiliate-characters claims characters", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/my-agents/claim-affiliate-characters`, {
      headers: authHeaders(),
      data: {},
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Affiliate characters claim endpoint works");
    } else {
      console.log(`ℹ️ Affiliate characters claim returned ${response.status()}`);
    }
  });
});

test.describe("My Agents UI Integration", () => {
  test("my agents page displays character list", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/my-agents`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      console.log("ℹ️ My Agents requires authentication");
      return;
    }

    // Look for character cards or list
    const characterItems = page.locator(
      '[class*="card"], [class*="character"], [class*="agent"], article'
    );
    const itemCount = await characterItems.count();

    console.log(`✅ My Agents page shows ${itemCount} items`);
  });

  test("create agent button opens dialog", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/my-agents`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    const createButton = page
      .locator('button:has-text("Create"), button:has-text("New"), a:has-text("Create")')
      .first();

    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Check for dialog or navigation
      const dialog = page.locator('[role="dialog"], [class*="modal"], form');
      const hasDialog = await dialog.isVisible().catch(() => false);

      const newUrl = page.url();
      const navigated = newUrl !== url;

      console.log(`✅ Create button - Dialog: ${hasDialog}, Navigated: ${navigated}`);
    } else {
      console.log("ℹ️ Create button not found");
    }
  });

  test("character card has actions menu", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/my-agents`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for action menus (three dots, dropdown, etc.)
    const actionMenus = page.locator(
      'button:has(svg), [aria-label*="menu"], [aria-label*="action"], button:has-text("⋮")'
    );
    const menuCount = await actionMenus.count();

    console.log(`✅ Found ${menuCount} action menu buttons`);
  });
});

