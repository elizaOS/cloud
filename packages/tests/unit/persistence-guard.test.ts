import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  allowEphemeralCloudStateFallback,
  assertPersistentCloudStateConfigured,
} from "../../lib/utils/persistence-guard";

const env = process.env as Record<string, string | undefined>;
const ORIGINAL_NODE_ENV = env.NODE_ENV;
const ORIGINAL_VERCEL = env.VERCEL;
const ORIGINAL_VERCEL_ENV = env.VERCEL_ENV;
const ORIGINAL_ENVIRONMENT = env.ENVIRONMENT;
const ORIGINAL_ALLOW_EPHEMERAL = env.MILADY_ALLOW_EPHEMERAL_CLOUD_STATE;

function restoreEnv(): void {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = ORIGINAL_NODE_ENV;
  }

  if (ORIGINAL_VERCEL === undefined) {
    delete env.VERCEL;
  } else {
    env.VERCEL = ORIGINAL_VERCEL;
  }

  if (ORIGINAL_VERCEL_ENV === undefined) {
    delete env.VERCEL_ENV;
  } else {
    env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  }

  if (ORIGINAL_ENVIRONMENT === undefined) {
    delete env.ENVIRONMENT;
  } else {
    env.ENVIRONMENT = ORIGINAL_ENVIRONMENT;
  }

  if (ORIGINAL_ALLOW_EPHEMERAL === undefined) {
    delete env.MILADY_ALLOW_EPHEMERAL_CLOUD_STATE;
  } else {
    env.MILADY_ALLOW_EPHEMERAL_CLOUD_STATE = ORIGINAL_ALLOW_EPHEMERAL;
  }
}

describe("persistence guard", () => {
  beforeEach(() => {
    restoreEnv();
    env.NODE_ENV = "test";
    delete env.VERCEL;
    delete env.VERCEL_ENV;
    delete env.ENVIRONMENT;
    delete env.MILADY_ALLOW_EPHEMERAL_CLOUD_STATE;
  });

  afterEach(() => {
    restoreEnv();
  });

  test("allows ephemeral fallback by default outside production", () => {
    expect(allowEphemeralCloudStateFallback()).toBe(true);
    expect(() =>
      assertPersistentCloudStateConfigured("test-feature", false),
    ).not.toThrow();
  });

  test("rejects ephemeral fallback in production-like environments", () => {
    env.NODE_ENV = "production";

    expect(allowEphemeralCloudStateFallback()).toBe(false);
    expect(() =>
      assertPersistentCloudStateConfigured("test-feature", false),
    ).toThrow("Redis-backed shared storage is required in production");
  });

  test("allows explicit override in production-like environments", () => {
    env.NODE_ENV = "production";
    env.MILADY_ALLOW_EPHEMERAL_CLOUD_STATE = "true";

    expect(allowEphemeralCloudStateFallback()).toBe(true);
    expect(() =>
      assertPersistentCloudStateConfigured("test-feature", false),
    ).not.toThrow();
  });
});
