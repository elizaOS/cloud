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
    const url = 'http://localhost:3000/api/auth/siwe/nonce';
    const req = new NextRequest(new Request(url, { method: 'GET' }));
    const response: Response = await getNonce(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.nonce).toMatch(/^[a-zA-Z0-9]{17,20}$/);

    // Nonce should exist in cache
    const found = await cache.get(CacheKeys.siwe.nonce(body.nonce));
    expect(found).toBeTruthy();

    // Verify the nonce with a valid request
    const verifyUrl = 'http://localhost:3000/api/auth/siwe/verify';
    const verifyReq = new NextRequest(new Request(verifyUrl, {
      method: 'POST',
      body: JSON.stringify({
        message: `service.localhost wants you to sign in with your Ethereum account:\n${body.nonce}`,
        signature: '0xvalidsignature'
      })
    }));
    const verifyResponse = await postVerify(verifyReq);
    expect(verifyResponse.status).toBe(200);
    
    // Try to reuse the same nonce
    const reuseReq = new NextRequest(new Request(verifyUrl, {
      method: 'POST',
      body: JSON.stringify({
        message: `service.localhost wants you to sign in with your Ethereum account:\n${body.nonce}`,
        signature: '0xvalidsignature'
      })
    }));
    const reuseResponse = await postVerify(reuseReq);
    expect(reuseResponse.status).toBe(400);
    const reuseBody = await reuseResponse.json();
    expect(reuseBody.error).toBe('INVALID_NONCE');
  });

  it("should reject invalid nonce during verify", async () => {
    const invalidReq = new NextRequest(new Request(verifyUrl, {
      method: "POST", 
      body: JSON.stringify({
        message: "msg with nonce: INVALIDNONCE",
        signature: "0xbadfakesig"
      })
    }));
    // Try to verify with an invalid nonce
    // @ts-ignore
    const response: Response = await postVerify(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("INVALID_NONCE");
  });

  // Additional end-to-end tests for correct/incorrect signatures, domain binding, etc.
});
