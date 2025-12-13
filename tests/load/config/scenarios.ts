import { getConfig } from "./environments";

export function rampUpScenario(maxVUs?: number) {
  const peak = maxVUs || getConfig().maxVUs;
  return {
    executor: "ramping-vus" as const,
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

export function spikeScenario(peakVUs?: number) {
  const peak = peakVUs || getConfig().maxVUs * 2;
  const baseline = Math.floor(peak * 0.1);
  return {
    executor: "ramping-vus" as const,
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

export function soakScenario(vus?: number, duration?: string) {
  return {
    executor: "constant-vus" as const,
    vus: vus || Math.floor(getConfig().maxVUs * 0.3),
    duration: duration || "30m",
  };
}

export function throughputScenario(rps: number, duration = "5m") {
  return {
    executor: "constant-arrival-rate" as const,
    rate: rps,
    timeUnit: "1s",
    duration,
    preAllocatedVUs: Math.ceil(rps * 2),
    maxVUs: Math.ceil(rps * 10),
  };
}

export function smokeScenario() {
  return { executor: "constant-vus" as const, vus: 1, duration: "1m" };
}

export function stressScenario() {
  const peak = getConfig().maxVUs;
  return {
    executor: "ramping-vus" as const,
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
