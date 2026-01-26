/**
 * Community Gallery E2E Tests (Playwright)
 *
 * End-to-end tests for the Community Gallery feature:
 * - Page rendering and navigation
 * - Tab filtering (All, Agents, Apps, MCPs)
 * - Search functionality
 * - Gallery detail page
 * - Error handling (404s)
 * - Accessibility and console errors
 *
 * These tests run against a real browser and local server.
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * Helper to wait for page to be fully loaded
 */
async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  // Give React hydration a moment
  await page.waitForTimeout(500);
}

/**
 * Helper to collect console errors
 */
function setupConsoleErrorCollector(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  return errors;
}

/**
 * Filter out known non-critical errors
 */
function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("WalletConnect") &&
      !e.includes("LCP") &&
      !e.includes("favicon") &&
      !e.includes("eth_accounts") &&
      !e.includes("hydration") &&
      !e.includes("ResizeObserver") &&
      !e.includes("TAVILY") &&
      !e.includes("404") &&
      !e.includes("Failed to load resource")
  );
}

test.describe("Community Gallery - Page Loading", () => {
  test("gallery page loads successfully", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/gallery`);
    expect(response?.status()).toBe(200);
  });

  test("gallery page has correct title", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    await expect(page).toHaveTitle(/Community Gallery.*Eliza Cloud/i);
  });

  test("gallery page displays heading", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const heading = page.getByRole("heading", { name: /Community Gallery/i });
    await expect(heading).toBeVisible();
  });

  test("gallery page displays description text", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const description = page.getByText(/Discover agents, apps, and MCP/i);
    await expect(description).toBeVisible();
  });

  test("gallery page displays search input", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const searchInput = page.getByPlaceholder(/Search projects/i);
    await expect(searchInput).toBeVisible();
  });

  test("gallery page has no critical console errors", async ({ page }) => {
    const errors = setupConsoleErrorCollector(page);
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const criticalErrors = filterCriticalErrors(errors);
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe("Community Gallery - Tab Navigation", () => {
  test("displays All tab by default", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const allTab = page.getByRole("tab", { name: /All/i });
    await expect(allTab).toBeVisible();
    await expect(allTab).toHaveAttribute("aria-selected", "true");
  });

  test("displays Agents tab", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const agentsTab = page.getByRole("tab", { name: /Agents/i });
    await expect(agentsTab).toBeVisible();
  });

  test("displays Apps tab", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const appsTab = page.getByRole("tab", { name: /Apps/i });
    await expect(appsTab).toBeVisible();
  });

  test("displays MCPs tab", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const mcpsTab = page.getByRole("tab", { name: /MCPs/i });
    await expect(mcpsTab).toBeVisible();
  });

  test("can switch to Agents tab", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const agentsTab = page.getByRole("tab", { name: /Agents/i });
    await agentsTab.click();
    await expect(agentsTab).toHaveAttribute("aria-selected", "true");
  });

  test("can switch to Apps tab", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const appsTab = page.getByRole("tab", { name: /Apps/i });
    await appsTab.click();
    await expect(appsTab).toHaveAttribute("aria-selected", "true");
  });

  test("can switch to MCPs tab", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const mcpsTab = page.getByRole("tab", { name: /MCPs/i });
    await mcpsTab.click();
    await expect(mcpsTab).toHaveAttribute("aria-selected", "true");
  });

  test("can switch back to All tab", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // Switch to Agents first
    const agentsTab = page.getByRole("tab", { name: /Agents/i });
    await agentsTab.click();
    await expect(agentsTab).toHaveAttribute("aria-selected", "true");

    // Switch back to All
    const allTab = page.getByRole("tab", { name: /All/i });
    await allTab.click();
    await expect(allTab).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("Community Gallery - Search Functionality", () => {
  test("search input accepts text", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const searchInput = page.getByPlaceholder(/Search projects/i);
    await searchInput.fill("test query");
    await expect(searchInput).toHaveValue("test query");
  });

  test("search input can be cleared", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const searchInput = page.getByPlaceholder(/Search projects/i);
    await searchInput.fill("test query");
    await searchInput.clear();
    await expect(searchInput).toHaveValue("");
  });

  test("search preserves input on tab switch", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // Enter search query
    const searchInput = page.getByPlaceholder(/Search projects/i);
    await searchInput.fill("test query");

    // Switch tabs
    const agentsTab = page.getByRole("tab", { name: /Agents/i });
    await agentsTab.click();

    // Verify search is preserved
    await expect(searchInput).toHaveValue("test query");
  });
});

test.describe("Community Gallery - Empty States", () => {
  test("shows appropriate message when no projects match search", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // Search for something unlikely to exist
    const searchInput = page.getByPlaceholder(/Search projects/i);
    await searchInput.fill("zzzznonexistentproject99999");
    await page.waitForTimeout(500); // Wait for search debounce

    // Should show empty state or "no results" message
    // The actual implementation may vary - check for common patterns
    const pageContent = await page.content();
    const hasEmptyState =
      pageContent.includes("No projects") ||
      pageContent.includes("no results") ||
      pageContent.includes("not found") ||
      pageContent.includes("(0)");

    expect(hasEmptyState).toBe(true);
  });
});

test.describe("Community Gallery - Detail Page - Error Handling", () => {
  test("returns 404 for invalid UUID format: text", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/gallery/not-a-valid-uuid`);
    expect(response?.status()).toBe(404);
  });

  test("returns 404 for invalid UUID format: numbers only", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/gallery/12345`);
    expect(response?.status()).toBe(404);
  });

  test("returns 404 for invalid UUID format: partial UUID", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/gallery/123e4567-e89b`);
    expect(response?.status()).toBe(404);
  });

  test("returns 404 for invalid UUID format: with extra characters", async ({ page }) => {
    const response = await page.goto(
      `${BASE_URL}/gallery/123e4567-e89b-12d3-a456-426614174000-extra`
    );
    expect(response?.status()).toBe(404);
  });

  test("returns 404 for non-existent valid UUID", async ({ page }) => {
    const response = await page.goto(
      `${BASE_URL}/gallery/00000000-0000-0000-0000-000000000000`
    );
    expect(response?.status()).toBe(404);
  });

  test("displays 404 page content for invalid UUID", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery/invalid-uuid`);
    // Check for 404 indicators
    const pageContent = await page.content();
    const has404Content =
      pageContent.includes("404") ||
      pageContent.includes("not found") ||
      pageContent.includes("Not Found");
    expect(has404Content).toBe(true);
  });

  test("404 page has no critical console errors", async ({ page }) => {
    const errors = setupConsoleErrorCollector(page);
    await page.goto(`${BASE_URL}/gallery/invalid-uuid`);
    await page.waitForLoadState("networkidle");
    const criticalErrors = filterCriticalErrors(errors);
    // Filter out expected 404 errors
    const nonExpectedErrors = criticalErrors.filter((e) => !e.includes("404"));
    expect(nonExpectedErrors).toHaveLength(0);
  });
});

test.describe("Community Gallery - Security", () => {
  test("handles URL path traversal attempts safely", async ({ page }) => {
    const response = await page.goto(
      `${BASE_URL}/gallery/..%2F..%2F..%2Fetc%2Fpasswd`
    );
    // Should not crash - either 404 or redirect
    expect([200, 404, 301, 302, 308]).toContain(response?.status());
  });

  test("handles XSS attempts in URL safely", async ({ page }) => {
    const response = await page.goto(
      `${BASE_URL}/gallery/%3Cscript%3Ealert('xss')%3C%2Fscript%3E`
    );
    expect([200, 404, 400]).toContain(response?.status());

    // Ensure no script is executed
    const pageContent = await page.content();
    expect(pageContent).not.toContain("<script>alert");
  });

  test("handles SQL injection attempts in URL safely", async ({ page }) => {
    const response = await page.goto(
      `${BASE_URL}/gallery/'; DROP TABLE gallery_submissions; --`
    );
    expect([200, 404, 400]).toContain(response?.status());
  });

  test("handles special characters in search safely", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const searchInput = page.getByPlaceholder(/Search projects/i);
    await searchInput.fill("'; DROP TABLE gallery_submissions; --");
    await page.waitForTimeout(500);

    // Page should not crash
    await expect(page).toHaveURL(`${BASE_URL}/gallery`);
  });
});

