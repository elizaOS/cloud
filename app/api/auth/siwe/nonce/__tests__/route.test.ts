
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock cache before importing route
const mockSet = vi.fn();
const mockIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("@/lib/cache/client", () => ({
  cache: {
    set: mockSet,
    isAvailable: mockIsAvailable,
  },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://example.com",
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

import { GET } from "../../nonce/route";

function makeRequest() {
  return new Request("https://example.com/api/auth/siwe/nonce", {
    method: "GET",
  });
}

describe("SIWE nonce endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a nonce and domain on success", async () => {
    mockSet.mockResolvedValue(undefined);

    const res = await GET(makeRequest() as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty("nonce");
    expect(typeof json.nonce).toBe("string");
    expect(json.nonce.length).toBeGreaterThan(0);
    expect(json).toHaveProperty("domain");
  });

  it("stores nonce in cache with a TTL", async () => {
    mockSet.mockResolvedValue(undefined);

    await GET(makeRequest() as any);

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [_key, _value, options] = mockSet.mock.calls[0];
    // Nonce should have a TTL (ex/ttl option)
    expect(options).toBeDefined();
    expect(options.ttl || options.ex || options.EX).toBeDefined();
  });

  it("returns 503 when cache is unavailable", async () => {
    mockIsAvailable.mockReturnValue(false);

    const res = await GET(makeRequest() as any);
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });
});
