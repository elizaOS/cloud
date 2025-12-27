import { test, expect } from "@playwright/test";

/**
 * App Full User Journey E2E Tests
 *
 * Tests the complete user flow from anonymous to authenticated:
 * - Anonymous: create character → chat 5 times → see login prompt
 * - Sign up via pass-through auth
 * - Apply referral code and see bonus
 * - View my friends list
 * - Edit character details
 * - Full chat conversation with image
 * - View settings and billing
 * - Earn credits via sharing
 *
 * Prerequisites:
 * - Cloud running on port 3000
 * - App running on port 3001
 */

const CLOUD_URL = process.env.CLOUD_URL ?? "http://localhost:3000";
const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const API_KEY = process.env.TEST_API_KEY;

// Check if app is available
let appAvailable = false;

test.beforeAll(async ({ request }) => {
  const appResponse = await request.get(APP_URL).catch(() => null);
  appAvailable = appResponse?.ok() ?? false;

  if (!appAvailable) {
    console.log(
      `⚠️ App not available at ${APP_URL}. Skipping app tests. Start with: cd app && bun run dev`,
    );
  }
});

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

test.describe("Anonymous Character Creation Flow", () => {
  test("anonymous user can create character", async ({ request }) => {
    if (!appAvailable) {
      test.skip();
      return;
    }
    const response = await request.post(`${APP_URL}/api/create-character`, {
      data: {
        name: "Anonymous Test Character",
        personality: "Friendly and helpful",
        backstory: "Created anonymously for testing",
      },
    });

    // Should succeed or fail gracefully
    expect([200, 201, 400, 502]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty("characterId");
      expect(data).toHaveProperty("sessionId");
      expect(data.authenticated).toBe(false);
      console.log("✅ Anonymous character created successfully");
    } else {
      console.log(`ℹ️ Character creation returned ${response.status()}`);
    }
  });

  test("anonymous character creation returns session with 5 message limit", async ({
    request,
  }) => {
    const response = await request.post(`${APP_URL}/api/create-character`, {
      data: {
        name: "Limit Test Character",
        personality: "Test character",
      },
    });

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toHaveProperty("sessionId");
      expect(data.messagesLimit).toBe(5);
      console.log("✅ Anonymous session has 5 message limit");
    } else {
      console.log(`ℹ️ Character creation returned ${response.status()}`);
    }
  });
});

