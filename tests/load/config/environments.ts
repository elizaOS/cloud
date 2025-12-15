export type Environment = "local" | "staging" | "production";

export interface EnvironmentConfig {
  name: string;
  baseUrl: string;
  maxVUs: number;
  rampUpDuration: string;
  testDuration: string;
  safeMode: boolean;
}

export const environments: Record<Environment, EnvironmentConfig> = {
  local: {
    name: "Local",
    baseUrl: "http://localhost:3000",
    maxVUs: 100,
    rampUpDuration: "30s",
    testDuration: "5m",
    safeMode: false,
  },
  staging: {
    name: "Staging",
    baseUrl: "https://staging.elizacloud.ai",
    maxVUs: 50,
    rampUpDuration: "1m",
    testDuration: "10m",
    safeMode: true,
  },
  production: {
    name: "Production",
    baseUrl: "https://elizacloud.ai",
    maxVUs: 10,
    rampUpDuration: "30s",
    testDuration: "2m",
    safeMode: true,
  },
};

export function getEnvironment(): Environment {
  const env = (__ENV.LOAD_TEST_ENV || "local") as Environment;
  if (!environments[env]) throw new Error(`Invalid LOAD_TEST_ENV: ${env}`);
  return env;
}

export function getConfig(): EnvironmentConfig {
  return environments[getEnvironment()];
}

export function getBaseUrl(): string {
  return __ENV.BASE_URL || getConfig().baseUrl;
}
