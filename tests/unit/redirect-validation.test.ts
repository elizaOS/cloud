import { describe, expect, test } from "bun:test";
import {
  isAllowedAbsoluteRedirectUrl,
  resolveSafeRedirectTarget,
} from "@/lib/security/redirect-validation";

describe("redirect validation", () => {
  test("accepts allowlisted absolute redirect URLs", () => {
    expect(
      isAllowedAbsoluteRedirectUrl("https://app.example.com/success", [
        "https://app.example.com",
      ]),
    ).toBe(true);
  });

  test("rejects redirect URLs on untrusted origins", () => {
    expect(
      isAllowedAbsoluteRedirectUrl("https://evil.example.com/success", [
        "https://app.example.com",
      ]),
    ).toBe(false);
  });

  test("rejects redirect URLs with embedded credentials", () => {
    expect(
      isAllowedAbsoluteRedirectUrl("https://user:pass@app.example.com/success", [
        "https://app.example.com",
      ]),
    ).toBe(false);
  });

  test("resolves safe relative redirect targets against the base URL", () => {
    const target = resolveSafeRedirectTarget(
      "/dashboard/settings?tab=connections",
      "https://app.example.com",
      "/dashboard",
    );

    expect(target.toString()).toBe(
      "https://app.example.com/dashboard/settings?tab=connections",
    );
  });

  test("falls back when an external redirect target is provided", () => {
    const target = resolveSafeRedirectTarget(
      "https://evil.example.com/steal",
      "https://app.example.com",
      "/dashboard",
    );

    expect(target.toString()).toBe("https://app.example.com/dashboard");
  });
});
