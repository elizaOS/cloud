import { POST as verifyEndpoint } from '../route';
import { NextRequest, NextResponse } from "next/server";

describe("SIWE Verify Endpoint", () => {
  it("should reject if cache is down (no nonce validation)", async () => {
    const { cache } = require('@/lib/cache/client');
    const original = cache.isAvailable;
    cache.isAvailable = () => false;
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "foo", signature: "bar" }),
    });
    const response: NextResponse = await verifyEndpoint(req);
    expect(response.status).toBe(503);
    cache.isAvailable = original;
  });

  it("should reject on missing request JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    });
    const response: NextResponse = await verifyEndpoint(req);
    expect(response.status).toBe(400);
  });

  // Add further test coverage as needed for critical verification flows.
});
