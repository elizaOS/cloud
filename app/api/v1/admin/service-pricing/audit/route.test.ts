import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { servicePricingRepository } from "@/db/repositories";
import { requireAdminWithResponse } from "@/lib/api/admin-auth";
import { GET } from "./route";

vi.mock("@/lib/api/admin-auth");
vi.mock("@/db/repositories");

describe("Service Pricing Audit Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/v1/admin/service-pricing/audit?service_id=solana-rpc",
    );
    vi.mocked(requireAdminWithResponse).mockResolvedValue(
      NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    );

    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(requireAdminWithResponse).toHaveBeenCalledOnce();
  });

  it("should return audit history", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/v1/admin/service-pricing/audit?service_id=solana-rpc",
    );
    vi.mocked(requireAdminWithResponse).mockResolvedValue({
      user: { id: "user-1", wallet_address: "wallet-1", organization_id: "org-1" } as any,
      isAdmin: true,
      role: "super_admin",
    });
    vi.mocked(servicePricingRepository.listAuditHistory).mockResolvedValue([
      {
        id: "audit-1",
        service_id: "solana-rpc",
        method: "getBalance",
        old_cost: "0.000006",
        new_cost: "0.000010",
        reason: "Update",
        updated_by: "user-1",
        created_at: new Date(),
      } as any,
    ]);

    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.service_id).toBe("solana-rpc");
    expect(data.history).toHaveLength(1);
  });
});
