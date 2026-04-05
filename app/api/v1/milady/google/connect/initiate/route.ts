import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  initiateManagedGoogleConnection,
  MiladyGoogleConnectorError,
} from "@/lib/services/milady-google-connector";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z.object({
  redirectUrl: z.string().trim().min(1).optional(),
  capabilities: z
    .array(
      z.enum([
        "google.basic_identity",
        "google.calendar.read",
        "google.calendar.write",
        "google.gmail.triage",
        "google.gmail.send",
      ]),
    )
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid Google connector request.", details: parsed.error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      await initiateManagedGoogleConnection({
        organizationId: user.organization_id,
        userId: user.id,
        redirectUrl: parsed.data.redirectUrl,
        capabilities: parsed.data.capabilities,
      }),
    );
  } catch (error) {
    if (error instanceof MiladyGoogleConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to initiate Google OAuth." },
      { status: 500 },
    );
  }
}
