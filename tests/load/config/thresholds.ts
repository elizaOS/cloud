/**
 * Load Test Thresholds
 *
 * Defines pass/fail criteria for load tests.
 * All thresholds must pass for the test to succeed.
 */

export const thresholds = {
  // Overall response time requirements
  http_req_duration: ["p(50)<200", "p(95)<500", "p(99)<1000"],

  // Error rates
  http_req_failed: ["rate<0.01"],

  // Throughput minimum
  http_reqs: ["rate>10"],

  // Per-endpoint thresholds (tagged requests)
  "http_req_duration{endpoint:agents}": ["p(95)<400"],
  "http_req_duration{endpoint:credits}": ["p(95)<200"],
  "http_req_duration{endpoint:storage}": ["p(95)<1000"],
  "http_req_duration{endpoint:mcp}": ["p(95)<500"],
  "http_req_duration{endpoint:a2a}": ["p(95)<300"],
  "http_req_duration{endpoint:chat}": ["p(95)<5000"],
  "http_req_duration{endpoint:discovery}": ["p(95)<600"],

  // Critical endpoints must have very low error rate
  "http_req_failed{critical:true}": ["rate<0.001"],

  // Custom business metrics
  checks: ["rate>0.95"],
};

export const relaxedThresholds = {
  http_req_duration: ["p(50)<500", "p(95)<2000", "p(99)<5000"],
  http_req_failed: ["rate<0.05"],
  http_reqs: ["rate>1"],
  checks: ["rate>0.80"],
};

export function getThresholds(strict: boolean = true) {
  return strict ? thresholds : relaxedThresholds;
}

