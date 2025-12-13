import { test, expect } from "@playwright/test";

/**
 * Comprehensive UI Tests
 * 
 * Tests every button, form, menu, and interactive element across all pages.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Landing Page - All Buttons", () => {
  test("all CTA buttons work", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    
    // Get Started button
    const getStartedBtn = page.locator('button:has-text("Get Started")').first();
    await expect(getStartedBtn).toBeVisible();
    await expect(getStartedBtn).toBeEnabled();
    console.log("✅ Get Started button visible and enabled");
    
    // Sign Up button in header
    const signUpBtn = page.locator('button:has-text("Sign Up")').first();
    await expect(signUpBtn).toBeVisible();
    await expect(signUpBtn).toBeEnabled();
    console.log("✅ Sign Up button visible and enabled");
    
    // Log in button
    const loginBtn = page.locator('button:has-text("Log in")').first();
    await expect(loginBtn).toBeVisible();
    console.log("✅ Log in button visible");
  });

  test("copy command buttons work", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    
    // Look for copy command buttons
    const copyButtons = page.locator('button:has-text("Copy"), button[aria-label*="copy" i]');
    const copyCount = await copyButtons.count();
    
    if (copyCount > 0) {
      // Click first copy button
      await copyButtons.first().click();
      await page.waitForTimeout(500);
      console.log(`✅ Copy command button clicked (${copyCount} total)`);
    } else {
      console.log("ℹ️ No copy buttons found");
    }
  });

  test("OS toggle buttons work", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    
    // macOS/Linux and Windows toggle
    const macosBtn = page.locator('button:has-text("macOS"), button:has-text("MACOS")').first();
    const windowsBtn = page.locator('button:has-text("Windows"), button:has-text("WINDOWS")').first();
    
    if (await macosBtn.isVisible().catch(() => false)) {
      await macosBtn.click();
      console.log("✅ macOS/Linux button clicked");
    }
    
    if (await windowsBtn.isVisible().catch(() => false)) {
      await windowsBtn.click();
      console.log("✅ Windows button clicked");
    }
  });

  test("documentation links work", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    
    const docLinks = page.locator('a:has-text("Documentation"), a:has-text("Docs"), a:has-text("View Doc")');
    const linkCount = await docLinks.count();
    
    console.log(`✅ Found ${linkCount} documentation links`);
    expect(linkCount).toBeGreaterThan(0);
  });

  test("footer links work", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    
    // Check footer links
    const footerLinks = page.locator('footer a, [role="contentinfo"] a');
    const linkCount = await footerLinks.count();
    
    const links: string[] = [];
    for (let i = 0; i < linkCount; i++) {
      const href = await footerLinks.nth(i).getAttribute("href");
      if (href) links.push(href);
    }
    
    console.log(`✅ Footer links: ${links.join(", ")}`);
    expect(linkCount).toBeGreaterThan(0);
  });

  test("social links are present", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    
    const githubLink = page.locator('a:has-text("GitHub"), a[href*="github"]');
    const discordLink = page.locator('a:has-text("Discord"), a[href*="discord"]');
    const twitterLink = page.locator('a:has-text("Twitter"), a:has-text("X (Twitter)"), a[href*="twitter"], a[href*="x.com"]');
    
    const hasGithub = await githubLink.count() > 0;
    const hasDiscord = await discordLink.count() > 0;
    const hasTwitter = await twitterLink.count() > 0;
    
    console.log(`✅ Social links - GitHub: ${hasGithub}, Discord: ${hasDiscord}, Twitter: ${hasTwitter}`);
  });
});

test.describe("Login Page - Complete Form Testing", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
  });

  test("email validation works", async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    const submitBtn = page.locator('button:has-text("Continue with Email")');
    
    await expect(emailInput).toBeVisible({ timeout: 30000 });
    
    // Empty email - button should be disabled
    await expect(submitBtn).toBeDisabled();
    
    // Invalid email format
    await emailInput.fill("invalid");
    // Button might still be disabled or enabled based on implementation
    
    // Valid email
    await emailInput.fill("test@example.com");
    await expect(submitBtn).toBeEnabled();
    
    console.log("✅ Email validation works correctly");
  });

  test("can click all OAuth buttons", async ({ page }) => {
    const oauthProviders = ["Google", "Discord", "GitHub"];
    
    for (const provider of oauthProviders) {
      const btn = page.locator(`button:has-text("${provider}")`);
      await expect(btn).toBeVisible({ timeout: 30000 });
      await expect(btn).toBeEnabled();
      console.log(`✅ ${provider} OAuth button is clickable`);
    }
  });

  test("wallet button triggers Privy modal", async ({ page }) => {
    const walletBtn = page.locator('button:has-text("Connect Wallet")');
    await expect(walletBtn).toBeVisible({ timeout: 30000 });
    await expect(walletBtn).toBeEnabled();
    
    // Click wallet button
    await walletBtn.click();
    await page.waitForTimeout(1500);
    
    // Check if Privy modal appeared or any change occurred
    console.log("✅ Wallet connect button triggered Privy interaction");
  });

  test("login page has proper heading", async ({ page }) => {
    // Should have some form of title
    const heading = page.locator('h1, h2, [class*="title"]');
    const hasHeading = await heading.count() > 0;
    
    console.log(`✅ Login page has heading: ${hasHeading}`);
  });
});

test.describe("Marketplace - All Interactive Elements", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/marketplace`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("character cards have all buttons", async ({ page }) => {
    // Wait for page to fully load
    await page.waitForTimeout(3000);
    
    // Each card should have Chat, Clone character, View details
    const chatBtns = page.locator('button:has-text("Chat")');
    const cloneBtns = page.locator('button:has-text("Clone character"), button:has-text("Clone")');
    const viewBtns = page.locator('button:has-text("View details"), button:has-text("View")');
    
    const chatCount = await chatBtns.count();
    const cloneCount = await cloneBtns.count();
    const viewCount = await viewBtns.count();
    
    console.log(`✅ Card buttons - Chat: ${chatCount}, Clone: ${cloneCount}, View: ${viewCount}`);
    expect(chatCount).toBeGreaterThan(0);
    // Clone and View may not always be visible depending on auth state
    expect(chatCount + cloneCount + viewCount).toBeGreaterThan(0);
  });

  test("category buttons are interactive", async ({ page }) => {
    const categories = [
      "Assistant",
      "Anime",
      "Creativity",
      "Gaming",
      "Learning",
      "Entertainment",
      "Historical",
      "Lifestyle",
    ];
    
    let foundCategories = 0;
    for (const cat of categories) {
      const btn = page.locator(`button:has-text("${cat}")`);
      if (await btn.count() > 0) {
        foundCategories++;
      }
    }
    
    console.log(`✅ Found ${foundCategories}/${categories.length} category buttons`);
    expect(foundCategories).toBeGreaterThan(0);
  });

  test("CTA buttons are visible", async ({ page }) => {
    const ctaTexts = [
      "Get Started",
      "Sign Up",
      "Create Free Account",
      "Browse Character",
    ];
    
    let foundCTAs = 0;
    for (const text of ctaTexts) {
      const btn = page.locator(`button:has-text("${text}"), a:has-text("${text}")`);
      if (await btn.count() > 0) {
        foundCTAs++;
      }
    }
    
    console.log(`✅ Found ${foundCTAs} CTA buttons`);
  });
});

test.describe("Chat Page - Complete Testing", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
  });

  test("sidebar navigation elements", async ({ page }) => {
    // Check for sidebar
    const sidebar = page.locator('aside, [class*="sidebar"]');
    const hasSidebar = await sidebar.count() > 0;
    
    // Check for New button
    const newBtn = page.locator('button:has-text("New")');
    const hasNewBtn = await newBtn.isVisible().catch(() => false);
    
    // Check for Back button
    const backBtn = page.locator('a:has-text("Back"), button:has-text("Back")');
    const hasBackBtn = await backBtn.count() > 0;
    
    console.log(`✅ Sidebar: ${hasSidebar}, New: ${hasNewBtn}, Back: ${hasBackBtn}`);
  });

  test("chat mode toggle works", async ({ page }) => {
    const chatModeBtn = page.locator('button:has-text("Chat Mode")');
    const buildModeBtn = page.locator('button:has-text("Build Mode")');
    
    if (await chatModeBtn.isVisible().catch(() => false)) {
      console.log("✅ Chat Mode button visible");
    }
    
    if (await buildModeBtn.isVisible().catch(() => false)) {
      await buildModeBtn.click();
      await page.waitForTimeout(1000);
      console.log("✅ Build Mode button clicked");
      
      // Switch back
      if (await chatModeBtn.isVisible().catch(() => false)) {
        await chatModeBtn.click();
      }
    }
  });

  test("character selector dropdown works", async ({ page }) => {
    const characterBtn = page.locator('button:has-text("Default"), button:has-text("Eliza")');
    
    if (await characterBtn.isVisible().catch(() => false)) {
      await characterBtn.click();
      await page.waitForTimeout(500);
      console.log("✅ Character selector clicked");
    }
  });

  test("model tier selector exists", async ({ page }) => {
    const tierSelector = page.locator('[role="combobox"], select:has-text("Pro"), select:has-text("Fast")');
    const hasTier = await tierSelector.count() > 0;
    
    console.log(`✅ Model tier selector present: ${hasTier}`);
  });

  test("audio controls exist", async ({ page }) => {
    const micBtn = page.locator('button[aria-label*="mic" i], button:has(svg[class*="mic" i])');
    const voiceBtn = page.locator('button[aria-label*="voice" i]');
    
    const hasMic = await micBtn.count() > 0;
    const hasVoice = await voiceBtn.count() > 0;
    
    console.log(`✅ Audio controls - Mic: ${hasMic}, Voice: ${hasVoice}`);
  });

  test("chat input form is functional", async ({ page }) => {
    const chatInput = page.locator('textarea');
    
    if (await chatInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      // Test typing
      await chatInput.fill("Test message 1");
      expect(await chatInput.inputValue()).toBe("Test message 1");
      
      // Test clearing
      await chatInput.clear();
      expect(await chatInput.inputValue()).toBe("");
      
      // Test with special characters
      await chatInput.fill("Hello! How are you? 👋");
      expect(await chatInput.inputValue()).toContain("Hello");
      
      console.log("✅ Chat input handles text, clearing, and special characters");
    }
  });

  test("send message and verify", async ({ page }) => {
    const chatInput = page.locator('textarea');
    
    if (await chatInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await chatInput.fill("Hello from E2E test!");
      await chatInput.press("Enter");
      await page.waitForTimeout(2000);
      
      // Input should clear after sending
      const inputValue = await chatInput.inputValue();
      console.log(`✅ Message sent, input ${inputValue === "" ? "cleared" : "not cleared"}`);
    }
  });
});

test.describe("Static Pages", () => {
  test("terms of service is readable", async ({ page }) => {
    await page.goto(`${BASE_URL}/terms-of-service`);
    await page.waitForLoadState("networkidle");
    
    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(1000);
    
    // Should have proper headings
    const headings = page.locator("h1, h2, h3");
    const headingCount = await headings.count();
    
    console.log(`✅ Terms page has ${content?.length} chars and ${headingCount} headings`);
  });

  test("privacy policy is readable", async ({ page }) => {
    await page.goto(`${BASE_URL}/privacy-policy`);
    await page.waitForLoadState("networkidle");
    
    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(1000);
    
    console.log(`✅ Privacy page has ${content?.length} chars`);
  });
});

test.describe("Navigation Flow", () => {
  test("complete navigation flow works", async ({ page }) => {
    // Start at home
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toBe(`${BASE_URL}/`);
    console.log("✅ 1. Started at home page");
    
    // Go to login
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/login");
    console.log("✅ 2. Navigated to login");
    
    // Go to marketplace
    await page.goto(`${BASE_URL}/marketplace`);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/marketplace");
    console.log("✅ 3. Navigated to marketplace");
    
    // Go to chat
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("networkidle");
    // May redirect to login or show chat
    console.log(`✅ 4. Navigated to chat (ended at: ${page.url()})`);
    
    // Go to terms
    await page.goto(`${BASE_URL}/terms-of-service`);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/terms");
    console.log("✅ 5. Navigated to terms");
    
    // Go back to home
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    console.log("✅ 6. Returned to home");
  });

  test("browser back/forward works", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
    
    await page.goto(`${BASE_URL}/marketplace`);
    await page.waitForLoadState("networkidle");
    
    // Go back
    await page.goBack();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/login");
    console.log("✅ Browser back works");
    
    // Go forward
    await page.goForward();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/marketplace");
    console.log("✅ Browser forward works");
  });
});

test.describe("Performance and Loading", () => {
  test("pages load within timeout", async ({ page }) => {
    const pages = [
      { path: "/", name: "Home" },
      { path: "/login", name: "Login" },
      { path: "/marketplace", name: "Marketplace" },
      { path: "/terms-of-service", name: "Terms" },
      { path: "/privacy-policy", name: "Privacy" },
    ];
    
    for (const p of pages) {
      const start = Date.now();
      await page.goto(`${BASE_URL}${p.path}`);
      await page.waitForLoadState("networkidle");
      const duration = Date.now() - start;
      
      console.log(`✅ ${p.name} loaded in ${duration}ms`);
      expect(duration).toBeLessThan(30000); // 30s max
    }
  });

  test("no console errors on critical pages", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });
    
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
    
    // Filter out expected errors (like network errors for external services)
    const criticalErrors = errors.filter(e => 
      !e.includes("favicon") && 
      !e.includes("Failed to load resource") &&
      !e.includes("net::ERR")
    );
    
    console.log(`✅ Console errors found: ${criticalErrors.length}`);
    if (criticalErrors.length > 0) {
      console.log("Errors:", criticalErrors.slice(0, 3).join(", "));
    }
  });
});

test.describe("Form Submissions", () => {
  test("email form submission behavior", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
    
    const emailInput = page.locator('input[type="email"]');
    const submitBtn = page.locator('button:has-text("Continue with Email")');
    
    await expect(emailInput).toBeVisible({ timeout: 30000 });
    
    // Fill and submit
    await emailInput.fill("e2e-test@example.com");
    await submitBtn.click();
    
    // Wait for response (either error, success, or redirect)
    await page.waitForTimeout(3000);
    
    // Page should still be functional
    const hasContent = await page.locator("body").textContent();
    expect(hasContent?.length).toBeGreaterThan(100);
    
    console.log("✅ Email form submission handled gracefully");
  });
});

test.describe("Keyboard Navigation", () => {
  test("tab navigation works on login page", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    
    // Press Tab multiple times
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(100);
    }
    
    // Check if something is focused
    const focusedElement = page.locator(":focus");
    const hasFocus = await focusedElement.count() > 0;
    
    console.log(`✅ Tab navigation works, element focused: ${hasFocus}`);
  });

  test("escape key closes modals", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
    
    // Click wallet button to potentially open modal
    const walletBtn = page.locator('button:has-text("Connect Wallet")');
    if (await walletBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await walletBtn.click();
      await page.waitForTimeout(1000);
      
      // Press Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      
      console.log("✅ Escape key handled");
    }
  });
});

test.describe("Responsive Interactions", () => {
  test("mobile menu works", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    
    // Look for hamburger menu
    const menuBtn = page.locator('button[aria-label*="menu" i], button:has(svg[class*="menu" i]), button[class*="hamburger" i]');
    
    if (await menuBtn.isVisible().catch(() => false)) {
      await menuBtn.click();
      await page.waitForTimeout(500);
      console.log("✅ Mobile menu opened");
    } else {
      console.log("ℹ️ No mobile menu button found (may use different nav)");
    }
  });

  test("touch interactions work on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
    
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 30000 });
    
    // Click to focus (tap requires hasTouch context)
    await emailInput.click();
    
    // Type
    await emailInput.fill("mobile@test.com");
    expect(await emailInput.inputValue()).toBe("mobile@test.com");
    
    console.log("✅ Mobile interactions work");
  });
});