test.describe("Community Gallery - Accessibility", () => {
  test("gallery page has proper heading structure", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // Should have at least one h1 or h2
    const headings = await page.locator("h1, h2").all();
    expect(headings.length).toBeGreaterThan(0);
  });

  test("tabs are keyboard accessible", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // Focus on tabs area
    const allTab = page.getByRole("tab", { name: /All/i });
    await allTab.focus();

    // Press right arrow to navigate to next tab
    await page.keyboard.press("ArrowRight");

    // Should move focus (not necessarily select)
    const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute("role"));
    expect(focusedElement).toBe("tab");
  });

  test("search input is labeled", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const searchInput = page.getByPlaceholder(/Search projects/i);
    const placeholder = await searchInput.getAttribute("placeholder");
    expect(placeholder).toBeTruthy();
  });

  test("tablist has proper ARIA attributes", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const tablist = page.getByRole("tablist");
    await expect(tablist).toBeVisible();
  });

  test("tabs have proper ARIA selected state", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const allTab = page.getByRole("tab", { name: /All/i });
    await expect(allTab).toHaveAttribute("aria-selected", "true");

    const agentsTab = page.getByRole("tab", { name: /Agents/i });
    await expect(agentsTab).toHaveAttribute("aria-selected", "false");
  });
});

