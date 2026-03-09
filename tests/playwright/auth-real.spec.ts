import { test, expect, type Locator } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const REAL_AUTH_TIMEOUT_MS = 5 * 60_000;
const PRIVY_EMAIL = process.env.PLAYWRIGHT_PRIVY_EMAIL;
const PRIVY_EMAIL_CODE = process.env.PLAYWRIGHT_PRIVY_EMAIL_CODE;

async function isVisible(locator: Locator): Promise<boolean> {
  try {
    return await locator.first().isVisible();
  } catch {
    return false;
  }
}

async function waitForFirstVisible(
  locators: Locator[],
  timeout: number,
): Promise<void> {
  await Promise.any(
    locators.map(async (locator) => {
      await locator.waitFor({ state: "visible", timeout });
    }),
  );
}

test.describe("Real Authentication", () => {
  test.skip(
    process.env.PLAYWRIGHT_REAL_AUTH !== "true",
    "Set PLAYWRIGHT_REAL_AUTH=true to run the real auth smoke test.",
  );

  test("real login redirects to dashboard without auth 401s @auth-real", async ({
    page,
  }) => {
    test.setTimeout(REAL_AUTH_TIMEOUT_MS);

    const authFailures: Array<{ url: string; status: number }> = [];

    page.on("response", (response) => {
      const url = response.url();
      if (
        response.status() === 401 &&
        (url.includes("/api/v1/user") || url.includes("/api/credits/balance"))
      ) {
        authFailures.push({ url, status: response.status() });
      }
    });

    await page.goto(`${BASE_URL}/login?returnTo=%2Fdashboard`);

    const configError = page.getByText("Privy configuration is missing.");
    const loginHeading = page.getByRole("heading", {
      name: /welcome back|create account/i,
    });

    await waitForFirstVisible([configError, loginHeading], 30_000);

    if (await isVisible(configError)) {
      throw new Error(
        "Real auth requires a valid NEXT_PUBLIC_PRIVY_APP_ID in .env.local.",
      );
    }

    await expect(loginHeading).toBeVisible();

    if (PRIVY_EMAIL) {
      await page.getByPlaceholder("you@example.com").fill(PRIVY_EMAIL);
      await page.getByRole("button", { name: "Continue with Email" }).click();

      if (PRIVY_EMAIL_CODE) {
        await page.getByPlaceholder("000000").fill(PRIVY_EMAIL_CODE);
        await page.getByRole("button", { name: "Verify & Sign In" }).click();
      }
    }

    await page.waitForURL(/\/dashboard$/, {
      timeout: REAL_AUTH_TIMEOUT_MS - 30_000,
    });

    await expect(page.getByRole("link", { name: "Agents" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Containers" })).toBeVisible();
    expect(authFailures).toEqual([]);
  });
});
