/**
 * Load Test Scenario Patterns
 *
 * Reusable executor configurations for different load patterns.
 */

import { getConfig } from "./environments";

export interface ScenarioConfig {
  executor: string;
  stages?: Array<{ duration: string; target: number }>;
  vus?: number;
  duration?: string;
  rate?: number;
  timeUnit?: string;
  preAllocatedVUs?: number;
  maxVUs?: number;
}

export function rampUpScenario(maxVUs?: number): ScenarioConfig {
  const config = getConfig();
  const peak = maxVUs || config.maxVUs;

  return {
    executor: "ramping-vus",
    stages: [
      { duration: "30s", target: Math.floor(peak * 0.1) },
      { duration: "1m", target: Math.floor(peak * 0.5) },
      { duration: "2m", target: peak },
      { duration: "3m", target: peak },
      { duration: "1m", target: Math.floor(peak * 0.5) },
      { duration: "30s", target: 0 },
    ],
  };
}

export function spikeScenario(peakVUs?: number): ScenarioConfig {
  const config = getConfig();
  const peak = peakVUs || config.maxVUs * 2;
  const baseline = Math.floor(peak * 0.1);

  return {
    executor: "ramping-vus",
    stages: [
      { duration: "30s", target: baseline },
      { duration: "10s", target: peak },
      { duration: "1m", target: peak },
      { duration: "10s", target: baseline },
      { duration: "2m", target: baseline },
      { duration: "30s", target: 0 },
    ],
  };
}

export function soakScenario(vus?: number, duration?: string): ScenarioConfig {
  const config = getConfig();
  return {
    executor: "constant-vus",
    vus: vus || Math.floor(config.maxVUs * 0.3),
    duration: duration || "30m",
  };
}

export function throughputScenario(rps: number, duration?: string): ScenarioConfig {
  return {
    executor: "constant-arrival-rate",
    rate: rps,
    timeUnit: "1s",
    duration: duration || "5m",
    preAllocatedVUs: Math.ceil(rps * 2),
    maxVUs: Math.ceil(rps * 10),
  };
}

export function smokeScenario(): ScenarioConfig {
  return {
    executor: "constant-vus",
    vus: 1,
    duration: "1m",
  };
}

export function stressScenario(): ScenarioConfig {
  const config = getConfig();
  const peak = config.maxVUs;

  return {
    executor: "ramping-vus",
    stages: [
      { duration: "2m", target: Math.floor(peak * 0.5) },
      { duration: "5m", target: peak },
      { duration: "2m", target: Math.floor(peak * 1.5) },
      { duration: "5m", target: Math.floor(peak * 1.5) },
      { duration: "2m", target: peak },
      { duration: "2m", target: Math.floor(peak * 0.5) },
      { duration: "2m", target: 0 },
    ],
  };
}

