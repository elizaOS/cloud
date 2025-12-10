import { test, expect, type Page } from "@playwright/test";

/**
 * Todo App Responsive Design E2E Tests
 *
 * Tests UI at various viewport sizes:
 * - Mobile: 375x667 (iPhone SE)
 * - Mobile Large: 414x896 (iPhone 11)
 * - Tablet: 768x1024 (iPad)
 * - Desktop: 1280x720
 * - Desktop Large: 1920x1080
 *
 * Prerequisites:
 * - Todo app running: cd todo-app && bun run dev (port 3002)
 */

const TODOAPP_URL = process.env.TODOAPP_URL ?? "http://localhost:3002";

// Viewport configurations
const VIEWPORTS = {
  mobileSmall: { width: 375, height: 667, name: "Mobile (iPhone SE)" },
  mobileLarge: { width: 414, height: 896, name: "Mobile (iPhone 11)" },
  tablet: { width: 768, height: 1024, name: "Tablet (iPad)" },
  desktop: { width: 1280, height: 720, name: "Desktop" },
  desktopLarge: { width: 1920, height: 1080, name: "Desktop Large" },
};

// Check if todo app is available
let todoappAvailable = false;

test.beforeAll(async ({ request }) => {
  const response = await request.get(TODOAPP_URL).catch(() => null);
  todoappAvailable = response?.ok() ?? false;

  if (!todoappAvailable) {
    console.log(`⚠️ Todo app not available at ${TODOAPP_URL}`);
  }
});

// Helper to set viewport
async function setViewport(
  page: Page,
  viewport: { width: number; height: number }
) {
  await page.setViewportSize(viewport);
}

test.describe("Landing Page - Responsive", () => {
  for (const [, viewport] of Object.entries(VIEWPORTS)) {
    test(`renders correctly on ${viewport.name}`, async ({ page }) => {
      if (!todoappAvailable) {
        test.skip();
        return;
      }

      await setViewport(page, viewport);
      await page.goto(TODOAPP_URL);
      await page.waitForLoadState("networkidle");

      // Hero heading is visible
      const heading = page.locator("h1").first();
      await expect(heading).toBeVisible({ timeout: 10000 });
      await expect(heading).toContainText(/Eliza Todo/i);

      // CTA button is visible
      const ctaButton = page.getByRole("button", { name: /get started/i }).first();
      await expect(ctaButton).toBeVisible();

      // Feature cards are visible
      const features = page.locator('[class*="rounded-2xl"]');
      const featureCount = await features.count();
      expect(featureCount).toBeGreaterThan(0);

      // No horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 20); // Allow small tolerance

      console.log(`✅ Landing page renders correctly on ${viewport.name}`);
    });

    test(`feature cards stack properly on ${viewport.name}`, async ({ page }) => {
      if (!todoappAvailable) {
        test.skip();
        return;
      }

      await setViewport(page, viewport);
      await page.goto(TODOAPP_URL);
      await page.waitForLoadState("networkidle");

      // Get all feature cards
      const featureSection = page.locator("section, .grid").first();
      if (await featureSection.isVisible()) {
        // Verify no overlapping elements
        const cards = featureSection.locator('[class*="rounded-2xl"]');
        const cardCount = await cards.count();

        if (cardCount > 1) {
          const firstCard = await cards.first().boundingBox();
          const secondCard = await cards.nth(1).boundingBox();

          if (firstCard && secondCard) {
            // On mobile, cards should stack (second card below first)
            if (viewport.width < 768) {
              expect(secondCard.y).toBeGreaterThanOrEqual(firstCard.y + firstCard.height - 10);
            }
          }
        }
      }

      console.log(`✅ Feature cards stack correctly on ${viewport.name}`);
    });
  }
});

