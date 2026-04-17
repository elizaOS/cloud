import { networkInterfaces } from "os";

type EnvLike = Record<string, string | undefined>;

const LOCAL_DOCKER_DB_USER = "eliza_dev";
const LOCAL_DOCKER_DB_PASSWORD = "local_dev_password";
const LOCAL_DOCKER_DB_NAME = "eliza_dev";
const DEFAULT_LOCAL_DOCKER_DB_HOST = "localhost";
const DEFAULT_LOCAL_DOCKER_DB_PORT = "5432";

let cachedExternalIpv4: string | null | undefined;

function getFirstExternalIpv4Address(): string | null {
  if (cachedExternalIpv4 !== undefined) {
    return cachedExternalIpv4;
  }

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        cachedExternalIpv4 = address.address;
        return cachedExternalIpv4;
      }
    }
  }

  cachedExternalIpv4 = null;
  return cachedExternalIpv4;
}

export function getLocalDockerDatabaseUrl(env: EnvLike = process.env): string {
  const host =
    env.LOCAL_DOCKER_DB_HOST ||
    getFirstExternalIpv4Address() ||
    DEFAULT_LOCAL_DOCKER_DB_HOST;
  const port = env.LOCAL_DOCKER_DB_PORT || DEFAULT_LOCAL_DOCKER_DB_PORT;

  return `postgresql://${LOCAL_DOCKER_DB_USER}:${LOCAL_DOCKER_DB_PASSWORD}@${host}:${port}/${LOCAL_DOCKER_DB_NAME}`;
}

export const LOCAL_DOCKER_DATABASE_URL = getLocalDockerDatabaseUrl({
  LOCAL_DOCKER_DB_HOST: DEFAULT_LOCAL_DOCKER_DB_HOST,
  LOCAL_DOCKER_DB_PORT: DEFAULT_LOCAL_DOCKER_DB_PORT,
});

function isLocalExecution(env: EnvLike): boolean {
  return (
    env.VERCEL !== "1" && env.NODE_ENV !== "production" && env.CI !== "true"
  );
}

export function resolveDatabaseUrl(env: EnvLike = process.env): string | null {
  const explicitUrl = env.TEST_DATABASE_URL || env.DATABASE_URL;
  if (explicitUrl) {
    return explicitUrl;
  }

  if (env.DISABLE_LOCAL_DOCKER_DB_FALLBACK === "1") {
    return null;
  }

  if (isLocalExecution(env)) {
    return getLocalDockerDatabaseUrl(env);
  }

  return null;
}

export function applyDatabaseUrlFallback(
  env: EnvLike = process.env,
): string | null {
  const url = resolveDatabaseUrl(env);
  if (!url) {
    return null;
  }

  env.DATABASE_URL ??= url;
  if (env.NODE_ENV === "test") {
    env.TEST_DATABASE_URL ??= url;
  }

  return url;
}
