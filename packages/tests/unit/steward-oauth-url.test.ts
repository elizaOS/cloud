import { describe, expect, test } from "bun:test";
import { buildStewardOAuthAuthorizeUrl } from "@/app/login/steward-oauth-url";

describe("buildStewardOAuthAuthorizeUrl", () => {
  test("uses tenant_id for the Steward OAuth authorize URL", () => {
    const STEWARD_TENANT_ID = "elizacloud";
    const authorizeUrl = buildStewardOAuthAuthorizeUrl("google", "https://app.elizacloud.ai", {
      stewardApiUrl: "https://eliza.steward.fi",
      stewardTenantId: STEWARD_TENANT_ID,
    });
    const capturedUrl = new URL(authorizeUrl);

    expect(capturedUrl.pathname).toBe("/auth/oauth/google/authorize");
    expect(capturedUrl.searchParams.get("redirect_uri")).toBe("https://app.elizacloud.ai/login");
    expect(capturedUrl.searchParams.get("tenant_id")).toBe(STEWARD_TENANT_ID);
    expect(capturedUrl.searchParams.get("tenantId")).toBeNull();
  });

  test("preserves the login query string in the redirect_uri", () => {
    const authorizeUrl = buildStewardOAuthAuthorizeUrl("github", "https://app.elizacloud.ai", {
      redirectSearch: "?returnTo=%2Fauth%2Fcli-login%3Fsession%3Dabc",
      stewardApiUrl: "https://eliza.steward.fi",
      stewardTenantId: "elizacloud",
    });
    const capturedUrl = new URL(authorizeUrl);

    expect(capturedUrl.searchParams.get("redirect_uri")).toBe(
      "https://app.elizacloud.ai/login?returnTo=%2Fauth%2Fcli-login%3Fsession%3Dabc",
    );
  });
});
