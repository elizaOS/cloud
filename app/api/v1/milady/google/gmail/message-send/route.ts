import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { miladyGoogleRouteDeps } from "@/lib/services/milady-google-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z.object({
  side: z.enum(["owner", "agent"]).optional(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().trim().min(1),
  bodyText: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const { user } =
      await miladyGoogleRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid Gmail message send request.",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    await miladyGoogleRouteDeps.sendManagedGoogleMessage({
      organizationId: user.organization_id,
      userId: user.id,
      side: parsed.data.side ?? "owner",
      to: parsed.data.to,
      cc: parsed.data.cc,
      bcc: parsed.data.bcc,
      subject: parsed.data.subject,
      bodyText: parsed.data.bodyText,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof miladyGoogleRouteDeps.MiladyGoogleConnectorError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send Gmail message.",
      },
      { status: 500 },
    );
  }
}