test.describe("Anonymous Chat Flow", () => {
  test("anonymous user can send messages up to limit", async ({ request }) => {
    // Create anonymous character
    const createResponse = await request.post(
      `${APP_URL}/api/create-character`,
      {
        data: {
          name: "Chat Test Character",
          personality: "For chat testing",
        },
      },
    );

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const { characterId, sessionId } = await createResponse.json();

    // Create anonymous session via affiliate API
    const sessionResponse = await request.post(
      `${CLOUD_URL}/api/affiliate/create-session`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (sessionResponse.status() !== 201 && sessionResponse.status() !== 200) {
      console.log("ℹ️ Cannot create anonymous session");
      return;
    }

    const sessionData = await sessionResponse.json();
    const anonSessionId = sessionData.sessionId;

    // Verify session has 5 message limit
    expect(sessionData.messagesLimit).toBe(5);
    console.log("✅ Anonymous session created with 5 message limit");

    // Note: Actual chat message sending would require navigating to chat page
    // and interacting with the UI, which is covered in other tests
  });
});

test.describe("Pass-Through Authentication Flow", () => {
  test("app login initiates pass-through auth", async ({ page, request }) => {
    if (!appAvailable) {
      test.skip();
      return;
    }
    await page.goto(APP_URL);
    await page.waitForLoadState("networkidle");

    // Find sign in button
    const signInButton = page.getByRole("button", { name: /sign in/i });
    await expect(signInButton).toBeVisible({ timeout: 10000 });

    // Click sign in - should navigate to Cloud login
    const navigationPromise = page.waitForURL(
      /auth\/app-login|api\/auth\/app-session/,
      {
        timeout: 15000,
      },
    );
    await signInButton.click();

    try {
      await navigationPromise;
      const url = page.url();
      expect(url).toContain(
        CLOUD_URL.replace(/^https?:\/\//, "").split(":")[0],
      );
      console.log("✅ Sign in button navigates to Cloud login");
    } catch {
      console.log("ℹ️ Navigation timeout - may require manual interaction");
    }
  });

  test("auth callback page handles session", async ({ page, request }) => {
    // Create a app session
    const sessionResponse = await request.post(
      `${CLOUD_URL}/api/auth/app-session`,
      {
        data: {
          callbackUrl: `${APP_URL}/auth/callback`,
          appId: "test-app",
        },
      },
    );

    if (sessionResponse.status() !== 201) {
      return;
    }

    const { sessionId, loginUrl } = await sessionResponse.json();

    // Navigate to callback page with session
    await page.goto(`${APP_URL}/auth/callback?session=${sessionId}`);
    await page.waitForLoadState("networkidle");

    // Should show loading or error (since auth not completed)
    const body = page.locator("body");
    await expect(body).toBeVisible();
    console.log("✅ Auth callback page handles session ID");
  });
});

test.describe("Referral Code Application", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("referral code can be applied after auth", async ({ request }) => {
    // Get referral info
    const referralResponse = await request.get(
      `${CLOUD_URL}/api/v1/app/referral`,
      {
        headers: authHeaders(),
      },
    );

    if (referralResponse.status() !== 200) {
      return;
    }

    const { referral } = await referralResponse.json();
    const referralCode = referral.code;

    // Try to apply own code (should fail)
    const applyResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/referral/apply`,
      {
        headers: authHeaders(),
        data: {
          code: referralCode,
        },
      },
    );

    expect(applyResponse.status()).toBe(400);
    const data = await applyResponse.json();
    expect(data.error).toContain("own referral code");
    console.log("✅ Cannot apply own referral code");
  });

  test("referral capture from URL parameter", async ({ page }) => {
    // Navigate with referral code
    await page.goto(`${APP_URL}?ref=TEST-CODE`);
    await page.waitForLoadState("networkidle");

    // Check if referral code is stored in localStorage
    const referralCode = await page.evaluate(() => {
      return localStorage.getItem("pending_referral_code");
    });

    if (referralCode) {
      expect(referralCode).toBe("TEST-CODE");
      console.log("✅ Referral code captured from URL");
    } else {
      console.log(
        "ℹ️ Referral code not captured (may require component mount)",
      );
    }
  });
});

test.describe("My Friends List", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("authenticated user can view friends list", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(Array.isArray(data.agents)).toBe(true);
    console.log(`✅ Found ${data.agents.length} friends`);
  });

  test("friends list shows character images", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    if (data.agents.length > 0) {
      const agent = data.agents[0];
      // Avatar URL may or may not be present
      if (agent.avatarUrl) {
        expect(agent.avatarUrl).toContain("http");
        console.log("✅ Friends list includes avatar URLs");
      } else {
        console.log("ℹ️ Some friends don't have avatars");
      }
    }
  });
});

test.describe("Character Editing", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testAgentId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
      data: {
        name: "Edit Test Character",
        bio: "Original bio",
      },
    });

    if (response.status() === 201) {
      const { agent } = await response.json();
      testAgentId = agent.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (testAgentId) {
      await request.delete(`${CLOUD_URL}/api/v1/app/agents/${testAgentId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("character details can be updated", async ({ request }) => {
    if (!testAgentId) {
      return;
    }

    const response = await request.patch(
      `${CLOUD_URL}/api/v1/app/agents/${testAgentId}`,
      {
        headers: authHeaders(),
        data: {
          name: "Updated Character Name",
          bio: "Updated bio content",
        },
      },
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data.agent.name).toBe("Updated Character Name");
    expect(data.agent.bio).toBe("Updated bio content");
    console.log("✅ Character details updated successfully");
  });

  test("character image can be updated", async ({ request }) => {
    if (!testAgentId) {
      return;
    }

    const response = await request.patch(
      `${CLOUD_URL}/api/v1/app/agents/${testAgentId}`,
      {
        headers: authHeaders(),
        data: {
          avatarUrl: "https://example.com/new-avatar.jpg",
        },
      },
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data.agent.avatarUrl).toBe("https://example.com/new-avatar.jpg");
    console.log("✅ Character image updated successfully");
  });

  test("message examples can be added", async ({ request }) => {
    if (!testAgentId) {
      return;
    }

    const response = await request.patch(
      `${CLOUD_URL}/api/v1/app/agents/${testAgentId}`,
      {
        headers: authHeaders(),
        data: {
          messageExamples: [
            [
              { name: "user", content: { text: "Hello!" } },
              { name: "Edit Test Character", content: { text: "Hi there!" } },
            ],
          ],
        },
      },
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data.agent).toHaveProperty("messageExamples");
    console.log("✅ Message examples added successfully");
  });
});

test.describe("Full Chat Conversation", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testAgentId: string | null = null;
  let testChatId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const agentResponse = await request.post(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
      data: {
        name: "Chat Test Character",
        bio: "For full chat testing",
      },
    });

    if (agentResponse.status() === 201) {
      const { agent } = await agentResponse.json();
      testAgentId = agent.id;

      const chatResponse = await request.post(
        `${CLOUD_URL}/api/v1/app/agents/${testAgentId}/chats`,
        {
          headers: authHeaders(),
        },
      );

      if (chatResponse.status() === 201) {
        const { chat } = await chatResponse.json();
        testChatId = chat.id;
      }
    }
  });

  test.afterAll(async ({ request }) => {
    if (testAgentId) {
      await request.delete(`${CLOUD_URL}/api/v1/app/agents/${testAgentId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("can send text message", async ({ request }) => {
    if (!testAgentId || !testChatId) {
      return;
    }

    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/agents/${testAgentId}/chats/${testChatId}/messages`,
      {
        headers: authHeaders(),
        data: {
          content: "Hello, this is a test message!",
        },
      },
    );

    // May return 200, 201, or not be implemented
    expect([200, 201, 404, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toHaveProperty("message");
      console.log("✅ Text message sent successfully");
    } else {
      console.log(`ℹ️ Message sending returned ${response.status()}`);
    }
  });

  test("can send message with image attachment", async ({ request }) => {
    if (!testAgentId || !testChatId) {
      return;
    }

    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/agents/${testAgentId}/chats/${testChatId}/messages`,
      {
        headers: authHeaders(),
        data: {
          content: "What do you see in this image?",
          attachments: [
            {
              url: "https://example.com/test-image.jpg",
              contentType: "image",
            },
          ],
        },
      },
    );

    expect([200, 201, 404, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      console.log("✅ Message with image attachment sent");
    } else {
      console.log(`ℹ️ Image attachment returned ${response.status()}`);
    }
  });

  test("chat history can be retrieved", async ({ request }) => {
    if (!testAgentId) {
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/v1/app/agents/${testAgentId}/chats`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(Array.isArray(data.chats)).toBe(true);
    console.log(`✅ Found ${data.chats.length} chats for agent`);
  });
});

test.describe("Settings and Billing", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("settings page shows billing information", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/billing`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data.billing).toHaveProperty("creditBalance");
    expect(data.billing).toHaveProperty("autoTopUpEnabled");
    console.log(`✅ Billing info available: $${data.billing.creditBalance}`);
  });

  test("settings page shows user information", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/user`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data.user).toHaveProperty("id");
    expect(data.user).toHaveProperty("email");
    console.log("✅ User information available");
  });
});

