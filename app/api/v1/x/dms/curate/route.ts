import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  buildXDmCurateSkeleton,
  XServiceError,
} from "@/lib/services/x";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    await request.json().catch(() => ({}));
    const result = await buildXDmCurateSkeleton({
      organizationId: user.organization_id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof XServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
