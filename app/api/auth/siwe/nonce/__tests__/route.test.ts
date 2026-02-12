
/**
 * Tests for SIWE Nonce Endpoint
 *
 * Covers:
 * - Nonce issuance with TTL
 * - Cache unavailability handling
 * - Response format (nonce, domain)
 */

import { NextRequest } from "next/server";

const mockCacheIsAvailable = jest.fn().mockReturnValue(true);
const mockCacheSet = jest.fn().mockResolvedValue(undefined);
const mockCacheGet = jest.fn();

jest.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: () => mockCacheIsAvailable(),
    set: (...args: unknown[]) => mockCacheSet(...args),
    get: (...args: unknown[]) => mockCacheGet(...args),
  },
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: {
      nonce: (n: string) => `siwe:nonce:${n}`,
    },
  },
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: (req: NextRequest) => Promise<Response>) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// Import after mocks
import { GET } from "../../route";

function createRequest(): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/siwe/nonce", {
    method: "GET",
  });
}

async function getResponseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheGet.mockResolvedValue("1");
  });

  it("returns a nonce and domain on success", async () => {
    const req = createRequest();
    const res = await GET(req);
    const body = await getResponseBody(res);

    expect(res.status).toBe(200);
    expect(body.nonce).toBeDefined();
    expect(typeof body.nonce).toBe("string");
    expect((body.nonce as string).length).toBeGreaterThan(0);
    expect(body.domain).toBe("app.example.com");
  });

  it("stores nonce in cache with TTL", async () => {
    const req = createRequest();
    await GET(req);

    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("siwe:nonce:"),
      expect.any(String),
      expect.objectContaining({ ttl: expect.any(Number) }),
    );
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);

    const req = createRequest();
    const res = await GET(req);

    expect(res.status).toBe(503);
  });
});