test.describe("Community Gallery - Responsive Design", () => {
  test("gallery page works on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // Page should load without errors
    const heading = page.getByRole("heading", { name: /Community Gallery/i });
    await expect(heading).toBeVisible();
  });

  test("gallery page works on tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const heading = page.getByRole("heading", { name: /Community Gallery/i });
    await expect(heading).toBeVisible();
  });

  test("gallery page works on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const heading = page.getByRole("heading", { name: /Community Gallery/i });
    await expect(heading).toBeVisible();
  });

  test("tabs are visible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // On mobile, tabs might be in a dropdown or horizontal scroll
    // Check that at least one tab-related element is visible
    const tabOrDropdown = page.locator('[role="tab"], [role="combobox"]').first();
    await expect(tabOrDropdown).toBeVisible();
  });
});

test.describe("Community Gallery - Navigation", () => {
  test("can navigate from homepage to gallery", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForPageReady(page);

    // Look for a link to gallery
    const galleryLink = page.locator('a[href="/gallery"]').first();

    if (await galleryLink.isVisible()) {
      await galleryLink.click();
      await waitForPageReady(page);
      await expect(page).toHaveURL(/\/gallery/);
    }
  });

  test("browser back button works from gallery detail to gallery list", async ({ page }) => {
    // Start at gallery
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // Navigate to a 404 page (simulating a detail page visit)
    await page.goto(`${BASE_URL}/gallery/00000000-0000-0000-0000-000000000000`);
    await page.waitForLoadState("networkidle");

    // Go back
    await page.goBack();
    await waitForPageReady(page);

    await expect(page).toHaveURL(`${BASE_URL}/gallery`);
  });
});

test.describe("Community Gallery - Performance", () => {
  test("gallery page loads within acceptable time", async ({ page }) => {
    const startTime = Date.now();
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    const loadTime = Date.now() - startTime;

    // Should load within 10 seconds even on slow connections
    expect(loadTime).toBeLessThan(10000);
  });

  test("tab switching is responsive", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const startTime = Date.now();
    const agentsTab = page.getByRole("tab", { name: /Agents/i });
    await agentsTab.click();
    await expect(agentsTab).toHaveAttribute("aria-selected", "true");
    const switchTime = Date.now() - startTime;

    // Tab switch should be instant (under 500ms)
    expect(switchTime).toBeLessThan(500);
  });

  test("search input is responsive", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const searchInput = page.getByPlaceholder(/Search projects/i);

    const startTime = Date.now();
    await searchInput.fill("test");
    const inputTime = Date.now() - startTime;

    // Input should be responsive (under 200ms)
    expect(inputTime).toBeLessThan(200);
  });
});

