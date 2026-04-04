import { afterEach, describe, expect, test } from "bun:test";
import {
  applyDatabaseUrlFallback,
  getLocalDockerDatabaseUrl,
  LOCAL_DOCKER_DATABASE_URL,
  resolveDatabaseUrl,
} from "@/db/database-url";

type StringEnv = Record<string, string | undefined>;

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("database URL fallback", () => {
  test("defaults to local Docker Postgres for local test runs", () => {
    const env = {
      NODE_ENV: "test",
      DATABASE_URL: undefined,
      TEST_DATABASE_URL: undefined,
      LOCAL_DOCKER_DB_HOST: "docker.test",
      LOCAL_DOCKER_DB_PORT: "5439",
      CI: undefined,
      VERCEL: undefined,
      DISABLE_LOCAL_DOCKER_DB_FALLBACK: undefined,
    };

    expect(resolveDatabaseUrl(env)).toBe(
      "postgresql://eliza_dev:local_dev_password@docker.test:5439/eliza_dev",
    );
  });

  test("prefers explicit test database URL over the Docker fallback", () => {
    const env = {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://app:pass@localhost:5432/app",
      TEST_DATABASE_URL: "postgresql://test:pass@localhost:5432/test",
      CI: undefined,
      VERCEL: undefined,
      DISABLE_LOCAL_DOCKER_DB_FALLBACK: undefined,
    };

    expect(resolveDatabaseUrl(env)).toBe("postgresql://test:pass@localhost:5432/test");
  });

  test("exposes the canonical localhost Docker URL constant", () => {
    expect(LOCAL_DOCKER_DATABASE_URL).toBe(
      "postgresql://eliza_dev:local_dev_password@localhost:5432/eliza_dev",
    );
  });

  test("prefers the detected local Docker host when building the fallback URL", () => {
    expect(
      getLocalDockerDatabaseUrl({
        LOCAL_DOCKER_DB_HOST: "docker.local",
        LOCAL_DOCKER_DB_PORT: "55432",
      }),
    ).toBe("postgresql://eliza_dev:local_dev_password@docker.local:55432/eliza_dev");
  });

  test("does not fall back in CI or production", () => {
    expect(
      resolveDatabaseUrl({
        NODE_ENV: "test",
        DATABASE_URL: undefined,
        TEST_DATABASE_URL: undefined,
        CI: "true",
        VERCEL: undefined,
        DISABLE_LOCAL_DOCKER_DB_FALLBACK: undefined,
      }),
    ).toBeNull();

    expect(
      resolveDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL: undefined,
        TEST_DATABASE_URL: undefined,
        CI: undefined,
        VERCEL: undefined,
        DISABLE_LOCAL_DOCKER_DB_FALLBACK: undefined,
      }),
    ).toBeNull();
  });

  test("hydrates process.env when fallback is applied", () => {
    delete process.env.DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    (process.env as StringEnv).NODE_ENV = "test";
    process.env.LOCAL_DOCKER_DB_HOST = "docker.test";
    process.env.LOCAL_DOCKER_DB_PORT = "5439";
    delete process.env.CI;
    delete process.env.VERCEL;
    delete process.env.DISABLE_LOCAL_DOCKER_DB_FALLBACK;

    const applied = applyDatabaseUrlFallback(process.env as StringEnv);

    expect(applied).toBe("postgresql://eliza_dev:local_dev_password@docker.test:5439/eliza_dev");
    expect((process.env as StringEnv).DATABASE_URL).toBe(
      "postgresql://eliza_dev:local_dev_password@docker.test:5439/eliza_dev",
    );
    expect((process.env as StringEnv).TEST_DATABASE_URL).toBe(
      "postgresql://eliza_dev:local_dev_password@docker.test:5439/eliza_dev",
    );
  });
});
