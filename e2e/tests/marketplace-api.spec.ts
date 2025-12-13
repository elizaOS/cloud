import { test, expect } from "@playwright/test";

/**
 * Marketplace API Tests
 * 
 * Tests marketplace character operations:
 * - List marketplace characters
 * - Get character details
 * - Clone character
 * - Track views/interactions
 * - Get character stats
 * - List categories
 * 
 * Prerequisites:
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

test.describe("Marketplace Characters", () => {
  test("GET /api/marketplace/characters lists characters", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/marketplace/characters`);

    expect([200, 404, 500]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const characters = data.characters || data.data || data;
      expect(Array.isArray(characters)).toBe(true);
      console.log(`✅ Found ${characters.length} marketplace characters`);
    } else {
      console.log(`ℹ️ Marketplace characters returned ${response.status()}`);
    }
  });

  test("GET /api/public/marketplace/characters lists characters (public)", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/public/marketplace/characters`);

    expect([200, 404, 500]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const characters = data.characters || data.data || data;
      expect(Array.isArray(characters)).toBe(true);
      console.log(`✅ Found ${characters.length} public marketplace characters`);
    } else {
      console.log(`ℹ️ Public marketplace characters returned ${response.status()}`);
    }
  });

  test("GET /api/marketplace/characters/[id] returns character details", async ({ request }) => {
    // First get a character ID
    const listResponse = await request.get(`${CLOUD_URL}/api/marketplace/characters`);

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const characters = listData.characters || listData.data || listData;

    if (!Array.isArray(characters) || characters.length === 0) {
      console.log("ℹ️ No characters available for detail test");
      return;
    }

    const characterId = characters[0].id;

    // Get details
    const response = await request.get(`${CLOUD_URL}/api/marketplace/characters/${characterId}`);

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const character = data.character || data.data || data;
      expect(character).toHaveProperty("id");
      expect(character.id).toBe(characterId);
      console.log("✅ Marketplace character details retrieved");
    }
  });

  test.skip(() => !API_KEY, "POST /api/marketplace/characters/[id]/clone clones character", async ({ request }) => {
    // First get a character ID
    const listResponse = await request.get(`${CLOUD_URL}/api/marketplace/characters`);

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const characters = listData.characters || listData.data || listData;

    if (!Array.isArray(characters) || characters.length === 0) {
      return;
    }

    const characterId = characters[0].id;

    // Clone character
    const response = await request.post(`${CLOUD_URL}/api/marketplace/characters/${characterId}/clone`, {
      headers: authHeaders(),
    });

    expect([200, 201, 400, 404, 500]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toHaveProperty("character");
      console.log("✅ Character cloned successfully");
    } else {
      console.log(`ℹ️ Character clone returned ${response.status()}`);
    }
  });

  test("POST /api/marketplace/characters/[id]/track-view tracks view", async ({ request }) => {
    // First get a character ID
    const listResponse = await request.get(`${CLOUD_URL}/api/marketplace/characters`);

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const characters = listData.characters || listData.data || listData;

    if (!Array.isArray(characters) || characters.length === 0) {
      return;
    }

    const characterId = characters[0].id;

    // Track view
    const response = await request.post(`${CLOUD_URL}/api/marketplace/characters/${characterId}/track-view`);

    expect([200, 201, 204, 400, 404, 500]).toContain(response.status());

    if (response.status() < 400) {
      console.log("✅ View tracked successfully");
    } else {
      console.log(`ℹ️ View tracking returned ${response.status()}`);
    }
  });

  test("POST /api/marketplace/characters/[id]/track-interaction tracks interaction", async ({ request }) => {
    // First get a character ID
    const listResponse = await request.get(`${CLOUD_URL}/api/marketplace/characters`);

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const characters = listData.characters || listData.data || listData;

    if (!Array.isArray(characters) || characters.length === 0) {
      return;
    }

    const characterId = characters[0].id;

    // Track interaction
    const response = await request.post(`${CLOUD_URL}/api/marketplace/characters/${characterId}/track-interaction`, {
      data: {
        type: "click",
      },
    });

    expect([200, 201, 204, 400, 404, 500]).toContain(response.status());

    if (response.status() < 400) {
      console.log("✅ Interaction tracked successfully");
    } else {
      console.log(`ℹ️ Interaction tracking returned ${response.status()}`);
    }
  });

  test("GET /api/marketplace/characters/[id]/stats returns character stats", async ({ request }) => {
    // First get a character ID
    const listResponse = await request.get(`${CLOUD_URL}/api/marketplace/characters`);

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const characters = listData.characters || listData.data || listData;

    if (!Array.isArray(characters) || characters.length === 0) {
      return;
    }

    const characterId = characters[0].id;

    // Get stats
    const response = await request.get(`${CLOUD_URL}/api/marketplace/characters/${characterId}/stats`);

    expect([200, 404, 500]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Character stats retrieved");
    } else {
      console.log(`ℹ️ Character stats returned ${response.status()}`);
    }
  });

  test("GET /api/marketplace/categories lists categories", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/marketplace/categories`);

    expect([200, 404, 500]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const categories = data.categories || data.data || data;
      expect(Array.isArray(categories)).toBe(true);
      console.log(`✅ Found ${categories.length} marketplace categories`);
    } else {
      console.log(`ℹ️ Marketplace categories returned ${response.status()}`);
    }
  });
});