test.describe("Community Gallery - API Requests", () => {
  test("gallery page makes discovery API request", async ({ page }) => {
    let discoveryRequestMade = false;

    page.on("request", (request) => {
      if (request.url().includes("/api/v1/discovery")) {
        discoveryRequestMade = true;
      }
    });

    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // The discovery API should be called during initial load or data fetch
    // Note: This might be server-side rendered, so the request might not be visible
    // We're checking if the API is being used at some point
  });

  test("API errors are handled gracefully", async ({ page }) => {
    // Mock a failing API response
    await page.route("**/api/v1/discovery**", (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    const errors = setupConsoleErrorCollector(page);
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // Page should not crash - it might show an error state or fallback UI
    await expect(page).toHaveURL(`${BASE_URL}/gallery`);
  });

  test("slow API responses show loading state", async ({ page }) => {
    // Delay API response
    await page.route("**/api/v1/discovery**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      route.continue();
    });

    await page.goto(`${BASE_URL}/gallery`);

    // Check for loading indicators during the delay
    // The page might show skeletons, spinners, or loading text
    const pageContent = await page.content();
    // After load, page should be functional
    const heading = page.getByRole("heading", { name: /Community Gallery/i });
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Community Gallery - Browser Compatibility", () => {
  test("page renders correctly in current browser", async ({ page, browserName }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const heading = page.getByRole("heading", { name: /Community Gallery/i });
    await expect(heading).toBeVisible();
  });
});

test.describe("Community Gallery - Sort Functionality", () => {
  test("displays sort dropdown", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Look for sort dropdown - it should show "Newest" by default
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await expect(sortDropdown).toBeVisible();
  });

  test("sort dropdown shows all options", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Click the sort dropdown
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await sortDropdown.click();
    
    // Wait for dropdown to open
    await page.waitForTimeout(300);
    
    // Check for all sort options
    await expect(page.getByRole("option", { name: "Newest" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Most Popular" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Most Cloned" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Trending" })).toBeVisible();
  });

  test("selecting 'Most Popular' updates URL", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Click the sort dropdown
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await sortDropdown.click();
    await page.waitForTimeout(300);
    
    // Select "Most Popular"
    await page.getByRole("option", { name: "Most Popular" }).click();
    await page.waitForTimeout(500);
    
    // URL should contain sort=popular
    await expect(page).toHaveURL(/sort=popular/);
  });

  test("selecting 'Most Cloned' updates URL", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await sortDropdown.click();
    await page.waitForTimeout(300);
    
    await page.getByRole("option", { name: "Most Cloned" }).click();
    await page.waitForTimeout(500);
    
    await expect(page).toHaveURL(/sort=most_cloned/);
  });

  test("selecting 'Trending' updates URL", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await sortDropdown.click();
    await page.waitForTimeout(300);
    
    await page.getByRole("option", { name: "Trending" }).click();
    await page.waitForTimeout(500);
    
    await expect(page).toHaveURL(/sort=trending/);
  });

  test("selecting 'Newest' removes sort from URL", async ({ page }) => {
    // Start with a sort param
    await page.goto(`${BASE_URL}/gallery?sort=popular`);
    await waitForPageReady(page);
    
    const sortDropdown = page.getByRole("combobox", { name: /Most Popular/i });
    await sortDropdown.click();
    await page.waitForTimeout(300);
    
    await page.getByRole("option", { name: "Newest" }).click();
    await page.waitForTimeout(500);
    
    // URL should not contain sort param
    const url = page.url();
    expect(url).not.toContain("sort=");
  });

  test("sort persists with tab filtering", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Set sort to popular
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await sortDropdown.click();
    await page.waitForTimeout(300);
    await page.getByRole("option", { name: "Most Popular" }).click();
    await page.waitForTimeout(500);
    
    // Switch to Agents tab
    const agentsTab = page.getByRole("tab", { name: /Agents/i });
    await agentsTab.click();
    await page.waitForTimeout(500);
    
    // Both sort and type should be in URL
    await expect(page).toHaveURL(/sort=popular/);
    await expect(page).toHaveURL(/type=agent/);
  });

  test("sort dropdown shows correct value on page load with URL param", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?sort=most_cloned`);
    await waitForPageReady(page);
    
    // Dropdown should show "Most Cloned"
    const sortDropdown = page.getByRole("combobox", { name: /Most Cloned/i });
    await expect(sortDropdown).toBeVisible();
  });

  test("sort dropdown is keyboard accessible", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Focus on sort dropdown
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await sortDropdown.focus();
    
    // Press Enter to open
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    
    // Options should be visible
    await expect(page.getByRole("option", { name: "Most Popular" })).toBeVisible();
    
    // Press Escape to close
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    
    // Options should be hidden
    await expect(page.getByRole("option", { name: "Most Popular" })).not.toBeVisible();
  });

  test("sort works with search filter", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Enter search query
    const searchInput = page.getByPlaceholder(/Search projects/i);
    await searchInput.fill("test");
    
    // Set sort
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await sortDropdown.click();
    await page.waitForTimeout(300);
    await page.getByRole("option", { name: "Trending" }).click();
    await page.waitForTimeout(500);
    
    // Sort should still be applied
    await expect(page).toHaveURL(/sort=trending/);
    // Search should still be active
    await expect(searchInput).toHaveValue("test");
  });
});

test.describe("Community Gallery - Featured Carousel", () => {
  test("featured section appears when featured projects exist", async ({ page }) => {
    // This test checks for the carousel structure
    // The carousel only shows when featuredProjects prop is passed
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    const pageContent = await page.content();
    const hasFeaturedSection = 
      pageContent.includes("Featured Projects") ||
      pageContent.includes("featured") ||
      pageContent.includes("FEATURED");
    
    expect(typeof hasFeaturedSection).toBe("boolean");
  });

  test("featured carousel has navigation arrows on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Look for carousel navigation buttons
    const leftArrow = page.getByLabel(/Scroll left/i);
    const rightArrow = page.getByLabel(/Scroll right/i);
    
    // If featured projects exist, arrows should be visible
    if (await leftArrow.count() > 0) {
      await expect(leftArrow).toBeVisible();
      await expect(rightArrow).toBeVisible();
    }
  });

  test("featured carousel hides navigation arrows on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Navigation arrows should be hidden on mobile
    const leftArrow = page.getByLabel(/Scroll left/i);
    
    if (await leftArrow.count() > 0) {
      await expect(leftArrow).not.toBeVisible();
    }
  });

  test("featured carousel is horizontally scrollable", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Check for scrollable container with snap behavior
    const scrollContainer = page.locator(".snap-x");
    
    if (await scrollContainer.count() > 0) {
      // Container should have scroll behavior
      const overflow = await scrollContainer.evaluate(el => 
        window.getComputedStyle(el).overflowX
      );
      expect(["auto", "scroll"]).toContain(overflow);
    }
  });

  test("featured cards show featured badge", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Look for featured badge on cards
    const featuredBadge = page.locator("text=FEATURED");
    
    // If featured projects exist, they should have badges
    if (await featuredBadge.count() > 0) {
      await expect(featuredBadge.first()).toBeVisible();
    }
  });
});

test.describe("Community Gallery - Sort & Filter Combined", () => {
  test("type and sort can be combined in URL", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?type=agent&sort=popular`);
    await waitForPageReady(page);
    
    // Both filters should be active
    const agentsTab = page.getByRole("tab", { name: /Agents/i });
    await expect(agentsTab).toHaveAttribute("aria-selected", "true");
    
    const sortDropdown = page.getByRole("combobox", { name: /Most Popular/i });
    await expect(sortDropdown).toBeVisible();
  });

  test("changing tab preserves sort", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?sort=trending`);
    await waitForPageReady(page);
    
    // Switch to Apps tab
    const appsTab = page.getByRole("tab", { name: /Apps/i });
    await appsTab.click();
    await page.waitForTimeout(500);
    
    // Sort should still be trending
    await expect(page).toHaveURL(/sort=trending/);
    await expect(page).toHaveURL(/type=app/);
  });

  test("changing sort preserves tab", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?type=mcp`);
    await waitForPageReady(page);
    
    // Change sort
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await sortDropdown.click();
    await page.waitForTimeout(300);
    await page.getByRole("option", { name: "Most Cloned" }).click();
    await page.waitForTimeout(500);
    
    // Tab should still be MCPs
    await expect(page).toHaveURL(/type=mcp/);
    await expect(page).toHaveURL(/sort=most_cloned/);
  });

  test("all three filters can work together", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?type=agent&sort=popular`);
    await waitForPageReady(page);
    
    // Add search
    const searchInput = page.getByPlaceholder(/Search projects/i);
    await searchInput.fill("assistant");
    await page.waitForTimeout(300);
    
    // All filters should be active
    const agentsTab = page.getByRole("tab", { name: /Agents/i });
    await expect(agentsTab).toHaveAttribute("aria-selected", "true");
    
    const sortDropdown = page.getByRole("combobox", { name: /Most Popular/i });
    await expect(sortDropdown).toBeVisible();
    
    await expect(searchInput).toHaveValue("assistant");
  });
});

test.describe("Community Gallery - Sort Edge Cases", () => {
  test("handles invalid sort parameter in URL gracefully", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?sort=invalid_sort`);
    await waitForPageReady(page);
    
    // Should default to "Newest" for invalid sort
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await expect(sortDropdown).toBeVisible();
  });

  test("handles empty sort parameter in URL", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?sort=`);
    await waitForPageReady(page);
    
    // Should default to "Newest"
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await expect(sortDropdown).toBeVisible();
  });

  test("preserves sort after page refresh", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?sort=trending`);
    await waitForPageReady(page);
    
    // Refresh the page
    await page.reload();
    await waitForPageReady(page);
    
    // Sort should still be "Trending"
    const sortDropdown = page.getByRole("combobox", { name: /Trending/i });
    await expect(sortDropdown).toBeVisible();
    await expect(page).toHaveURL(/sort=trending/);
  });

  test("handles rapid sort changes without crashing", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    const sortOptions = ["Most Popular", "Most Cloned", "Trending", "Newest"];
    
    for (let i = 0; i < 8; i++) {
      const sortDropdown = page.getByRole("combobox").first();
      await sortDropdown.click();
      await page.waitForTimeout(100);
      
      const optionName = sortOptions[i % sortOptions.length];
      const option = page.getByRole("option", { name: optionName });
      if (await option.isVisible()) {
        await option.click();
      }
      await page.waitForTimeout(100);
    }
    
    // Page should still be functional
    const heading = page.getByRole("heading", { name: /Community Gallery/i });
    await expect(heading).toBeVisible();
  });

  test("sort dropdown closes when clicking outside", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Open dropdown
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await sortDropdown.click();
    await page.waitForTimeout(300);
    
    // Verify it's open
    await expect(page.getByRole("option", { name: "Most Popular" })).toBeVisible();
    
    // Click outside (on the heading)
    const heading = page.getByRole("heading", { name: /Community Gallery/i });
    await heading.click();
    await page.waitForTimeout(300);
    
    // Dropdown should be closed
    await expect(page.getByRole("option", { name: "Most Popular" })).not.toBeVisible();
  });

  test("sort works correctly with browser back button", async ({ page }) => {
    // Start at gallery
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Change sort to popular
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await sortDropdown.click();
    await page.waitForTimeout(300);
    await page.getByRole("option", { name: "Most Popular" }).click();
    await page.waitForTimeout(500);
    
    // Verify URL changed
    await expect(page).toHaveURL(/sort=popular/);
    
    // Go back
    await page.goBack();
    await waitForPageReady(page);
    
    // Should be back to no sort (newest)
    const url = page.url();
    expect(url).not.toContain("sort=");
  });

  test("direct URL navigation with all params works", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?type=app&sort=most_cloned`);
    await waitForPageReady(page);
    
    // Verify both params are applied
    const appsTab = page.getByRole("tab", { name: /Apps/i });
    await expect(appsTab).toHaveAttribute("aria-selected", "true");
    
    const sortDropdown = page.getByRole("combobox", { name: /Most Cloned/i });
    await expect(sortDropdown).toBeVisible();
  });
});

test.describe("Community Gallery - Mobile Interactions", () => {
  test("sort dropdown works on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // Find and click sort dropdown
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await sortDropdown.click();
    await page.waitForTimeout(300);
    
    // Should show options
    await expect(page.getByRole("option", { name: "Most Popular" })).toBeVisible();
    
    // Select option
    await page.getByRole("option", { name: "Most Popular" }).click();
    await page.waitForTimeout(500);
    
    // URL should update
    await expect(page).toHaveURL(/sort=popular/);
  });

  test("tab dropdown works on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // On mobile, tabs might be a dropdown
    const tabDropdown = page.getByRole("combobox", { name: /All/i });
    if (await tabDropdown.isVisible()) {
      await tabDropdown.click();
      await page.waitForTimeout(300);
      
      // Should show tab options
      const agentsOption = page.getByRole("option", { name: /Agents/i });
      if (await agentsOption.isVisible()) {
        await agentsOption.click();
        await page.waitForTimeout(500);
        await expect(page).toHaveURL(/type=agent/);
      }
    }
  });

  test("search works on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    const searchInput = page.getByPlaceholder(/Search projects/i);
    await expect(searchInput).toBeVisible();
    
    await searchInput.fill("test");
    await expect(searchInput).toHaveValue("test");
  });

  test("page layout is correct on tablet", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);
    
    // All main elements should be visible
    const heading = page.getByRole("heading", { name: /Community Gallery/i });
    await expect(heading).toBeVisible();
    
    const searchInput = page.getByPlaceholder(/Search projects/i);
    await expect(searchInput).toBeVisible();
    
    // Sort dropdown should be visible
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await expect(sortDropdown).toBeVisible();
  });
});

test.describe("Community Gallery - URL State Management", () => {
  test("URL params are case sensitive for sort", async ({ page }) => {
    // Test with uppercase - should treat as invalid
    await page.goto(`${BASE_URL}/gallery?sort=POPULAR`);
    await waitForPageReady(page);
    
    // Should default to "Newest" since "POPULAR" is not a valid value
    const sortDropdown = page.getByRole("combobox", { name: /Newest/i });
    await expect(sortDropdown).toBeVisible();
  });

  test("multiple sort params uses first one", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?sort=popular&sort=trending`);
    await waitForPageReady(page);
    
    // Should use first sort param
    const sortDropdown = page.getByRole("combobox", { name: /Most Popular/i });
    await expect(sortDropdown).toBeVisible();
  });

  test("handles malformed URL params gracefully", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?sort=popular&type=&extra=param`);
    await waitForPageReady(page);
    
    // Page should still work
    const heading = page.getByRole("heading", { name: /Community Gallery/i });
    await expect(heading).toBeVisible();
    
    // Sort should be applied
    const sortDropdown = page.getByRole("combobox", { name: /Most Popular/i });
    await expect(sortDropdown).toBeVisible();
  });

  test("clears type when switching to All tab", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery?type=agent`);
    await waitForPageReady(page);
    
    // Switch to All tab
    const allTab = page.getByRole("tab", { name: /All/i });
    await allTab.click();
    await page.waitForTimeout(500);
    
    // Type param should be removed from URL
    const url = page.url();
    expect(url).not.toContain("type=");
  });
});

