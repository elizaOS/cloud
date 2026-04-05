import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  disconnectManagedGoogleConnection,
  MiladyGoogleConnectorError,
} from "@/lib/services/milady-google-connector";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z.object({
  side: z.enum(["owner", "agent"]).optional(),
  connectionId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid disconnect request.", details: parsed.error.issues },
        { status: 400 },
      );
    }

    await disconnectManagedGoogleConnection({
      organizationId: user.organization_id,
      userId: user.id,
      side: parsed.data.side ?? "owner",
      connectionId: parsed.data.connectionId ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MiladyGoogleConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disconnect Google." },
      { status: 500 },
    );
  }
}
