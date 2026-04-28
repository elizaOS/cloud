import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { curateXDms } from "@/lib/services/x";
import { xRouteErrorResponse } from "../../error-response";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z
  .object({
    connectionRole: z.enum(["owner", "agent"]).optional(),
    maxResults: z.number().int().positive().optional(),
  })
  .optional();

export async function POST(request: NextRequest): Promise<NextResponse | Response> {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    let body: unknown;
    const text = await request.text();
    if (text.trim().length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { success: false, error: "Request body must be valid JSON" },
          { status: 400 },
        );
      }
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid X DM curate request",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const result = await curateXDms({
      organizationId: user.organization_id,
      connectionRole: parsed.data?.connectionRole,
      maxResults: parsed.data?.maxResults,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return xRouteErrorResponse(error);
  }
}