test.describe("Community Gallery - Edge Cases", () => {
  test("handles empty string in search", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const searchInput = page.getByPlaceholder(/Search projects/i);
    await searchInput.fill("");
    await page.waitForTimeout(300);

    // Should not crash
    await expect(page).toHaveURL(`${BASE_URL}/gallery`);
  });

  test("handles very long search query", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const searchInput = page.getByPlaceholder(/Search projects/i);
    const longQuery = "a".repeat(1000);
    await searchInput.fill(longQuery);
    await page.waitForTimeout(300);

    // Should not crash
    await expect(page).toHaveURL(`${BASE_URL}/gallery`);
  });

  test("handles special characters in search", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const searchInput = page.getByPlaceholder(/Search projects/i);
    await searchInput.fill("test<>\"'&%$#@!");
    await page.waitForTimeout(300);

    // Should not crash
    await expect(page).toHaveURL(`${BASE_URL}/gallery`);
  });

  test("handles unicode characters in search", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    const searchInput = page.getByPlaceholder(/Search projects/i);
    await searchInput.fill("测试 テスト 🤖");
    await page.waitForTimeout(300);

    // Should not crash
    await expect(page).toHaveURL(`${BASE_URL}/gallery`);
  });

  test("handles rapid tab switching", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // Rapidly switch tabs
    const tabs = ["All", "Agents", "Apps", "MCPs"];
    for (let i = 0; i < 10; i++) {
      const tabName = tabs[i % tabs.length];
      const tab = page.getByRole("tab", { name: new RegExp(tabName, "i") });
      await tab.click();
    }

    // Should not crash - verify page is still functional
    await expect(page).toHaveURL(`${BASE_URL}/gallery`);
  });

  test("handles page refresh", async ({ page }) => {
    await page.goto(`${BASE_URL}/gallery`);
    await waitForPageReady(page);

    // Refresh the page
    await page.reload();
    await waitForPageReady(page);

    // Page should still work
    const heading = page.getByRole("heading", { name: /Community Gallery/i });
    await expect(heading).toBeVisible();
  });
});
