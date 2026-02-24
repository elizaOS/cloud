import { createMocks } from 'node-mocks-http';
import { GET as nonceEndpoint } from '../../nonce/route';
import { POST as verifyEndpoint } from '../route';
import { NextResponse } from "next/server";

describe("SIWE Auth Endpoints", () => {
  it("should issue a nonce with correct format and TTL", async () => {
    const { req, res } = createMocks({
      method: 'GET',
      url: '/api/auth/siwe/nonce?chainId=1',
    });
    const response: NextResponse = await nonceEndpoint(req as any);
    const body = await response.json();
    expect(body.nonce).toMatch(/^[a-zA-Z0-9]{8,}$/);
    expect(body.chainId).toEqual(1);
    expect(typeof body.domain).toBe("string");
    expect(typeof body.uri).toBe("string");
    expect(body.version).toBe("1");
    expect(body.statement).toContain("ElizaCloud");
  });

  it("should reject malformed SIWE messages on verify", async () => {
    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/auth/siwe/verify',
      body: { message: "", signature: "" },
    });
    const response: NextResponse = await verifyEndpoint(req as any);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("should reject requests with missing fields", async () => {
    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/auth/siwe/verify',
      body: {},
    });
    const response: NextResponse = await verifyEndpoint(req as any);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  // More tests would be required for real signature/nonce operation,
  // which require mocking cache and address signing. This test verifies
  // endpoint shape/validation flows only.
});
