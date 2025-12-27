export const thresholds = {
  http_req_duration: ["p(50)<200", "p(95)<500", "p(99)<1000"],
  http_req_failed: ["rate<0.01"],
  http_reqs: ["rate>10"],
  "http_req_duration{endpoint:agents}": ["p(95)<400"],
  "http_req_duration{endpoint:credits}": ["p(95)<200"],
  "http_req_duration{endpoint:storage}": ["p(95)<1000"],
  "http_req_duration{endpoint:mcp}": ["p(95)<500"],
  "http_req_duration{endpoint:a2a}": ["p(95)<300"],
  "http_req_duration{endpoint:chat}": ["p(95)<5000"],
  "http_req_failed{critical:true}": ["rate<0.001"],
  checks: ["rate>0.95"],
};

export const relaxedThresholds = {
  http_req_duration: ["p(50)<500", "p(95)<2000", "p(99)<5000"],
  http_req_failed: ["rate<0.05"],
  http_reqs: ["rate>1"],
  checks: ["rate>0.80"],
};

export function getThresholds(strict = true) {
  return strict ? thresholds : relaxedThresholds;
}