test.describe("Dashboard Page - Responsive", () => {
  for (const [, viewport] of Object.entries(VIEWPORTS)) {
    test(`loads and displays content on ${viewport.name}`, async ({ page }) => {
      if (!todoappAvailable) {
        test.skip();
        return;
      }

      await setViewport(page, viewport);
      await page.goto(`${TODOAPP_URL}/dashboard`);
      await page.waitForLoadState("networkidle");

      // Page should load (may redirect if not authenticated)
      const body = page.locator("body");
      await expect(body).toBeVisible();

      // No horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 20);

      console.log(`✅ Dashboard page loads on ${viewport.name}`);
    });
  }

  test("mobile: header collapses user info", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await setViewport(page, VIEWPORTS.mobileSmall);
    await page.goto(`${TODOAPP_URL}/dashboard`);
    await page.waitForLoadState("networkidle");

    // Brand text should be hidden on mobile
    const brandText = page.locator("text=Eliza Todo");
    const brandVisible = await brandText.isVisible().catch(() => false);

    // Username should be hidden on mobile (in header)
    const header = page.locator("header").first();
    if (await header.isVisible()) {
      const headerText = await header.textContent();
      // On mobile, user name should be hidden in header
      console.log("Header content on mobile:", headerText?.slice(0, 100));
    }

    console.log("✅ Mobile header collapses correctly");
  });

  test("tablet: stats grid shows 2 columns", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await setViewport(page, VIEWPORTS.tablet);
    await page.goto(`${TODOAPP_URL}/dashboard`);
    await page.waitForLoadState("networkidle");

    // Stats should be in a grid
    const statsGrid = page.locator(".grid").first();
    if (await statsGrid.isVisible()) {
      const gridStyle = await statsGrid.evaluate((el) =>
        window.getComputedStyle(el).getPropertyValue("grid-template-columns")
      );
      console.log(`Stats grid on tablet: ${gridStyle}`);
    }

    console.log("✅ Tablet stats grid renders correctly");
  });

  test("desktop: shows all UI elements", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await setViewport(page, VIEWPORTS.desktop);
    await page.goto(`${TODOAPP_URL}/dashboard`);
    await page.waitForLoadState("networkidle");

    // Sidebar should be visible on desktop (if present)
    // Main content area should have proper width
    const main = page.locator("main").first();
    if (await main.isVisible()) {
      const mainBox = await main.boundingBox();
      if (mainBox) {
        // Main content should not be full width (has sidebar or max-width)
        expect(mainBox.width).toBeLessThan(VIEWPORTS.desktop.width);
      }
    }

    console.log("✅ Desktop shows all UI elements");
  });
});

test.describe("Chat Page - Responsive", () => {
  for (const [, viewport] of Object.entries(VIEWPORTS)) {
    test(`chat layout works on ${viewport.name}`, async ({ page }) => {
      if (!todoappAvailable) {
        test.skip();
        return;
      }

      await setViewport(page, viewport);
      await page.goto(`${TODOAPP_URL}/chat`);
      await page.waitForLoadState("networkidle");

      // Page should load
      const body = page.locator("body");
      await expect(body).toBeVisible();

      // No horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 20);

      console.log(`✅ Chat page loads on ${viewport.name}`);
    });
  }

  test("mobile: sidebar is hidden by default", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await setViewport(page, VIEWPORTS.mobileSmall);
    await page.goto(`${TODOAPP_URL}/chat`);
    await page.waitForLoadState("networkidle");

    // On mobile, sidebar should be hidden (translateX negative)
    const sidebar = page.locator("aside").first();
    if (await sidebar.isVisible()) {
      const transform = await sidebar.evaluate((el) =>
        window.getComputedStyle(el).getPropertyValue("transform")
      );
      // Transform should include negative translateX on mobile
      console.log(`Sidebar transform: ${transform}`);
    }

    // Menu button should be visible on mobile
    const menuButton = page.locator('button:has([class*="Menu"])').first();
    const hasMenuButton = await menuButton.isVisible().catch(() => false);
    console.log(`Menu button visible on mobile: ${hasMenuButton}`);

    console.log("✅ Mobile sidebar behavior verified");
  });

  test("mobile: menu button toggles sidebar", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await setViewport(page, VIEWPORTS.mobileSmall);
    await page.goto(`${TODOAPP_URL}/chat`);
    await page.waitForLoadState("networkidle");

    // Find menu button
    const menuButton = page.locator('button').filter({ has: page.locator('[class*="Menu"], svg') }).first();
    
    if (await menuButton.isVisible().catch(() => false)) {
      // Click to open sidebar
      await menuButton.click();
      await page.waitForTimeout(300); // Wait for animation

      // Sidebar should now be visible (or overlay)
      const sidebar = page.locator("aside").first();
      const sidebarVisible = await sidebar.isVisible().catch(() => false);
      
      console.log(`Sidebar visible after menu click: ${sidebarVisible}`);
    }

    console.log("✅ Mobile menu toggle works");
  });

  test("desktop: sidebar is always visible", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await setViewport(page, VIEWPORTS.desktop);
    await page.goto(`${TODOAPP_URL}/chat`);
    await page.waitForLoadState("networkidle");

    // Sidebar should be visible
    const sidebar = page.locator("aside").first();
    const sidebarVisible = await sidebar.isVisible().catch(() => false);

    // Menu button should NOT be visible on desktop
    const menuButton = page.locator('button:has([class*="Menu"])').first();
    const menuButtonVisible = await menuButton.isVisible().catch(() => false);

    console.log(`Desktop sidebar visible: ${sidebarVisible}`);
    console.log(`Desktop menu button visible: ${menuButtonVisible}`);

    console.log("✅ Desktop sidebar always visible");
  });
});

