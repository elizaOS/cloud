
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { cache } from "@/lib/cache/client";

// Mock dependencies
vi.mock("@/lib/cache/client");
vi.mock("viem/siwe", () => ({
  generateSiweNonce: () => "mock-nonce-123456",
}));

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return nonce when cache is available", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);

    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    const response = await GET(req);
    const data = await response.json();

    expect(data.nonce).toBe("mock-nonce-123456");
    expect(data.domain).toBeDefined();
  });

  it("should return 503 when cache is unavailable", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(false);

    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    const response = await GET(req);

    expect(response.status).toBe(503);
  });
});
