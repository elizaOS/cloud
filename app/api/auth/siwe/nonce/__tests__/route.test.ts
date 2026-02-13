
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

// Mock dependencies
vi.mock("@/lib/cache/client");

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a nonce with default chainId", async () => {
    const request = new NextRequest("http://localhost/api/auth/siwe/nonce", {
      method: "GET",
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("nonce");
    expect(data).toHaveProperty("domain");
    expect(data).toHaveProperty("chainId");
    expect(data.chainId).toBe(1);
  });

  it("should reject invalid chainId parameter", async () => {
    const request = new NextRequest(
      "http://localhost/api/auth/siwe/nonce?chainId=invalid",
      { method: "GET" }
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
  });
});
