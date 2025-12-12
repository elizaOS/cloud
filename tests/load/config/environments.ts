/**
 * Load Test Environment Configuration
 *
 * Defines URL, authentication, and load limits for each environment.
 * Environment is selected via LOAD_TEST_ENV env var.
 */

export type Environment = "local" | "staging" | "production";

export interface EnvironmentConfig {
  name: string;
  baseUrl: string;
  maxVUs: number;
  rampUpDuration: string;
  testDuration: string;
  safeMode: boolean;
  rateLimit: number;
}

export const environments: Record<Environment, EnvironmentConfig> = {
  local: {
    name: "Local Development",
    baseUrl: "http://localhost:3000",
    maxVUs: 100,
    rampUpDuration: "30s",
    testDuration: "5m",
    safeMode: false,
    rateLimit: 1000,
  },
  staging: {
    name: "Staging",
    baseUrl: "https://staging.elizacloud.ai",
    maxVUs: 50,
    rampUpDuration: "1m",
    testDuration: "10m",
    safeMode: true,
    rateLimit: 200,
  },
  production: {
    name: "Production",
    baseUrl: "https://elizacloud.ai",
    maxVUs: 10,
    rampUpDuration: "30s",
    testDuration: "2m",
    safeMode: true,
    rateLimit: 50,
  },
};

export function getEnvironment(): Environment {
  const env = __ENV.LOAD_TEST_ENV || "local";
  if (env !== "local" && env !== "staging" && env !== "production") {
    throw new Error(`Invalid LOAD_TEST_ENV: ${env}. Must be local, staging, or production`);
  }
  return env;
}

export function getConfig(): EnvironmentConfig {
  return environments[getEnvironment()];
}

export function getBaseUrl(): string {
  return __ENV.BASE_URL || getConfig().baseUrl;
}

