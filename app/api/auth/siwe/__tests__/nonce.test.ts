
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the handler
const mockCacheSet = vi.fn();
const mockCacheIsAvailable = vi.fn().mockReturnValue(true);

vi.mock("@/lib/cache/client", () => ({
  cache: {
    set: mockCacheSet,
    isAvailable: mockCacheIsAvailable,
  },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

// Import after mocks
import { GET } from "../../nonce/route";

function makeRequest(url = "https://app.example.com/api/auth/siwe/nonce") {
  return new Request(url, { method: "GET" });
}

describe("SIWE nonce endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns a nonce string and domain on success", async () => {
    const res = await GET(makeRequest() as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty("nonce");
    expect(typeof json.nonce).toBe("string");
    expect(json.nonce.length).toBeGreaterThan(0);
    expect(json).toHaveProperty("domain", "app.example.com");
  });

  it("stores the nonce in cache with a TTL", async () => {
    const res = await GET(makeRequest() as any);
    const json = await res.json();

    expect(mockCacheSet).toHaveBeenCalledTimes(1);
    const [key, value, options] = mockCacheSet.mock.calls[0];
    // Key should contain the nonce
    expect(key).toContain(json.nonce);
    // Should have a TTL (ex/ttl option)
    expect(options).toBeDefined();
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);

    const res = await GET(makeRequest() as any);

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns a different nonce on each request", async () => {
    const res1 = await GET(makeRequest() as any);
    const res2 = await GET(makeRequest() as any);
    const json1 = await res1.json();
    const json2 = await res2.json();

    expect(json1.nonce).not.toBe(json2.nonce);
  });
});