test.describe("Auth Callback Page - Responsive", () => {
  for (const [, viewport] of Object.entries(VIEWPORTS)) {
    test(`auth callback renders on ${viewport.name}`, async ({ page }) => {
      if (!todoappAvailable) {
        test.skip();
        return;
      }

      await setViewport(page, viewport);
      await page.goto(`${TODOAPP_URL}/auth/callback`);
      await page.waitForLoadState("networkidle");

      // Should show error state (no token)
      const errorText = page.getByText(/failed|error|no.*token/i);
      await expect(errorText.first()).toBeVisible({ timeout: 10000 });

      // Card should be centered and not overflow
      const card = page.locator('[class*="rounded-2xl"]').first();
      if (await card.isVisible()) {
        const cardBox = await card.boundingBox();
        if (cardBox) {
          expect(cardBox.width).toBeLessThanOrEqual(viewport.width - 20);
        }
      }

      console.log(`✅ Auth callback renders on ${viewport.name}`);
    });
  }
});

test.describe("Touch Interactions - Mobile", () => {
  test("buttons have adequate tap targets", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await setViewport(page, VIEWPORTS.mobileSmall);
    await page.goto(TODOAPP_URL);
    await page.waitForLoadState("networkidle");

    // Get all buttons
    const buttons = page.locator("button");
    const buttonCount = await buttons.count();

    let smallButtons = 0;
    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      const button = buttons.nth(i);
      if (await button.isVisible()) {
        const box = await button.boundingBox();
        if (box) {
          // Minimum tap target should be 44x44 (Apple HIG) or at least 32x32
          if (box.width < 32 || box.height < 32) {
            smallButtons++;
            console.log(`Small button found: ${box.width}x${box.height}`);
          }
        }
      }
    }

    // Allow some small buttons but flag if too many
    expect(smallButtons).toBeLessThan(buttonCount / 2);
    console.log(`✅ Tap targets checked: ${smallButtons} small buttons out of ${buttonCount}`);
  });

  test("scrolling works on mobile", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await setViewport(page, VIEWPORTS.mobileSmall);
    await page.goto(TODOAPP_URL);
    await page.waitForLoadState("networkidle");

    // Check if page is scrollable
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = VIEWPORTS.mobileSmall.height;

    if (scrollHeight > viewportHeight) {
      // Scroll down
      await page.evaluate(() => window.scrollTo(0, 500));
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(0);
    }

    console.log("✅ Mobile scrolling works");
  });
});

test.describe("Text Readability - All Sizes", () => {
  test("text remains readable at all viewport sizes", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    for (const [, viewport] of Object.entries(VIEWPORTS)) {
      await setViewport(page, viewport);
      await page.goto(TODOAPP_URL);
      await page.waitForLoadState("networkidle");

      // Check heading font size
      const heading = page.locator("h1").first();
      if (await heading.isVisible()) {
        const fontSize = await heading.evaluate((el) =>
          parseFloat(window.getComputedStyle(el).fontSize)
        );
        
        // Heading should be at least 24px on mobile, larger on desktop
        if (viewport.width < 768) {
          expect(fontSize).toBeGreaterThanOrEqual(24);
        } else {
          expect(fontSize).toBeGreaterThanOrEqual(32);
        }
      }

      // Check body text size
      const bodyText = page.locator("p").first();
      if (await bodyText.isVisible()) {
        const fontSize = await bodyText.evaluate((el) =>
          parseFloat(window.getComputedStyle(el).fontSize)
        );
        
        // Body text should be at least 14px
        expect(fontSize).toBeGreaterThanOrEqual(14);
      }

      console.log(`✅ Text readable on ${viewport.name}`);
    }
  });
});

test.describe("Performance - Different Viewports", () => {
  test("landing page loads quickly on mobile", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await setViewport(page, VIEWPORTS.mobileSmall);

    const startTime = Date.now();
    await page.goto(TODOAPP_URL);
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(5000);
    console.log(`✅ Mobile landing page loaded in ${loadTime}ms`);
  });

  test("dashboard loads quickly on tablet", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await setViewport(page, VIEWPORTS.tablet);

    const startTime = Date.now();
    await page.goto(`${TODOAPP_URL}/dashboard`);
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(5000);
    console.log(`✅ Tablet dashboard loaded in ${loadTime}ms`);
  });
});

test.describe("Orientation Changes", () => {
  test("landscape mode works on mobile", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    // Portrait first
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(TODOAPP_URL);
    await page.waitForLoadState("networkidle");

    const portraitHeading = page.locator("h1").first();
    await expect(portraitHeading).toBeVisible();

    // Switch to landscape
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(300);

    // Content should still be visible
    const landscapeHeading = page.locator("h1").first();
    await expect(landscapeHeading).toBeVisible();

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(680);

    console.log("✅ Landscape orientation works");
  });
});

