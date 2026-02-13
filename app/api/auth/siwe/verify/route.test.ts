
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";

// Mock dependencies
vi.mock("@/lib/cache/client");
vi.mock("@/lib/cache/consume");
vi.mock("@/lib/services/users");
vi.mock("@/lib/services/api-keys");

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject when cache is unavailable", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(false);

    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      body: JSON.stringify({ message: "test", signature: "0xtest" }),
    });
    const response = await POST(req);

    expect(response.status).toBe(503);
  });

  it("should reject invalid nonce", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(0);

    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      body: JSON.stringify({
        message: "example.com wants you to sign in with your Ethereum account:\n0xAddress\n\nSign in to ElizaCloud\n\nURI: http://example.com\nVersion: 1\nChain ID: 1\nNonce: invalid\nIssued At: 2024-01-01T00:00:00.000Z",
        signature: "0xtest",
      }),
    });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("INVALID_NONCE");
  });
});
