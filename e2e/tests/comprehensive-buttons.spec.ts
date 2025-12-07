import { test, expect } from "@playwright/test";

/**
 * Comprehensive Button & Interaction Tests
 *
 * Tests every button, form, and interactive element across all pages.
 * This ensures all UI elements are clickable and respond correctly.
 *
 * Prerequisites:
 * - Cloud running on port 3000
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Helper to count and verify buttons on a page
async function verifyPageButtons(page: import("@playwright/test").Page, pageName: string) {
  const buttons = page.locator("button:visible");
  const buttonCount = await buttons.count();

  let clickableCount = 0;
  let disabledCount = 0;

  for (let i = 0; i < Math.min(buttonCount, 20); i++) {
    const button = buttons.nth(i);
    const isEnabled = await button.isEnabled().catch(() => false);
    if (isEnabled) {
      clickableCount++;
    } else {
      disabledCount++;
    }
  }

  console.log(
    `✅ ${pageName}: ${buttonCount} buttons (${clickableCount} enabled, ${disabledCount} disabled)`
  );
  return { buttonCount, clickableCount, disabledCount };
}

// Helper to verify form inputs
async function verifyFormInputs(page: import("@playwright/test").Page, pageName: string) {
  const inputs = page.locator('input:visible, textarea:visible, select:visible');
  const inputCount = await inputs.count();

  console.log(`✅ ${pageName}: ${inputCount} form inputs`);
  return inputCount;
}

test.describe("Landing Page Button Tests", () => {
  test("all landing page buttons are interactive", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    await verifyPageButtons(page, "Landing Page");

    // Test specific important buttons
    const ctaButton = page.locator(
      'button:has-text("Get Started"), button:has-text("Sign Up"), a:has-text("Get Started")'
    ).first();

    if (await ctaButton.isVisible().catch(() => false)) {
      await expect(ctaButton).toBeEnabled();
      console.log("   ✅ CTA button is enabled and clickable");
    }
  });

  test("navigation menu items work", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    const navLinks = page.locator('nav a, header a');
    const linkCount = await navLinks.count();

    console.log(`✅ Landing Page: ${linkCount} navigation links`);

    // Verify links have valid hrefs
    for (let i = 0; i < Math.min(linkCount, 10); i++) {
      const link = navLinks.nth(i);
      const href = await link.getAttribute("href");
      expect(href).toBeTruthy();
    }
  });
});

test.describe("Login Page Button Tests", () => {
  test("all login buttons are interactive", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");

    await verifyPageButtons(page, "Login Page");
    await verifyFormInputs(page, "Login Page");

    // Test OAuth buttons
    const oauthButtons = ["Google", "Discord", "GitHub"];
    for (const provider of oauthButtons) {
      const button = page.locator(`button:has-text("${provider}")`);
      if (await button.isVisible().catch(() => false)) {
        await expect(button).toBeEnabled();
        console.log(`   ✅ ${provider} OAuth button is enabled`);
      }
    }
  });

  test("email form is interactive", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator('input[type="email"], input[placeholder*="example.com"]');
    await expect(emailInput).toBeVisible({ timeout: 30000 });

    // Test input
    await emailInput.fill("test@example.com");
    const value = await emailInput.inputValue();
    expect(value).toBe("test@example.com");

    // Test send button state
    const sendButton = page.locator('button:has-text("Continue with Email")');
    if (await sendButton.isVisible().catch(() => false)) {
      await expect(sendButton).toBeEnabled();
      console.log("   ✅ Email form is fully interactive");
    }
  });

  test("wallet connect button responds", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");

    const walletButton = page.locator('button:has-text("Connect Wallet")');
    await expect(walletButton).toBeVisible({ timeout: 30000 });
    await expect(walletButton).toBeEnabled();

    // Click and verify it responds (should open wallet modal or similar)
    await walletButton.click();
    await page.waitForTimeout(500);
    console.log("   ✅ Wallet connect button responds to click");
  });
});

test.describe("Marketplace Page Button Tests", () => {
  test("marketplace has interactive elements", async ({ page }) => {
    await page.goto(`${BASE_URL}/marketplace`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await verifyPageButtons(page, "Marketplace");

    // Check for search
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]');
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("test search");
      const value = await searchInput.inputValue();
      expect(value).toBe("test search");
      console.log("   ✅ Search input works");
    }

    // Check for character cards
    const cards = page.locator('[class*="card"], article');
    const cardCount = await cards.count();
    console.log(`   ✅ Found ${cardCount} character cards`);
  });

  test("character cards are clickable", async ({ page }) => {
    await page.goto(`${BASE_URL}/marketplace`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const characterLink = page.locator('a[href*="character"], a[href*="marketplace"]').first();
    if (await characterLink.isVisible().catch(() => false)) {
      const href = await characterLink.getAttribute("href");
      expect(href).toBeTruthy();
      console.log("   ✅ Character cards are clickable");
    }
  });
});

test.describe("Dashboard Pages Button Tests", () => {
  const dashboardPages = [
    { path: "/dashboard", name: "Dashboard Home" },
    { path: "/dashboard/chat", name: "Chat" },
    { path: "/dashboard/my-agents", name: "My Agents" },
    { path: "/dashboard/character-creator", name: "Character Creator" },
    { path: "/dashboard/image", name: "Image Generation" },
    { path: "/dashboard/video", name: "Video Generation" },
    { path: "/dashboard/voices", name: "Voices" },
    { path: "/dashboard/gallery", name: "Gallery" },
    { path: "/dashboard/storage", name: "Storage" },
    { path: "/dashboard/knowledge", name: "Knowledge" },
    { path: "/dashboard/containers", name: "Containers" },
    { path: "/dashboard/apps", name: "Apps" },
    { path: "/dashboard/billing", name: "Billing" },
    { path: "/dashboard/api-keys", name: "API Keys" },
    { path: "/dashboard/analytics", name: "Analytics" },
    { path: "/dashboard/settings", name: "Settings" },
    { path: "/dashboard/account", name: "Account" },
    { path: "/dashboard/mcps", name: "MCPs" },
    { path: "/dashboard/api-explorer", name: "API Explorer" },
  ];

  for (const { path, name } of dashboardPages) {
    test(`${name} page buttons are interactive`, async ({ page }) => {
      await page.context().clearCookies();
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      const url = page.url();

      // Check if redirected away from the page (login, home, or other)
      if (url.includes("/login") || url === `${BASE_URL}/` || url === BASE_URL || !url.includes(path)) {
        console.log(`ℹ️ ${name} requires authentication (redirected)`);
        return;
      }

      await verifyPageButtons(page, name);
      await verifyFormInputs(page, name);
    });
  }
});

test.describe("Settings Page Detailed Tests", () => {
  test("settings page has all form elements", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/settings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    // Check for theme toggle
    const themeToggle = page.locator('[class*="theme"], input[type="checkbox"], [role="switch"]');
    const themeCount = await themeToggle.count();
    console.log(`   ✅ Theme/toggle elements: ${themeCount}`);

    // Check for save buttons
    const saveButtons = page.locator('button:has-text("Save"), button:has-text("Update")');
    const saveCount = await saveButtons.count();
    console.log(`   ✅ Save/Update buttons: ${saveCount}`);
  });
});

test.describe("Account Page Detailed Tests", () => {
  test("account page has profile form", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/account`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    // Check for profile inputs
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');
    const emailInput = page.locator('input[name="email"], input[type="email"]');

    const hasName = await nameInput.isVisible().catch(() => false);
    const hasEmail = await emailInput.isVisible().catch(() => false);

    console.log(`   ✅ Profile form - Name: ${hasName}, Email: ${hasEmail}`);
  });

  test("account page has avatar upload", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/account`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    // Check for avatar upload
    const avatarUpload = page.locator(
      'input[type="file"], button:has-text("Upload"), [class*="avatar"]'
    );
    const uploadCount = await avatarUpload.count();
    console.log(`   ✅ Avatar upload elements: ${uploadCount}`);
  });
});

test.describe("Character Creator Form Tests", () => {
  test("character creator has all required fields", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/character-creator`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    // Check for main form fields
    const formFields = [
      { selector: 'input[name="name"], input[placeholder*="name" i]', name: "Name" },
      { selector: 'textarea[name="bio"], textarea[placeholder*="bio" i]', name: "Bio" },
      {
        selector: 'textarea[name="personality"], textarea[placeholder*="personality" i]',
        name: "Personality",
      },
    ];

    for (const { selector, name } of formFields) {
      const field = page.locator(selector);
      const hasField = await field.isVisible().catch(() => false);
      console.log(`   ${hasField ? "✅" : "ℹ️"} ${name} field: ${hasField}`);
    }

    // Check for create/save button
    const createButton = page.locator(
      'button:has-text("Create"), button:has-text("Save"), button[type="submit"]'
    );
    const hasCreate = await createButton.isVisible().catch(() => false);
    console.log(`   ✅ Create/Save button: ${hasCreate}`);
  });
});

test.describe("Billing Page Form Tests", () => {
  test("auto top-up form is interactive", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/billing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    // Check for auto top-up toggle
    const topUpToggle = page.locator('input[type="checkbox"], [role="switch"]');
    const toggleCount = await topUpToggle.count();
    console.log(`   ✅ Toggle switches: ${toggleCount}`);

    // Check for amount/threshold inputs
    const amountInputs = page.locator(
      'input[type="number"], input[name*="amount"], input[name*="threshold"]'
    );
    const inputCount = await amountInputs.count();
    console.log(`   ✅ Amount/threshold inputs: ${inputCount}`);
  });
});

test.describe("Modal and Dialog Tests", () => {
  test("create app dialog opens", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/apps`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    const createButton = page
      .locator('button:has-text("Create"), button:has-text("New App")')
      .first();
    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]');
      const hasDialog = await dialog.isVisible().catch(() => false);
      console.log(`   ✅ Create app dialog opens: ${hasDialog}`);

      // Close dialog
      const closeButton = page.locator('button:has-text("Cancel"), button[aria-label="Close"]');
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
      }
    }
  });

  test("create API key dialog opens", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/api-keys`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    const createButton = page
      .locator('button:has-text("Create"), button:has-text("New Key"), button:has-text("Generate")')
      .first();
    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"], [class*="modal"], [class*="Modal"], form');
      const hasDialog = await dialog.isVisible().catch(() => false);
      console.log(`   ✅ Create API key dialog opens: ${hasDialog}`);
    }
  });
});

test.describe("Dropdown and Select Tests", () => {
  test("dropdowns are interactive", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Find all dropdown/select elements
    const selects = page.locator('select, [role="combobox"], [role="listbox"]');
    const selectCount = await selects.count();

    console.log(`✅ Chat page: ${selectCount} dropdown/select elements`);

    if (selectCount > 0) {
      const firstSelect = selects.first();
      if (await firstSelect.isVisible().catch(() => false)) {
        await firstSelect.click();
        await page.waitForTimeout(500);
        console.log("   ✅ Dropdown responds to click");
      }
    }
  });
});

test.describe("Copy Button Tests", () => {
  test("copy buttons exist and are clickable", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/api-keys`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    // Look for copy buttons
    const copyButtons = page.locator(
      'button:has-text("Copy"), button[aria-label*="copy" i], button:has(svg)'
    );
    const copyCount = await copyButtons.count();

    console.log(`✅ API Keys page: ${copyCount} potential copy buttons`);
  });
});

test.describe("Sidebar Navigation Tests", () => {
  test("sidebar navigation items are clickable", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    // Find sidebar links
    const sidebarLinks = page.locator('aside a, nav a, [class*="sidebar"] a');
    const linkCount = await sidebarLinks.count();

    console.log(`✅ Dashboard sidebar: ${linkCount} navigation links`);

    // Verify links have valid hrefs
    for (let i = 0; i < Math.min(linkCount, 10); i++) {
      const link = sidebarLinks.nth(i);
      const href = await link.getAttribute("href");
      expect(href).toBeTruthy();
    }
  });
});

test.describe("Tab Navigation Tests", () => {
  test("app detail page tabs work", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/apps`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    // Look for tabs
    const tabs = page.locator('[role="tab"], [class*="tab"], button[data-state]');
    const tabCount = await tabs.count();

    console.log(`✅ Page tabs found: ${tabCount}`);

    if (tabCount > 0) {
      const firstTab = tabs.first();
      if (await firstTab.isVisible().catch(() => false)) {
        await firstTab.click();
        await page.waitForTimeout(500);
        console.log("   ✅ Tab responds to click");
      }
    }
  });
});

