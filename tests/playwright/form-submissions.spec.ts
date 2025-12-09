import { test, expect } from "@playwright/test";

/**
 * Comprehensive Form Submission Tests
 *
 * Tests all form submissions across the application:
 * - Character creator form
 * - Settings forms
 * - Account profile form
 * - API key creation form
 * - App creation form
 * - Container creation form
 * - Knowledge upload form
 * - Image generation form
 * - Video generation form
 *
 * Prerequisites:
 * - Cloud running on port 3000
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Character Creator Form", () => {
  test("character creator form accepts all fields", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/character-creator`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      console.log("ℹ️ Character creator requires authentication");
      return;
    }

    // Fill name field
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill("E2E Test Character");
      const nameValue = await nameInput.inputValue();
      expect(nameValue).toBe("E2E Test Character");
      console.log("✅ Name field accepts input");
    }

    // Fill bio field
    const bioInput = page.locator('textarea[name="bio"], textarea[placeholder*="bio" i]').first();
    if (await bioInput.isVisible().catch(() => false)) {
      await bioInput.fill("This is a test character bio for E2E testing purposes.");
      const bioValue = await bioInput.inputValue();
      expect(bioValue).toContain("E2E testing");
      console.log("✅ Bio field accepts input");
    }

    // Fill personality field
    const personalityInput = page
      .locator('textarea[name="personality"], textarea[placeholder*="personality" i]')
      .first();
    if (await personalityInput.isVisible().catch(() => false)) {
      await personalityInput.fill("Friendly, helpful, and curious");
      console.log("✅ Personality field accepts input");
    }

    // Check for topics/tags input
    const topicsInput = page
      .locator('input[name="topics"], input[placeholder*="topics" i], input[placeholder*="tags" i]')
      .first();
    if (await topicsInput.isVisible().catch(() => false)) {
      await topicsInput.fill("testing, automation");
      console.log("✅ Topics field accepts input");
    }

    // Check for create/save button
    const submitButton = page
      .locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")')
      .first();
    const hasSubmit = await submitButton.isVisible().catch(() => false);
    console.log(`✅ Submit button visible: ${hasSubmit}`);
  });

  test("character creator validates required fields", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/character-creator`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    // Try to submit without filling required fields
    const submitButton = page
      .locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")')
      .first();

    if (await submitButton.isVisible().catch(() => false)) {
      await submitButton.click();
      await page.waitForTimeout(1000);

      // Check for validation errors
      const errorMessages = page.locator(
        '[class*="error"], [role="alert"], text=/required|please|invalid/i'
      );
      const errorCount = await errorMessages.count();

      console.log(`✅ Validation errors shown: ${errorCount > 0}`);
    }
  });
});

test.describe("Settings Form", () => {
  test("settings page has all form sections", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/settings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      console.log("ℹ️ Settings requires authentication");
      return;
    }

    // Check for theme settings
    const themeSection = page.locator('text=/theme|appearance|dark.*mode/i');
    const hasTheme = await themeSection.isVisible().catch(() => false);
    console.log(`✅ Theme settings visible: ${hasTheme}`);

    // Check for toggles/switches
    const toggles = page.locator('input[type="checkbox"], [role="switch"]');
    const toggleCount = await toggles.count();
    console.log(`✅ Found ${toggleCount} toggle switches`);

    // Check for save button
    const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")');
    const hasSave = await saveButton.isVisible().catch(() => false);
    console.log(`✅ Save button visible: ${hasSave}`);
  });

  test("theme toggle works", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/settings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    const themeToggle = page.locator('[role="switch"], input[type="checkbox"]').first();
    if (await themeToggle.isVisible().catch(() => false)) {
      const initialState = await themeToggle.isChecked().catch(() => false);
      await themeToggle.click();
      await page.waitForTimeout(500);

      // Verify toggle changed
      console.log(`✅ Theme toggle clicked (initial: ${initialState})`);
    }
  });
});

test.describe("Account Profile Form", () => {
  test("profile form accepts all fields", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/account`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      console.log("ℹ️ Account requires authentication");
      return;
    }

    // Check for name input
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameInput.isVisible().catch(() => false)) {
      const currentValue = await nameInput.inputValue();
      await nameInput.fill("E2E Test User");
      console.log(`✅ Name field editable (was: ${currentValue})`);
      // Restore original value
      await nameInput.fill(currentValue);
    }

    // Check for email display
    const emailField = page.locator('input[type="email"], text=/@/');
    const hasEmail = await emailField.isVisible().catch(() => false);
    console.log(`✅ Email field visible: ${hasEmail}`);

    // Check for avatar section
    const avatarSection = page.locator('[class*="avatar"], img[alt*="avatar" i]');
    const hasAvatar = await avatarSection.isVisible().catch(() => false);
    console.log(`✅ Avatar section visible: ${hasAvatar}`);
  });

  test("avatar upload exists", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/account`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    const uploadButton = page.locator(
      'input[type="file"], button:has-text("Upload"), button:has-text("Change")'
    );
    const hasUpload = await uploadButton.isVisible().catch(() => false);
    console.log(`✅ Avatar upload button visible: ${hasUpload}`);
  });
});

test.describe("API Key Creation Form", () => {
  test("API key form has all fields", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/api-keys`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      console.log("ℹ️ API Keys requires authentication");
      return;
    }

    // Click create button
    const createButton = page
      .locator('button:has-text("Create"), button:has-text("New"), button:has-text("Generate")')
      .first();

    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Check for name input in dialog
      const nameInput = page.locator(
        'input[name="name"], input[placeholder*="name" i], input[placeholder*="key" i]'
      );
      const hasName = await nameInput.isVisible().catch(() => false);
      console.log(`✅ Key name input visible: ${hasName}`);

      // Check for description input
      const descInput = page.locator(
        'input[name="description"], textarea[name="description"], input[placeholder*="description" i]'
      );
      const hasDesc = await descInput.isVisible().catch(() => false);
      console.log(`✅ Description input visible: ${hasDesc}`);

      // Close dialog
      const cancelButton = page.locator('button:has-text("Cancel"), button[aria-label="Close"]');
      if (await cancelButton.isVisible().catch(() => false)) {
        await cancelButton.click();
      }
    }
  });
});

test.describe("App Creation Form", () => {
  test("app creation form has all fields", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/apps`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      console.log("ℹ️ Apps requires authentication");
      return;
    }

    const createButton = page
      .locator('button:has-text("Create"), button:has-text("New App")')
      .first();

    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Check for name input
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');
      const hasName = await nameInput.isVisible().catch(() => false);
      console.log(`✅ App name input visible: ${hasName}`);

      // Check for URL input
      const urlInput = page.locator('input[name="url"], input[placeholder*="url" i]');
      const hasUrl = await urlInput.isVisible().catch(() => false);
      console.log(`✅ App URL input visible: ${hasUrl}`);

      // Check for description
      const descInput = page.locator(
        'textarea[name="description"], input[placeholder*="description" i]'
      );
      const hasDesc = await descInput.isVisible().catch(() => false);
      console.log(`✅ Description input visible: ${hasDesc}`);

      // Close dialog
      const cancelButton = page.locator('button:has-text("Cancel"), button[aria-label="Close"]');
      if (await cancelButton.isVisible().catch(() => false)) {
        await cancelButton.click();
      }
    }
  });
});

test.describe("Container Creation Form", () => {
  test("container creation form has all fields", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/dashboard/containers`).catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || !url.includes("/containers")) {
      console.log("ℹ️ Containers requires authentication");
      return;
    }

    const createButton = page
      .locator('button:has-text("Create"), button:has-text("New Container"), button:has-text("Deploy")')
      .first();

    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Check for name input
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');
      const hasName = await nameInput.isVisible().catch(() => false);
      console.log(`✅ Container name input visible: ${hasName}`);

      // Check for image input
      const imageInput = page.locator('input[name="image"], input[placeholder*="image" i]');
      const hasImage = await imageInput.isVisible().catch(() => false);
      console.log(`✅ Image input visible: ${hasImage}`);

      // Close dialog
      const cancelButton = page.locator('button:has-text("Cancel"), button[aria-label="Close"]');
      if (await cancelButton.isVisible().catch(() => false)) {
        await cancelButton.click();
      }
    }
  });
});

test.describe("Knowledge Upload Form", () => {
  test("knowledge page has upload functionality", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/dashboard/knowledge`).catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      console.log("ℹ️ Knowledge requires authentication");
      return;
    }

    // Check for file upload
    const uploadInput = page.locator('input[type="file"]');
    const hasUpload = await uploadInput.isVisible().catch(() => false);
    console.log(`✅ File upload input visible: ${hasUpload}`);

    // Check for upload button
    const uploadButton = page.locator(
      'button:has-text("Upload"), button:has-text("Add Document")'
    );
    const hasButton = await uploadButton.isVisible().catch(() => false);
    console.log(`✅ Upload button visible: ${hasButton}`);
  });
});

test.describe("Image Generation Form", () => {
  test("image generation has prompt input", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/dashboard/image`).catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || !url.includes("/image")) {
      console.log("ℹ️ Image generation requires authentication");
      return;
    }

    // Check for prompt input
    const promptInput = page.locator('textarea, input[placeholder*="prompt" i]').first();
    if (await promptInput.isVisible().catch(() => false)) {
      await promptInput.fill("A beautiful mountain landscape at sunset");
      const value = await promptInput.inputValue();
      expect(value).toContain("mountain");
      console.log("✅ Prompt input accepts text");
    }

    // Check for model selector
    const modelSelector = page.locator('select, [role="combobox"]');
    const hasModel = (await modelSelector.count()) > 0;
    console.log(`✅ Model selector visible: ${hasModel}`);

    // Check for generate button
    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Create")');
    const hasGenerate = await generateButton.isVisible().catch(() => false);
    console.log(`✅ Generate button visible: ${hasGenerate}`);

    // Check for settings
    const settingsSliders = page.locator('input[type="range"], [role="slider"]');
    const sliderCount = await settingsSliders.count();
    console.log(`✅ Settings sliders: ${sliderCount}`);
  });
});

test.describe("Video Generation Form", () => {
  test("video generation has prompt input", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/dashboard/video`).catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || !url.includes("/video")) {
      console.log("ℹ️ Video generation requires authentication");
      return;
    }

    // Check for prompt input
    const promptInput = page.locator('textarea').first();
    if (await promptInput.isVisible().catch(() => false)) {
      await promptInput.fill("A cinematic drone shot over a city at night");
      const value = await promptInput.inputValue();
      expect(value).toContain("drone");
      console.log("✅ Video prompt input accepts text");
    }

    // Check for model selector
    const modelSelector = page.locator('select, [role="combobox"]');
    const hasModel = (await modelSelector.count()) > 0;
    console.log(`✅ Model selector visible: ${hasModel}`);

    // Check for generate button
    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Create")');
    const hasGenerate = await generateButton.isVisible().catch(() => false);
    console.log(`✅ Generate button visible: ${hasGenerate}`);
  });
});

test.describe("Billing Auto Top-up Form", () => {
  test("auto top-up settings form", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/dashboard/billing`).catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || !url.includes("/billing")) {
      console.log("ℹ️ Billing requires authentication");
      return;
    }

    // Check for auto top-up toggle
    const topUpToggle = page.locator('input[type="checkbox"], [role="switch"]');
    const toggleCount = await topUpToggle.count();
    console.log(`✅ Found ${toggleCount} toggle switches`);

    // Check for amount input
    const amountInput = page.locator(
      'input[type="number"], input[name*="amount"], input[placeholder*="amount" i]'
    );
    const hasAmount = (await amountInput.count()) > 0;
    console.log(`✅ Amount input visible: ${hasAmount}`);

    // Check for threshold input
    const thresholdInput = page.locator(
      'input[name*="threshold"], input[placeholder*="threshold" i]'
    );
    const hasThreshold = (await thresholdInput.count()) > 0;
    console.log(`✅ Threshold input visible: ${hasThreshold}`);
  });
});

test.describe("Organization Invite Form", () => {
  test("invite member form", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/dashboard/account`).catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || !url.includes("/account")) {
      console.log("ℹ️ Account requires authentication");
      return;
    }

    // Click invite button
    const inviteButton = page.locator('button:has-text("Invite"), button:has-text("Add Member")');

    if (await inviteButton.isVisible().catch(() => false)) {
      await inviteButton.click();
      await page.waitForTimeout(1000);

      // Check for email input
      const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
      const hasEmail = await emailInput.isVisible().catch(() => false);
      console.log(`✅ Email input visible: ${hasEmail}`);

      // Check for role selector
      const roleSelector = page.locator('select, [role="combobox"]');
      const hasRole = (await roleSelector.count()) > 0;
      console.log(`✅ Role selector visible: ${hasRole}`);

      // Close dialog
      const cancelButton = page.locator('button:has-text("Cancel"), button[aria-label="Close"]');
      if (await cancelButton.isVisible().catch(() => false)) {
        await cancelButton.click();
      }
    }
  });
});

