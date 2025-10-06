import { NextResponse } from "next/server";
import { listActiveCreditPacks } from "@/lib/queries/credit-packs";

export async function GET() {
  try {
    const creditPacks = await listActiveCreditPacks();
    return NextResponse.json({ creditPacks }, { status: 200 });
  } catch (error) {
    console.error("Error fetching credit packs:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit packs" },
      { status: 500 },
    );
  }
}
