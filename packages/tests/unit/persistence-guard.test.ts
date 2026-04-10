import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  allowEphemeralCloudStateFallback,
  assertPersistentCloudStateConfigured,
} from "../../lib/utils/persistence-guard";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_VERCEL = process.env.VERCEL;
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;
const ORIGINAL_ENVIRONMENT = process.env.ENVIRONMENT;
const ORIGINAL_ALLOW_EPHEMERAL = process.env.MILADY_ALLOW_EPHEMERAL_CLOUD_STATE;

function restoreEnv(): void {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }

  if (ORIGINAL_VERCEL === undefined) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = ORIGINAL_VERCEL;
  }

  if (ORIGINAL_VERCEL_ENV === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  }

  if (ORIGINAL_ENVIRONMENT === undefined) {
    delete process.env.ENVIRONMENT;
  } else {
    process.env.ENVIRONMENT = ORIGINAL_ENVIRONMENT;
  }

  if (ORIGINAL_ALLOW_EPHEMERAL === undefined) {
    delete process.env.MILADY_ALLOW_EPHEMERAL_CLOUD_STATE;
  } else {
    process.env.MILADY_ALLOW_EPHEMERAL_CLOUD_STATE = ORIGINAL_ALLOW_EPHEMERAL;
  }
}

describe("persistence guard", () => {
  beforeEach(() => {
    restoreEnv();
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.ENVIRONMENT;
    delete process.env.MILADY_ALLOW_EPHEMERAL_CLOUD_STATE;
  });

  afterEach(() => {
    restoreEnv();
  });

  test("allows ephemeral fallback by default outside production", () => {
    expect(allowEphemeralCloudStateFallback()).toBe(true);
    expect(() => assertPersistentCloudStateConfigured("test-feature", false)).not.toThrow();
  });

  test("rejects ephemeral fallback in production-like environments", () => {
    process.env.NODE_ENV = "production";

    expect(allowEphemeralCloudStateFallback()).toBe(false);
    expect(() => assertPersistentCloudStateConfigured("test-feature", false)).toThrow(
      "Redis-backed shared storage is required in production",
    );
  });

  test("allows explicit override in production-like environments", () => {
    process.env.NODE_ENV = "production";
    process.env.MILADY_ALLOW_EPHEMERAL_CLOUD_STATE = "true";

    expect(allowEphemeralCloudStateFallback()).toBe(true);
    expect(() => assertPersistentCloudStateConfigured("test-feature", false)).not.toThrow();
  });
});
