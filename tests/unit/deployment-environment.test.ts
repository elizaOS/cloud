import { describe, expect, test } from "bun:test";
import {
  isProductionDeployment,
  shouldBlockDevnetBypass,
  shouldBlockUnsafeWebhookSkip,
} from "@/lib/config/deployment-environment";

describe("deployment environment detection", () => {
  test("treats bare NODE_ENV=production as production", () => {
    expect(
      isProductionDeployment({
        NODE_ENV: "production",
      }),
    ).toBe(true);
  });

  test("treats Vercel preview builds as non-production", () => {
    expect(
      isProductionDeployment({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toBe(false);
  });

  test("treats Vercel production deployments as production", () => {
    expect(
      isProductionDeployment({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toBe(true);
  });

  test("blocks unsafe webhook skip only for production deployments", () => {
    expect(
      shouldBlockUnsafeWebhookSkip({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        SKIP_WEBHOOK_VERIFICATION: "true",
      }),
    ).toBe(false);
    expect(
      shouldBlockUnsafeWebhookSkip({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        SKIP_WEBHOOK_VERIFICATION: "true",
      }),
    ).toBe(true);
  });

  test("blocks devnet bypass only for production deployments", () => {
    expect(
      shouldBlockDevnetBypass({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        DEVNET: "true",
      }),
    ).toBe(false);
    expect(
      shouldBlockDevnetBypass({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        DEVNET: "true",
      }),
    ).toBe(true);
  });
});
