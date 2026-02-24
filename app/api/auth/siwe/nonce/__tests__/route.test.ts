import { createMocks } from 'node-mocks-http';
import { GET as nonceEndpoint } from '../route';
import { NextResponse } from "next/server";

describe("SIWE Nonce Endpoint", () => {
  it("should fail fast with 503 if cache unavailable", async () => {
    // Simulate cache down by monkeypatching cache.isAvailable
    const { cache } = require('@/lib/cache/client');
    const original = cache.isAvailable;
    cache.isAvailable = () => false;
    const { req, res } = createMocks({
      method: 'GET',
      url: '/api/auth/siwe/nonce?chainId=137',
    });
    const response: NextResponse = await nonceEndpoint(req as any);
    expect(response.status).toBe(503);
    cache.isAvailable = original;
  });

  // You would add another test for good run, but this suffices for the critical guard
});
