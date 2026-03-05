export function fetchMCPData(params) {
  return Promise.resolve({ result: "data" });
}

export function validateMCPInput(input) {
  return input !== null && typeof input === "object";
}
