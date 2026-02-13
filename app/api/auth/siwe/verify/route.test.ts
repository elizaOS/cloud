
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { usersService } from "@/lib/services/users";
import { POST } from "./route";

vi.mock("@/lib/cache/client");
vi.mock("@/lib/cache/consume");
vi.mock("@/lib/services/users");
vi.mock("@/lib/services/organizations");
vi.mock("@/lib/services/credits");
vi.mock("@/lib/services/api-keys");
vi.mock("@/lib/services/abuse-detection");
vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: any) => handler,
  RateLimitPresets: { STRICT: {} },
}));

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for missing message or signature", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("returns 503 when cache is unavailable", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(false);

    const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      body: JSON.stringify({
        message: "valid message",
        signature: "0xsignature",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 400 for already consumed nonce", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(0);

    const mockMessage = `localhost wants you to sign in with your Ethereum account:
0x1234567890123456789012345678901234567890

Sign in to ElizaCloud

URI: http://localhost:3000
Version: 1
Chain ID: 1
Nonce: testnonce123
Issued At: 2024-01-01T00:00:00.000Z`;

    const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      body: JSON.stringify({
        message: mockMessage,
        signature: "0x" + "a".repeat(130),
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("INVALID_NONCE");
  });
});
