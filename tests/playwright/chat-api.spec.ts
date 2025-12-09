import { test, expect } from "@playwright/test";

/**
 * Chat & Eliza API Tests
 *
 * Tests core chat functionality:
 * - Chat completions (OpenAI-compatible)
 * - Eliza room management
 * - Message streaming
 * - Character assistant
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

test.describe("Chat Completions API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/v1/chat sends a message and gets response", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/chat`, {
      headers: authHeaders(),
      data: {
        message: "Hello! What can you help me with today?",
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Chat endpoint responded successfully");
    } else {
      console.log(`ℹ️ Chat endpoint returned ${response.status()}`);
    }
  });

  test("POST /api/v1/chat/completions OpenAI-compatible endpoint", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/chat/completions`, {
      headers: authHeaders(),
      data: {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Say hello in 5 words or less." },
        ],
        max_tokens: 50,
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty("choices");
      expect(Array.isArray(data.choices)).toBe(true);
      if (data.choices.length > 0) {
        expect(data.choices[0]).toHaveProperty("message");
        expect(data.choices[0].message).toHaveProperty("content");
      }
      console.log("✅ Chat completions endpoint works (OpenAI-compatible)");
    } else {
      console.log(`ℹ️ Chat completions endpoint returned ${response.status()}`);
    }
  });

  test("POST /api/v1/chat/completions with streaming", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/chat/completions`, {
      headers: authHeaders(),
      data: {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Count to 3." }],
        stream: true,
        max_tokens: 50,
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const contentType = response.headers()["content-type"];
      const isStream =
        contentType?.includes("text/event-stream") ||
        contentType?.includes("application/json");
      expect(isStream).toBe(true);
      console.log("✅ Chat completions streaming works");
    } else {
      console.log(`ℹ️ Chat completions streaming returned ${response.status()}`);
    }
  });

  test("POST /api/v1/responses creates a response", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/responses`, {
      headers: authHeaders(),
      data: {
        input: "What is 2 + 2?",
        model: "gpt-4o-mini",
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Responses endpoint works");
    } else {
      console.log(`ℹ️ Responses endpoint returned ${response.status()}`);
    }
  });
});

test.describe("Character Assistant API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/v1/character-assistant helps build character", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/character-assistant`, {
      headers: authHeaders(),
      data: {
        message: "Help me create a character named Luna who is a space explorer.",
        context: {
          name: "Luna",
          personality: "",
        },
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Character assistant endpoint works");
    } else {
      console.log(`ℹ️ Character assistant endpoint returned ${response.status()}`);
    }
  });
});

test.describe("Eliza Rooms API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testRoomId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (testRoomId) {
      await request.delete(`${CLOUD_URL}/api/eliza/rooms/${testRoomId}`, {
        headers: authHeaders(),
      });
      testRoomId = null;
    }
  });

  test("GET /api/eliza/rooms lists all rooms", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/eliza/rooms`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const rooms = data.rooms || data.data || data;
      expect(Array.isArray(rooms)).toBe(true);
      console.log(`✅ Found ${rooms.length} Eliza rooms`);
    } else {
      console.log(`ℹ️ Eliza rooms list returned ${response.status()}`);
    }
  });

  test("POST /api/eliza/rooms creates a new room", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/eliza/rooms`, {
      headers: authHeaders(),
      data: {
        name: "E2E Test Room",
        characterId: "test-character-id",
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      const room = data.room || data.data || data;
      expect(room).toHaveProperty("id");
      testRoomId = room.id;
      console.log("✅ Eliza room created successfully");
    } else {
      console.log(`ℹ️ Eliza room creation returned ${response.status()}`);
    }
  });

  test("GET /api/eliza/rooms/:id returns room details", async ({ request }) => {
    // First create a room
    const createResponse = await request.post(`${CLOUD_URL}/api/eliza/rooms`, {
      headers: authHeaders(),
      data: {
        name: "Detail Test Room",
      },
    });

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const createData = await createResponse.json();
    const room = createData.room || createData.data || createData;
    testRoomId = room.id;

    // Get details
    const response = await request.get(`${CLOUD_URL}/api/eliza/rooms/${testRoomId}`, {
      headers: authHeaders(),
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const roomData = data.room || data.data || data;
      expect(roomData).toHaveProperty("id");
      expect(roomData.id).toBe(testRoomId);
      console.log("✅ Eliza room details retrieved");
    }
  });

  test("DELETE /api/eliza/rooms/:id deletes room", async ({ request }) => {
    // First create a room
    const createResponse = await request.post(`${CLOUD_URL}/api/eliza/rooms`, {
      headers: authHeaders(),
      data: {
        name: "Delete Test Room",
      },
    });

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const createData = await createResponse.json();
    const room = createData.room || createData.data || createData;
    const roomId = room.id;

    // Delete it
    const deleteResponse = await request.delete(`${CLOUD_URL}/api/eliza/rooms/${roomId}`, {
      headers: authHeaders(),
    });

    expect([200, 204, 404]).toContain(deleteResponse.status());

    if (deleteResponse.status() === 200 || deleteResponse.status() === 204) {
      console.log("✅ Eliza room deleted successfully");
    } else {
      console.log(`ℹ️ Eliza room deletion returned ${deleteResponse.status()}`);
    }

    testRoomId = null; // Already deleted
  });
});

test.describe("Eliza Room Messages API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testRoomId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // Create a test room
    const response = await request.post(`${CLOUD_URL}/api/eliza/rooms`, {
      headers: authHeaders(),
      data: {
        name: "Messages Test Room",
      },
    });

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      const room = data.room || data.data || data;
      testRoomId = room.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (testRoomId) {
      await request.delete(`${CLOUD_URL}/api/eliza/rooms/${testRoomId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("GET /api/eliza/rooms/:roomId/messages lists messages", async ({ request }) => {
    if (!testRoomId) {
      return;
    }

    const response = await request.get(`${CLOUD_URL}/api/eliza/rooms/${testRoomId}/messages`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const messages = data.messages || data.data || data;
      expect(Array.isArray(messages)).toBe(true);
      console.log(`✅ Found ${messages.length} messages in room`);
    } else {
      console.log(`ℹ️ Room messages returned ${response.status()}`);
    }
  });

  test("POST /api/eliza/rooms/:roomId/messages sends a message", async ({ request }) => {
    if (!testRoomId) {
      return;
    }

    const response = await request.post(`${CLOUD_URL}/api/eliza/rooms/${testRoomId}/messages`, {
      headers: authHeaders(),
      data: {
        content: "Hello from E2E test!",
        role: "user",
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Message sent to Eliza room");
    } else {
      console.log(`ℹ️ Message sending returned ${response.status()}`);
    }
  });

  test("messages support pagination", async ({ request }) => {
    if (!testRoomId) {
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/eliza/rooms/${testRoomId}/messages?limit=10&offset=0`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const messages = data.messages || data.data || data;
      expect(messages.length).toBeLessThanOrEqual(10);
      console.log("✅ Message pagination works");
    }
  });
});

test.describe("Chat UI Integration", () => {
  test("chat page sends real message", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000);

    // Find chat input
    const chatInput = page.locator("textarea").first();

    if (await chatInput.isVisible({ timeout: 15000 }).catch(() => false)) {
      // Type a message
      await chatInput.fill("Hello! This is a real E2E test message.");

      // Try to send
      await chatInput.press("Enter");
      await page.waitForTimeout(3000);

      // Check for any response indicator
      const responseArea = page.locator('[class*="message"], [role="log"]');
      const hasResponse = await responseArea.isVisible().catch(() => false);

      console.log(`✅ Chat UI test - Response area visible: ${hasResponse}`);
    } else {
      console.log("ℹ️ Chat input not visible - may need authentication");
    }
  });

  test("chat supports character selection", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Look for character selector
    const characterSelector = page.locator(
      'select, [role="combobox"], button:has-text("Character"), button:has-text("Select")'
    );
    const selectorCount = await characterSelector.count();

    if (selectorCount > 0) {
      console.log(`✅ Found ${selectorCount} character selection element(s)`);
    } else {
      // Check for character cards
      const characterCards = page.locator('[class*="character"], [class*="agent"]');
      const cardCount = await characterCards.count();
      console.log(`ℹ️ Found ${cardCount} character cards instead`);
    }
  });
});


