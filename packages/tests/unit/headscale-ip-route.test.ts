import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { routeParams } from "./api/route-test-helpers";

const mockFindById = mock();
const savedHeadscaleInternalToken = process.env.HEADSCALE_INTERNAL_TOKEN;

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: {
    findById: mockFindById,
  },
}));

import { GET } from "@/app/api/agents/[id]/headscale-ip/route";

describe("GET /api/agents/[id]/headscale-ip", () => {
  beforeEach(() => {
    process.env.HEADSCALE_INTERNAL_TOKEN = "internal-test-token";
    mockFindById.mockReset();
  });

  afterEach(() => {
    if (savedHeadscaleInternalToken === undefined) {
      delete process.env.HEADSCALE_INTERNAL_TOKEN;
    } else {
      process.env.HEADSCALE_INTERNAL_TOKEN = savedHeadscaleInternalToken;
    }
  });

  test("requires internal auth to be configured", async () => {
    delete process.env.HEADSCALE_INTERNAL_TOKEN;

    const response = await GET(
      new NextRequest(
        "https://example.com/api/agents/550e8400-e29b-41d4-a716-446655440000/headscale-ip",
      ),
      routeParams({ id: "550e8400-e29b-41d4-a716-446655440000" }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "internal auth not configured",
    });
    expect(mockFindById).not.toHaveBeenCalled();
  });

  test("rejects spoofed forwarded headers without the shared token", async () => {
    const response = await GET(
      new NextRequest(
        "https://example.com/api/agents/550e8400-e29b-41d4-a716-446655440000/headscale-ip",
        {
          headers: {
            "x-forwarded-for": "127.0.0.1",
          },
        },
      ),
      routeParams({ id: "550e8400-e29b-41d4-a716-446655440000" }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(mockFindById).not.toHaveBeenCalled();
  });

  test("rejects malformed agent ids before querying the repository", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/agents/not-a-uuid/headscale-ip", {
        headers: {
          "x-internal-token": "internal-test-token",
        },
      }),
      routeParams({ id: "not-a-uuid" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid agent ID format",
    });
    expect(mockFindById).not.toHaveBeenCalled();
  });

  test("falls back to the health_url hostname when headscale_ip is missing", async () => {
    mockFindById.mockResolvedValue({
      headscale_ip: null,
      health_url: "http://100.64.0.8:24950/health",
      web_ui_port: 20100,
      status: "running",
    });

    const response = await GET(
      new NextRequest(
        "https://example.com/api/agents/550e8400-e29b-41d4-a716-446655440000/headscale-ip",
        {
          headers: {
            authorization: "Bearer internal-test-token",
          },
        },
      ),
      routeParams({ id: "550e8400-e29b-41d4-a716-446655440000" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      headscale_ip: "100.64.0.8",
      web_ui_port: 20100,
      status: "running",
    });
    expect(mockFindById).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000");
  });

  test("returns 404 when the sandbox does not exist", async () => {
    mockFindById.mockResolvedValue(null);

    const response = await GET(
      new NextRequest(
        "https://example.com/api/agents/550e8400-e29b-41d4-a716-446655440000/headscale-ip",
        {
          headers: {
            "x-internal-token": "internal-test-token",
          },
        },
      ),
      routeParams({ id: "550e8400-e29b-41d4-a716-446655440000" }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "agent not found",
    });
  });
});
