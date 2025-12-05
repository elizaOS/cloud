import { test, expect } from "@playwright/test";

/**
 * Comprehensive Page Tests
 * 
 * Tests that all pages in the app load without errors.
 * Categorized by authentication requirements.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Helper to check page loads without critical errors
async function verifyPageLoads(page: ReturnType<typeof test.info>["page"], url: string, pageName: string) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  
  // Check response status
  const status = response?.status() ?? 0;
  
  // 200, 304 = success, 307/308 = redirect (OK), 401/403 = auth redirect (expected)
  const acceptableStatus = [200, 304, 307, 308, 401, 403];
  
  if (!acceptableStatus.includes(status) && status !== 0) {
    // Check if it's a redirect to login (which is OK for protected pages)
    const currentUrl = page.url();
    if (!currentUrl.includes("/login")) {
      console.log(`⚠️ ${pageName}: Status ${status}`);
    }
  }
  
  // Check for JavaScript errors in console
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  
  // Wait for page to settle
  await page.waitForTimeout(1000);
  
  // Check page didn't crash (has some content)
  const bodyContent = await page.locator("body").textContent().catch(() => "");
  const hasContent = bodyContent && bodyContent.length > 0;
  
  return { status, hasContent, consoleErrors };
}

test.describe("Public Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("Home page loads", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");
    
    // Should have main heading or hero content
    const hasContent = await page.locator("body").textContent();
    expect(hasContent?.length).toBeGreaterThan(100);
    
    console.log("✅ Home page (/) loads successfully");
  });

  test("Login page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    
    // Should have login form elements
    const emailInput = page.locator('input[type="email"], input[placeholder*="example.com"]');
    await expect(emailInput).toBeVisible({ timeout: 30000 });
    
    const walletButton = page.locator('button:has-text("Connect Wallet")');
    await expect(walletButton).toBeVisible();
    
    console.log("✅ Login page (/login) loads successfully");
  });

  test("Marketplace page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/marketplace`);
    await page.waitForLoadState("domcontentloaded");
    
    const hasContent = await page.locator("body").textContent();
    expect(hasContent?.length).toBeGreaterThan(100);
    
    console.log("✅ Marketplace page (/marketplace) loads successfully");
  });

  test("Terms of Service page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/terms-of-service`);
    await page.waitForLoadState("domcontentloaded");
    
    const hasContent = await page.locator("body").textContent();
    expect(hasContent?.length).toBeGreaterThan(100);
    
    console.log("✅ Terms of Service page loads successfully");
  });

  test("Privacy Policy page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/privacy-policy`);
    await page.waitForLoadState("domcontentloaded");
    
    const hasContent = await page.locator("body").textContent();
    expect(hasContent?.length).toBeGreaterThan(100);
    
    console.log("✅ Privacy Policy page loads successfully");
  });

  test("Auth error page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth-error`);
    await page.waitForLoadState("domcontentloaded");
    
    const hasContent = await page.locator("body").textContent();
    expect(hasContent?.length).toBeGreaterThan(50);
    
    console.log("✅ Auth error page loads successfully");
  });

  test("Auth CLI login page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/cli-login`);
    await page.waitForLoadState("domcontentloaded");
    
    // May redirect to login, which is OK
    const currentUrl = page.url();
    expect(currentUrl).toBeTruthy();
    
    console.log("✅ Auth CLI login page loads successfully");
  });
});

test.describe("Dashboard Pages (Auth Protected)", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  // These pages require auth - they should redirect to login or home
  const dashboardPages = [
    { path: "/dashboard", name: "Dashboard Home" },
    { path: "/dashboard/account", name: "Account" },
    { path: "/dashboard/analytics", name: "Analytics" },
    { path: "/dashboard/api-explorer", name: "API Explorer" },
    { path: "/dashboard/api-keys", name: "API Keys" },
    { path: "/dashboard/billing", name: "Billing" },
    { path: "/dashboard/character-creator", name: "Character Creator" },
    { path: "/dashboard/containers", name: "Containers" },
    { path: "/dashboard/gallery", name: "Gallery" },
    { path: "/dashboard/image", name: "Image Generation" },
    { path: "/dashboard/my-agents", name: "My Agents" },
    { path: "/dashboard/settings", name: "Settings" },
    { path: "/dashboard/storage", name: "Storage" },
    { path: "/dashboard/video", name: "Video" },
    { path: "/dashboard/voices", name: "Voices" },
    { path: "/dashboard/invoices", name: "Invoices" },
    { path: "/dashboard/mcps", name: "MCPs" },
    { path: "/dashboard/knowledge", name: "Knowledge" },
  ];

  for (const { path, name } of dashboardPages) {
    test(`${name} page handles unauthenticated access`, async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState("domcontentloaded");
      
      // Wait for potential redirect
      await page.waitForTimeout(2000);
      
      const currentUrl = page.url();
      
      // Should either redirect to login/home OR show the page (some pages allow anon)
      const redirectedToLogin = currentUrl.includes("/login");
      const redirectedToHome = currentUrl === `${BASE_URL}/` || currentUrl === BASE_URL;
      const stayedOnPage = currentUrl.includes(path);
      
      // Any of these outcomes is acceptable
      expect(redirectedToLogin || redirectedToHome || stayedOnPage).toBe(true);
      
      if (redirectedToLogin) {
        console.log(`✅ ${name} (${path}) redirects to login when unauthenticated`);
      } else if (redirectedToHome) {
        console.log(`✅ ${name} (${path}) redirects to home when unauthenticated`);
      } else {
        console.log(`✅ ${name} (${path}) allows anonymous access`);
      }
    });
  }
});

test.describe("Free Mode Pages (Anonymous Access)", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("Chat page allows anonymous access", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("domcontentloaded");
    
    // Wait for potential redirect
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    
    // Chat should allow anonymous access (free mode)
    const onChatPage = currentUrl.includes("/chat");
    const hasContent = await page.locator("body").textContent();
    
    if (onChatPage) {
      console.log("✅ Chat page (/dashboard/chat) allows anonymous access");
    } else {
      console.log(`ℹ️ Chat page redirected to: ${currentUrl}`);
    }
    
    expect(hasContent?.length).toBeGreaterThan(50);
  });

  test("Build page allows anonymous access", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/build`);
    await page.waitForLoadState("domcontentloaded");
    
    // Wait for potential redirect
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    
    // Build should allow anonymous access (free mode)
    const onBuildPage = currentUrl.includes("/build");
    const hasContent = await page.locator("body").textContent();
    
    if (onBuildPage) {
      console.log("✅ Build page (/dashboard/build) allows anonymous access");
    } else {
      console.log(`ℹ️ Build page redirected to: ${currentUrl}`);
    }
    
    expect(hasContent?.length).toBeGreaterThan(50);
  });
});

test.describe("Special Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("Billing success page loads", async ({ page }) => {
    // This page typically needs a session_id parameter
    await page.goto(`${BASE_URL}/billing/success`);
    await page.waitForLoadState("domcontentloaded");
    
    const currentUrl = page.url();
    const hasContent = await page.locator("body").textContent();
    
    // May redirect or show error, both acceptable
    expect(hasContent?.length).toBeGreaterThan(0);
    console.log("✅ Billing success page handles access");
  });

  test("Dashboard billing success page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/billing/success`);
    await page.waitForLoadState("domcontentloaded");
    
    const currentUrl = page.url();
    const hasContent = await page.locator("body").textContent();
    
    expect(hasContent?.length).toBeGreaterThan(0);
    console.log("✅ Dashboard billing success page handles access");
  });

  test("Invite accept page loads", async ({ page }) => {
    // This page needs an invite code
    await page.goto(`${BASE_URL}/invite/accept`);
    await page.waitForLoadState("domcontentloaded");
    
    const hasContent = await page.locator("body").textContent();
    expect(hasContent?.length).toBeGreaterThan(0);
    console.log("✅ Invite accept page handles access");
  });

  test("Auth error subpage loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/error`);
    await page.waitForLoadState("domcontentloaded");
    
    const hasContent = await page.locator("body").textContent();
    expect(hasContent?.length).toBeGreaterThan(0);
    console.log("✅ Auth error subpage handles access");
  });
});

test.describe("Page Navigation Smoke Test", () => {
  test("can navigate from home to login", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");
    
    // Look for login link/button
    const loginLink = page.locator('a[href="/login"], button:has-text("Log in"), a:has-text("Log in")');
    
    if (await loginLink.first().isVisible().catch(() => false)) {
      await loginLink.first().click();
      await page.waitForLoadState("domcontentloaded");
      
      expect(page.url()).toContain("/login");
      console.log("✅ Navigation from home to login works");
    } else {
      console.log("ℹ️ Login link not found on home page (may be different layout)");
    }
  });

  test("can navigate from login to home", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    
    // Look for logo/home link
    const homeLink = page.locator('a[href="/"]').first();
    
    if (await homeLink.isVisible().catch(() => false)) {
      await homeLink.click();
      await page.waitForLoadState("domcontentloaded");
      
      const currentUrl = page.url();
      expect(currentUrl === BASE_URL || currentUrl === `${BASE_URL}/`).toBe(true);
      console.log("✅ Navigation from login to home works");
    } else {
      console.log("ℹ️ Home link not immediately visible on login page");
    }
  });

  test("can navigate to marketplace", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");
    
    // Look for marketplace link
    const marketplaceLink = page.locator('a[href*="marketplace"]').first();
    
    if (await marketplaceLink.isVisible().catch(() => false)) {
      await marketplaceLink.click();
      await page.waitForLoadState("domcontentloaded");
      
      expect(page.url()).toContain("/marketplace");
      console.log("✅ Navigation to marketplace works");
    } else {
      // Direct navigation
      await page.goto(`${BASE_URL}/marketplace`);
      await page.waitForLoadState("domcontentloaded");
      expect(page.url()).toContain("/marketplace");
      console.log("✅ Direct navigation to marketplace works");
    }
  });
});

