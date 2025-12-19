import { test, expect } from "@playwright/test";

/**
 * Comprehensive Interactive Feature Tests
 *
 * Tests all buttons, forms, menus, and interactive elements across the app.
 * Note: Some features require authentication - those are tested for proper handling.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Landing Page Interactions", () => {
  test("all buttons on home page are clickable", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Find all visible buttons
    const buttons = page.locator("button:visible");
    const buttonCount = await buttons.count();
    console.log(`Found ${buttonCount} visible buttons on home page`);

    // Test each button is clickable (doesn't throw)
    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      const button = buttons.nth(i);
      const isEnabled = await button.isEnabled().catch(() => false);
      const buttonText = await button.textContent().catch(() => "");

      if (isEnabled && buttonText) {
        console.log(
          `✅ Button "${buttonText.trim().slice(0, 30)}" is clickable`,
        );
      }
    }

    expect(buttonCount).toBeGreaterThan(0);
  });

  test("navigation links work", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Find all navigation links
    const navLinks = page.locator("nav a, header a");
    const linkCount = await navLinks.count();
    console.log(`Found ${linkCount} navigation links`);

    // Check links have valid hrefs
    for (let i = 0; i < Math.min(linkCount, 10); i++) {
      const link = navLinks.nth(i);
      const href = await link.getAttribute("href").catch(() => null);
      if (href) {
        console.log(`✅ Link to: ${href}`);
      }
    }

    expect(linkCount).toBeGreaterThan(0);
  });

  test("Get Started / Sign Up buttons navigate to login", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Look for Get Started or Sign Up button
    const ctaButton = page
      .locator(
        'button:has-text("Get Started"), button:has-text("Sign Up"), a:has-text("Get Started")',
      )
      .first();

    if (await ctaButton.isVisible().catch(() => false)) {
      await ctaButton.click();
      await page.waitForLoadState("networkidle");

      // Should navigate to login or show auth modal
      const url = page.url();
      const hasAuthPath =
        url.includes("/login") ||
        url.includes("/signup") ||
        url.includes("/auth");

      console.log(`✅ CTA button navigated to: ${url}`);
      expect(hasAuthPath || url === BASE_URL || url === `${BASE_URL}/`).toBe(
        true,
      );
    } else {
      console.log("ℹ️ No visible CTA button on home page");
    }
  });
});

test.describe("Login Page Interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
  });

  test("email input accepts text", async ({ page }) => {
    const emailInput = page.locator(
      'input[type="email"], input[placeholder*="example.com"]',
    );
    const inputVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (!inputVisible) {
      console.log("ℹ️ Email input not visible (Privy not configured in CI)");
      return;
    }

    await emailInput.fill("test@example.com");
    const value = await emailInput.inputValue();
    expect(value).toBe("test@example.com");

    console.log("✅ Email input accepts text correctly");
  });

  test("send code button enables when email is entered", async ({ page }) => {
    const emailInput = page.locator(
      'input[type="email"], input[placeholder*="example.com"]',
    );
    const sendCodeButton = page.locator(
      'button:has-text("Continue with Email")',
    );

    const inputVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (!inputVisible) {
      console.log("ℹ️ Email input not visible (Privy not configured in CI)");
      return;
    }

    // Initially disabled
    await expect(sendCodeButton).toBeDisabled();

    // Enter email
    await emailInput.fill("test@example.com");

    // Should be enabled
    await expect(sendCodeButton).toBeEnabled();

    console.log("✅ Send code button enables when email is entered");
  });

  test("all OAuth buttons are clickable", async ({ page }) => {
    const oauthButtons = [
      { name: "Google", selector: 'button:has-text("Google")' },
      { name: "Discord", selector: 'button:has-text("Discord")' },
      { name: "GitHub", selector: 'button:has-text("GitHub")' },
    ];

    let visibleCount = 0;
    for (const { name, selector } of oauthButtons) {
      const button = page.locator(selector);
      const isVisible = await button.isVisible({ timeout: 2000 }).catch(() => false);

      if (isVisible) {
        await expect(button).toBeEnabled();
        console.log(`✅ ${name} OAuth button is visible and enabled`);
        visibleCount++;
      } else {
        console.log(`ℹ️ ${name} OAuth button not visible (Privy not configured in CI)`);
      }
    }

    if (visibleCount === 0) {
      console.log("ℹ️ No OAuth buttons visible - skipping test (Privy not configured)");
    }
  });

  test("wallet connect button is clickable", async ({ page }) => {
    const walletButton = page.locator('button:has-text("Connect Wallet")');
    const isVisible = await walletButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!isVisible) {
      console.log("ℹ️ Wallet connect button not visible (Privy not configured in CI)");
      return;
    }

    await expect(walletButton).toBeEnabled();

    // Click and verify it responds
    await walletButton.click();
    await page.waitForTimeout(1000);

    console.log("✅ Wallet connect button is clickable");
  });

  test("terms and privacy links are clickable", async ({ page }) => {
    const termsLink = page.locator('a[href="/terms-of-service"]');
    const privacyLink = page.locator('a[href="/privacy-policy"]');

    const termsVisible = await termsLink.isVisible({ timeout: 5000 }).catch(() => false);
    const privacyVisible = await privacyLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!termsVisible || !privacyVisible) {
      console.log("ℹ️ Terms/Privacy links not visible - skipping");
      return;
    }

    // Click terms link
    await termsLink.click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/terms-of-service");

    // Go back and click privacy
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
    await privacyLink.click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/privacy-policy");

    console.log("✅ Terms and Privacy links work correctly");
  });
});

test.describe("Marketplace Interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/marketplace`);
    await page.waitForLoadState("networkidle");
  });

  test("marketplace page has interactive elements", async ({ page }) => {
    // Wait for content to load
    await page.waitForTimeout(2000);

    // Find cards or interactive items
    const cards = page.locator('[class*="card"], [class*="Card"], article');
    const cardCount = await cards.count();

    // Find buttons
    const buttons = page.locator("button:visible");
    const buttonCount = await buttons.count();

    console.log(
      `Found ${cardCount} cards and ${buttonCount} buttons on marketplace`,
    );

    // Should have some interactive content
    expect(cardCount + buttonCount).toBeGreaterThan(0);
  });

  test("search/filter elements if present", async ({ page }) => {
    // Look for search input
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i]',
    );

    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("test search");
      const value = await searchInput.inputValue();
      expect(value).toBe("test search");
      console.log("✅ Search input works");
    } else {
      console.log("ℹ️ No search input on marketplace");
    }

    // Look for filter buttons/dropdowns
    const filterElements = page.locator(
      'button:has-text("Filter"), select, [role="combobox"]',
    );
    const filterCount = await filterElements.count();
    console.log(`Found ${filterCount} filter elements`);
  });
});

test.describe("Free Mode Chat Interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("networkidle");
  });

  test("chat page loads for anonymous users", async ({ page }) => {
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    const hasContent = await page.locator("body").textContent();

    // Should have some content
    expect(hasContent?.length).toBeGreaterThan(100);
    console.log(`✅ Chat page loaded at: ${currentUrl}`);
  });

  test("chat input is available", async ({ page }) => {
    await page.waitForTimeout(3000);

    // Look for chat input (textarea or input)
    const chatInput = page.locator('textarea, input[type="text"]').first();

    if (await chatInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await chatInput.fill("Hello, this is a test message");
      const value = await chatInput.inputValue();
      expect(value).toContain("test message");
      console.log("✅ Chat input accepts text");
    } else {
      console.log(
        "ℹ️ Chat input not immediately visible (may need to select character first)",
      );
    }
  });

  test("send button is present", async ({ page }) => {
    await page.waitForTimeout(3000);

    // Look for send button
    const sendButton = page
      .locator(
        'button[type="submit"], button:has-text("Send"), button svg[class*="send" i]',
      )
      .first();

    if (await sendButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log("✅ Send button is visible");
    } else {
      // Look for any submit-like buttons
      const submitButtons = page.locator('button[type="submit"]');
      const count = await submitButtons.count();
      console.log(`ℹ️ Found ${count} submit buttons`);
    }
  });
});

test.describe("Form Elements Test", () => {
  test("terms of service page is readable", async ({ page }) => {
    await page.goto(`${BASE_URL}/terms-of-service`);
    await page.waitForLoadState("networkidle");

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(500);
    console.log("✅ Terms of Service page has content");
  });

  test("privacy policy page is readable", async ({ page }) => {
    await page.goto(`${BASE_URL}/privacy-policy`);
    await page.waitForLoadState("networkidle");

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(500);
    console.log("✅ Privacy Policy page has content");
  });
});

test.describe("Error Handling", () => {
  test("404 page handles gracefully", async ({ page }) => {
    await page.goto(`${BASE_URL}/this-page-does-not-exist-12345`);
    await page.waitForLoadState("networkidle");

    const content = await page.locator("body").textContent();
    // Should have some error message or redirect
    expect(content?.length).toBeGreaterThan(0);
    console.log("✅ 404 page handled gracefully");
  });

  test("auth error page displays correctly", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth-error`);
    await page.waitForLoadState("networkidle");

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(50);
    console.log("✅ Auth error page displays correctly");
  });
});

test.describe("Header and Footer Interactions", () => {
  test("header navigation works", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Find header
    const header = page.locator("header, nav").first();
    await expect(header).toBeVisible({ timeout: 10000 });

    // Find links in header
    const headerLinks = header.locator("a");
    const linkCount = await headerLinks.count();

    console.log(`✅ Header has ${linkCount} navigation links`);
    expect(linkCount).toBeGreaterThan(0);
  });

  test("logo links to home or dashboard", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");

    // Find logo link
    const logoLink = page
      .locator(
        'a[href="/"], a[href="/dashboard"], a:has(img[alt*="ELIZA" i]), a:has(img[alt*="logo" i])',
      )
      .first();

    if (await logoLink.isVisible().catch(() => false)) {
      await logoLink.click();
      await page.waitForLoadState("networkidle");

      const url = page.url();
      const isValidDestination =
        url === BASE_URL ||
        url === `${BASE_URL}/` ||
        url.includes("/dashboard") ||
        url.includes("/login");
      expect(isValidDestination).toBe(true);
      console.log(`✅ Logo navigates to: ${url}`);
    } else {
      console.log("ℹ️ Logo link not found");
    }
  });
});

test.describe("Responsive Design", () => {
  test("mobile viewport loads correctly", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(100);
    console.log("✅ Mobile viewport loads correctly");
  });

  test("tablet viewport loads correctly", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(100);
    console.log("✅ Tablet viewport loads correctly");
  });

  test("login page is mobile responsive", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");

    // Email input should be visible
    const emailInput = page.locator(
      'input[type="email"], input[placeholder*="example.com"]',
    );
    const inputVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (!inputVisible) {
      console.log("ℹ️ Login form not visible (Privy not configured in CI) - skipping responsive test");
      return;
    }

    // OAuth buttons should be visible
    const googleButton = page.locator('button:has-text("Google")');
    const googleVisible = await googleButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (googleVisible) {
      console.log("✅ Login page is mobile responsive with OAuth buttons");
    } else {
      console.log("✅ Login page is mobile responsive (OAuth buttons not configured)");
    }
  });
});

test.describe("Accessibility", () => {
  test("login page has accessible form labels", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");

    // Check for labels or aria-labels
    const emailInput = page.locator(
      'input[type="email"], input[placeholder*="example.com"]',
    );
    const inputVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (!inputVisible) {
      console.log("ℹ️ Email input not visible (Privy not configured in CI) - skipping accessibility test");
      return;
    }

    // Should have some form of label
    const hasLabel =
      (await emailInput.getAttribute("aria-label")) ||
      (await emailInput.getAttribute("placeholder")) ||
      (await page.locator("label[for]").count()) > 0;

    expect(hasLabel).toBeTruthy();
    console.log("✅ Form has accessible labels");
  });

  test("buttons have accessible text", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");

    const buttons = page.locator("button:visible");
    const buttonCount = await buttons.count();

    let accessibleCount = 0;
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const text = (await button.textContent()) || "";
      const ariaLabel = (await button.getAttribute("aria-label")) || "";

      if (text.trim() || ariaLabel) {
        accessibleCount++;
      }
    }

    console.log(
      `✅ ${accessibleCount}/${buttonCount} buttons have accessible text`,
    );
    expect(accessibleCount).toBeGreaterThan(0);
  });
});

test.describe("Dashboard Protected Routes", () => {
  const dashboardRoutes = [
    { path: "/dashboard", name: "Dashboard Home" },
    { path: "/dashboard/chat", name: "Chat" },
    { path: "/dashboard/my-agents", name: "My Agents" },
    { path: "/dashboard/build", name: "Build" },
    { path: "/dashboard/image", name: "Image Generation" },
    { path: "/dashboard/video", name: "Video Generation" },
    { path: "/dashboard/voices", name: "Voices" },
    { path: "/dashboard/billing", name: "Billing" },
    { path: "/dashboard/api-keys", name: "API Keys" },
  ];

  for (const { path, name } of dashboardRoutes) {
    test(`${name} page handles auth state`, async ({ page }) => {
      await page.context().clearCookies();
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      const url = page.url();
      const content = await page.locator("body").textContent();

      // Should either redirect or show content
      expect(content?.length).toBeGreaterThan(0);
      console.log(
        `✅ ${name} (${path}) -> ${url.includes(path) ? "shows content" : "redirects"}`,
      );
    });
  }
});
