import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { organizationsRepository } from "@/db/repositories";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();
    const organizationId = user.organization_id!;

    const org = await organizationsRepository.findById(organizationId);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const balance = Number(org.credit_balance || 0);

    return NextResponse.json({ balance });
  } catch (error) {
    console.error("[Balance API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch balance" },
      { status: 500 },
    );
  }
}
