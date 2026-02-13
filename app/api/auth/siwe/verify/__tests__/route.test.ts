
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

// Mock dependencies
vi.mock("@/lib/cache/client");
vi.mock("@/lib/cache/consume");
vi.mock("@/lib/services/users");
vi.mock("@/lib/services/api-keys");
vi.mock("@/lib/services/organizations");
vi.mock("@/lib/services/credits");
vi.mock("@/lib/services/abuse-detection");

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject invalid request body", async () => {
    const request = new NextRequest("http://localhost/api/auth/siwe/verify", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("INVALID_BODY");
  });

  it("should reject invalid nonce", async () => {
    const request = new NextRequest("http://localhost/api/auth/siwe/verify", {
      method: "POST",
      body: JSON.stringify({
        message: "test message",
        signature: "0xtest",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