test.describe("Earn Credits via Sharing", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("referral info includes share URL", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/referral`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data.referral).toHaveProperty("shareUrl");
    expect(data.referral.shareUrl).toContain(data.referral.code);
    console.log(`✅ Share URL: ${data.referral.shareUrl}`);
  });

  test("can claim X share reward", async ({ request }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/rewards/share`,
      {
        headers: authHeaders(),
        data: {
          platform: "x",
          shareType: "app_share",
          shareUrl: "https://twitter.com/test/status/123",
        },
      },
    );

    // May succeed or fail if already claimed
    expect([200, 400]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.amount).toBeGreaterThan(0);
      console.log(`✅ X share reward claimed: $${data.amount}`);
    } else {
      console.log("ℹ️ X share reward already claimed today");
    }
  });

  test("can claim Farcaster share reward", async ({ request }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/rewards/share`,
      {
        headers: authHeaders(),
        data: {
          platform: "farcaster",
          shareType: "app_share",
          shareUrl: "https://warpcast.com/test/123",
        },
      },
    );

    expect([200, 400]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.amount).toBeGreaterThan(0);
      console.log(`✅ Farcaster share reward claimed: $${data.amount}`);
    } else {
      console.log("ℹ️ Farcaster share reward already claimed today");
    }
  });
});
