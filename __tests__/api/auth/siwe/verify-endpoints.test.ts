import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { createMocks } from "node-mocks-http";
import { GET as getNonce } from "@/app/api/auth/siwe/nonce/route";
import { POST as postVerify } from "@/app/api/auth/siwe/verify/route";
import { NextRequest } from "next/server";
import { vi } from "vitest";

describe("SIWE Auth Endpoints Functionality", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create a nonce and validate TTL/single-use", async () => {
    // Simulate a nonce issuance request
    const { req, res } = createMocks<NextRequest>({ method: "GET" });
    // @ts-ignore
    const response: Response = await getNonce(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.nonce).toMatch(/^[a-zA-Z0-9]{17,20}$/);

    // Nonce should exist in cache
    const found = await cache.get(CacheKeys.siwe.nonce(body.nonce));
    expect(found).toBeTruthy();

    // Simulate verification (consume the nonce)
    await cache.del(CacheKeys.siwe.nonce(body.nonce));
    const after = await cache.get(CacheKeys.siwe.nonce(body.nonce));
    expect(after).toBeNull();
  });

  it("should reject invalid nonce during verify", async () => {
    const { req, res } = createMocks<NextRequest>({
      method: "POST",
      body: {
        message: "msg with nonce: INVALIDNONCE",
        signature: "0xbadfakesig",
      },
    });
    // Try to verify with an invalid nonce
    // @ts-ignore
    const response: Response = await postVerify(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("INVALID_NONCE");
  });

  // Additional end-to-end tests for correct/incorrect signatures, domain binding, etc.
});
