import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  buildXDmDigestSkeleton,
  XServiceError,
} from "@/lib/services/x";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const result = await buildXDmDigestSkeleton({
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
