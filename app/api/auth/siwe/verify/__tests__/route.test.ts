import { createMocks } from 'node-mocks-http';
import { POST as verifyEndpoint } from '../route';
import { NextResponse } from "next/server";

describe("SIWE Verify Endpoint", () => {
  it("should reject if cache is down (no nonce validation)", async () => {
    const { cache } = require('@/lib/cache/client');
    const original = cache.isAvailable;
    cache.isAvailable = () => false;
    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/auth/siwe/verify',
      body: { message: "foo", signature: "bar" },
    });
    const response: NextResponse = await verifyEndpoint(req as any);
    expect(response.status).toBe(503);
    cache.isAvailable = original;
  });

  it("should reject on missing request JSON", async () => {
    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/auth/siwe/verify',
      body: null,
    });
    const response: NextResponse = await verifyEndpoint(req as any);
    expect(response.status).toBe(400);
  });

  // Add further test coverage as needed for critical verification flows.
});
