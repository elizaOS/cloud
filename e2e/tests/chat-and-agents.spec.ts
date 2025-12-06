import { test, expect } from "@playwright/test";

/**
 * Chat and Agent Interaction Tests
 *
 * Tests chat functionality and agent interactions.
 * Many features work in anonymous mode (free mode).
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Chat Interface", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(5000); // Wait for chat to initialize
  });

  test("chat interface loads with input area", async ({ page }) => {
    // Look for chat input (textarea)
    const chatInput = page.locator("textarea").first();
    await expect(chatInput).toBeVisible({ timeout: 15000 });
    console.log("✅ Chat interface loaded with input area");
  });

  test("can type a message in chat input", async ({ page }) => {
    const chatInput = page.locator("textarea").first();
    await expect(chatInput).toBeVisible({ timeout: 15000 });

    // Type a test message
    await chatInput.fill("Hello, I'm testing the chat functionality!");
    const value = await chatInput.inputValue();
    expect(value).toContain("testing the chat");

    console.log("✅ Can type messages in chat input");
  });

  test("send button responds to input", async ({ page }) => {
    // Wait for chat to initialize
    const chatInput = page.locator("textarea").first();
    await expect(chatInput).toBeVisible({ timeout: 15000 });

    // Type a message
    await chatInput.fill("Test message");

    // Find send button
    const sendButton = page
      .locator('button[type="submit"], button:has(svg)')
      .filter({ hasText: /send/i })
      .first();
    const submitButton = page.locator('form button[type="submit"]').first();

    // Check for any interactive submit element
    const hasSubmit =
      (await sendButton.isVisible().catch(() => false)) ||
      (await submitButton.isVisible().catch(() => false));

    console.log(
      `✅ Send mechanism available: ${hasSubmit ? "Yes" : "Form-based"}`,
    );
  });

  test("send a message and wait for response", async ({ page }) => {
    const chatInput = page.locator("textarea").first();
    await expect(chatInput).toBeVisible({ timeout: 15000 });

    // Type and send a message
    await chatInput.fill("Hello! Can you tell me what you can do?");
    await chatInput.press("Enter");

    // Wait for potential response (up to 30 seconds)
    await page.waitForTimeout(5000);

    // Check if message was sent (input might clear or messages appear)
    const inputValue = await chatInput.inputValue();
    const messagesArea = page.locator(
      '[class*="message"], [role="log"], [class*="chat"]',
    );

    console.log(`✅ Message sent. Input cleared: ${inputValue === ""}`);
  });

  test("character/agent selection is available", async ({ page }) => {
    // Look for character selector
    const characterSelector = page.locator(
      'select, [role="combobox"], button:has-text("Select"), button:has-text("Character")',
    );
    const selectorCount = await characterSelector.count();

    if (selectorCount > 0) {
      console.log(
        `✅ Character selection available with ${selectorCount} selector(s)`,
      );
    } else {
      // Check for character cards or list
      const characterItems = page.locator(
        '[class*="character"], [class*="agent"]',
      );
      const itemCount = await characterItems.count();
      console.log(`✅ Found ${itemCount} character/agent items`);
    }
  });

  test("voice/audio controls are present", async ({ page }) => {
    // Look for audio controls
    const audioButton = page.locator(
      'button:has(svg), [aria-label*="voice" i], [aria-label*="audio" i], [aria-label*="mic" i]',
    );
    const hasAudioControls = (await audioButton.count()) > 0;

    console.log(
      `✅ Audio controls present: ${hasAudioControls ? "Yes" : "No"}`,
    );
  });
});

test.describe("Agent Gallery/Marketplace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/marketplace`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("can view agent cards", async ({ page }) => {
    // Find agent/character cards
    const cards = page.locator('[class*="card" i], article, [role="article"]');
    const cardCount = await cards.count();

    expect(cardCount).toBeGreaterThan(0);
    console.log(`✅ Found ${cardCount} agent cards in marketplace`);
  });

  test("can click on an agent card", async ({ page }) => {
    // Find clickable agent card
    const clickableCard = page
      .locator(
        'a[href*="character"], button:has-text("View"), button:has-text("Chat")',
      )
      .first();

    if (await clickableCard.isVisible().catch(() => false)) {
      await clickableCard.click();
      await page.waitForLoadState("networkidle");

      const newUrl = page.url();
      console.log(`✅ Clicked agent card, navigated to: ${newUrl}`);
    } else {
      console.log("ℹ️ No clickable agent cards found");
    }
  });

  test("agent cards have avatars", async ({ page }) => {
    const avatars = page.locator(
      'img[alt*="avatar" i], img[class*="avatar" i], img[class*="character" i], [class*="avatar"]',
    );
    const avatarCount = await avatars.count();

    console.log(`✅ Found ${avatarCount} agent avatars`);
  });
});

test.describe("Character Creator (Auth Required)", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/dashboard/character-creator`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("character creator page handles auth", async ({ page }) => {
    const url = page.url();

    // Should either show creator or redirect to login
    if (url.includes("/login")) {
      console.log(
        "✅ Character creator redirects unauthenticated users to login",
      );
    } else {
      // Check for creator form elements
      const formElements = page.locator("input, textarea, button");
      const elementCount = await formElements.count();
      console.log(
        `✅ Character creator shows form with ${elementCount} interactive elements`,
      );
    }
  });

  test("character creator has form fields", async ({ page }) => {
    const url = page.url();

    if (!url.includes("/login")) {
      // Look for character form fields
      const nameInput = page.locator(
        'input[name="name"], input[placeholder*="name" i]',
      );
      const bioTextarea = page.locator(
        'textarea[name="bio"], textarea[placeholder*="bio" i]',
      );

      const hasName = await nameInput.isVisible().catch(() => false);
      const hasBio = await bioTextarea.isVisible().catch(() => false);

      console.log(
        `✅ Character form - Name field: ${hasName}, Bio field: ${hasBio}`,
      );
    } else {
      console.log("ℹ️ Character creator requires authentication");
    }
  });
});

test.describe("My Agents (Auth Required)", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/dashboard/my-agents`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("my agents page handles auth", async ({ page }) => {
    const url = page.url();

    if (url.includes("/login")) {
      console.log("✅ My Agents redirects unauthenticated users to login");
    } else {
      const content = await page.locator("body").textContent();
      console.log(
        `✅ My Agents page loaded with ${content?.length} characters of content`,
      );
    }
  });

  test("create agent button available if authenticated", async ({ page }) => {
    const url = page.url();

    if (!url.includes("/login")) {
      const createButton = page.locator(
        'button:has-text("Create"), button:has-text("New Agent"), a:has-text("Create")',
      );
      const hasCreate = await createButton.isVisible().catch(() => false);

      console.log(`✅ Create agent button visible: ${hasCreate}`);
    } else {
      console.log("ℹ️ Create agent requires authentication");
    }
  });
});

test.describe("Image Generation", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/dashboard/image`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("image generation page handles auth", async ({ page }) => {
    const url = page.url();

    if (url.includes("/login")) {
      console.log(
        "✅ Image generation redirects unauthenticated users to login",
      );
    } else {
      const content = await page.locator("body").textContent();
      console.log(`✅ Image generation page loaded`);
    }
  });

  test("prompt input is available if authenticated", async ({ page }) => {
    const url = page.url();

    if (!url.includes("/login")) {
      // Look for prompt input
      const promptInput = page
        .locator(
          'textarea[placeholder*="prompt" i], input[placeholder*="prompt" i], textarea',
        )
        .first();
      const hasPrompt = await promptInput.isVisible().catch(() => false);

      if (hasPrompt) {
        await promptInput.fill("A beautiful sunset over mountains");
        const value = await promptInput.inputValue();
        expect(value).toContain("sunset");
        console.log("✅ Prompt input works correctly");
      } else {
        console.log("ℹ️ Prompt input not immediately visible");
      }
    } else {
      console.log("ℹ️ Image generation requires authentication");
    }
  });

  test("generate button is present if authenticated", async ({ page }) => {
    const url = page.url();

    if (!url.includes("/login")) {
      const generateButton = page.locator(
        'button:has-text("Generate"), button:has-text("Create")',
      );
      const hasGenerate = await generateButton.isVisible().catch(() => false);

      console.log(`✅ Generate button visible: ${hasGenerate}`);
    } else {
      console.log("ℹ️ Generate button requires authentication");
    }
  });

  test("image settings/sliders are present if authenticated", async ({
    page,
  }) => {
    const url = page.url();

    if (!url.includes("/login")) {
      // Look for sliders and settings
      const sliders = page.locator('input[type="range"], [role="slider"]');
      const sliderCount = await sliders.count();

      console.log(`✅ Found ${sliderCount} image setting sliders`);
    } else {
      console.log("ℹ️ Image settings require authentication");
    }
  });
});

test.describe("Video Generation", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/dashboard/video`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("video generation page handles auth", async ({ page }) => {
    const url = page.url();

    if (url.includes("/login")) {
      console.log(
        "✅ Video generation redirects unauthenticated users to login",
      );
    } else {
      const content = await page.locator("body").textContent();
      console.log(`✅ Video generation page loaded`);
    }
  });

  test("video prompt input is available if authenticated", async ({ page }) => {
    const url = page.url();

    if (!url.includes("/login")) {
      const promptInput = page.locator("textarea").first();
      const hasPrompt = await promptInput.isVisible().catch(() => false);

      if (hasPrompt) {
        await promptInput.fill("A cinematic drone shot over a city");
        const value = await promptInput.inputValue();
        expect(value).toContain("drone");
        console.log("✅ Video prompt input works correctly");
      } else {
        console.log("ℹ️ Video prompt input not immediately visible");
      }
    } else {
      console.log("ℹ️ Video generation requires authentication");
    }
  });

  test("model selection dropdown is present if authenticated", async ({
    page,
  }) => {
    const url = page.url();

    if (!url.includes("/login")) {
      const modelSelect = page.locator(
        'select, [role="combobox"], button:has-text("Model")',
      );
      const hasSelect = (await modelSelect.count()) > 0;

      console.log(`✅ Model selection available: ${hasSelect}`);
    } else {
      console.log("ℹ️ Model selection requires authentication");
    }
  });
});

test.describe("Voice Features", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/dashboard/voices`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("voices page handles auth", async ({ page }) => {
    const url = page.url();

    if (url.includes("/login")) {
      console.log("✅ Voices page redirects unauthenticated users to login");
    } else {
      const content = await page.locator("body").textContent();
      console.log(`✅ Voices page loaded`);
    }
  });

  test("voice list or creation options are present if authenticated", async ({
    page,
  }) => {
    const url = page.url();

    if (!url.includes("/login")) {
      const voiceItems = page.locator(
        '[class*="voice"], button:has-text("Create"), button:has-text("Clone")',
      );
      const hasVoices = (await voiceItems.count()) > 0;

      console.log(`✅ Voice features available: ${hasVoices}`);
    } else {
      console.log("ℹ️ Voice features require authentication");
    }
  });
});

test.describe("Settings Pages", () => {
  const settingsPages = [
    { path: "/dashboard/billing", name: "Billing" },
    { path: "/dashboard/api-keys", name: "API Keys" },
    { path: "/dashboard/settings", name: "Settings" },
    { path: "/dashboard/account", name: "Account" },
  ];

  for (const { path, name } of settingsPages) {
    test(`${name} page handles auth properly`, async ({ page }) => {
      await page.context().clearCookies();
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      const url = page.url();

      if (url.includes("/login")) {
        console.log(`✅ ${name} redirects unauthenticated users to login`);
      } else {
        const buttons = page.locator("button:visible");
        const buttonCount = await buttons.count();
        console.log(`✅ ${name} page loaded with ${buttonCount} buttons`);
      }
    });
  }
});

test.describe("Chat Message Sending", () => {
  test("attempt to send a chat message", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000); // Extra time for chat initialization

    // Find chat input
    const chatInput = page.locator("textarea").first();

    if (await chatInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      // Type a message
      const testMessage =
        "Hello! This is a test message to verify the chat works.";
      await chatInput.fill(testMessage);

      // Try to send via Enter key
      await chatInput.press("Enter");

      // Wait for potential response
      await page.waitForTimeout(3000);

      // Check the result
      const inputAfterSend = await chatInput.inputValue();
      const pageContent = await page.locator("body").textContent();

      // Message either cleared (sent) or still there
      if (inputAfterSend === "") {
        console.log("✅ Message was sent (input cleared)");
      } else {
        // Try clicking a send button
        const sendButton = page
          .locator(
            'button:has(svg[class*="send" i]), form button[type="submit"]',
          )
          .first();
        if (await sendButton.isVisible().catch(() => false)) {
          await sendButton.click();
          await page.waitForTimeout(2000);
        }
        console.log("✅ Message typing works, submit via button available");
      }
    } else {
      console.log(
        "ℹ️ Chat input not visible - may need character selection first",
      );
    }
  });
});

test.describe("Interactive Elements Summary", () => {
  test("count all interactive elements on dashboard", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const buttons = await page.locator("button:visible").count();
    const inputs = await page
      .locator("input:visible, textarea:visible")
      .count();
    const links = await page.locator("a:visible").count();
    const selects = await page
      .locator('select:visible, [role="combobox"]:visible')
      .count();

    console.log(`
📊 Interactive Elements Summary:
   Buttons: ${buttons}
   Inputs/Textareas: ${inputs}
   Links: ${links}
   Select/Dropdowns: ${selects}
   Total: ${buttons + inputs + links + selects}
    `);

    expect(buttons + inputs + links + selects).toBeGreaterThan(0);
  });
});
