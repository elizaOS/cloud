import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  buildXPostSkeleton,
  XServiceError,
} from "@/lib/services/x";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const body = await request.json().catch(() => ({}));
    if (body.confirmSend !== true) {
      return NextResponse.json(
        { success: false, error: "X posting requires explicit confirmation" },
        { status: 409 },
      );
    }
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "text is required" },
        { status: 400 },
      );
    }
    const result = await buildXPostSkeleton({
      organizationId: user.organization_id,
      text: body.text.trim(),
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
