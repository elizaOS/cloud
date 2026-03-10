import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { canAutoCreateWaifuBridgeOrg } from "@/lib/auth/waifu-bridge";

describe("waifu bridge auth policy", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedAutoCreate = process.env.WAIFU_BRIDGE_ALLOW_ORG_AUTO_CREATE;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    delete process.env.WAIFU_BRIDGE_ALLOW_ORG_AUTO_CREATE;
  });

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
    process.env.WAIFU_BRIDGE_ALLOW_ORG_AUTO_CREATE = savedAutoCreate;
  });

  test("disables auto-creating orgs in production by default", () => {
    expect(canAutoCreateWaifuBridgeOrg()).toBe(false);
  });

  test("allows explicit production opt-in for org auto-creation", () => {
    process.env.WAIFU_BRIDGE_ALLOW_ORG_AUTO_CREATE = "true";
    expect(canAutoCreateWaifuBridgeOrg()).toBe(true);
  });
});
