import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/middleware/app-auth";
import { platformCredentialsService, SOCIAL_PLATFORMS } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

const ManualCredentialsSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("bluesky"),
    credentials: z.object({
      handle: z.string().min(1, "Handle is required"),
      appPassword: z.string().min(1, "App password is required"),
    }),
  }),
  z.object({
    platform: z.literal("telegram"),
    credentials: z.object({
      botToken: z.string().min(1, "Bot token is required").regex(/^\d+:[A-Za-z0-9_-]+$/, "Invalid bot token format"),
    }),
  }),
]);

type ManualCredentialsInput = z.infer<typeof ManualCredentialsSchema>;

const isSocialPlatform = (platform: string): boolean =>
  (SOCIAL_PLATFORMS as readonly string[]).includes(platform);

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const platforms = await platformCredentialsService.getAvailablePlatforms(authResult.organization_id);
  return NextResponse.json({
    success: true,
    platforms: platforms.filter(p => isSocialPlatform(p.platform)),
  });
}

function toManualCredentials(data: ManualCredentialsInput): { handle?: string; appPassword?: string; botToken?: string } {
  if (data.platform === "bluesky") {
    return { handle: data.credentials.handle, appPassword: data.credentials.appPassword };
  }
  return { botToken: data.credentials.botToken };
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ManualCredentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ 
      success: false, 
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    }, { status: 400 });
  }

  const { platform } = parsed.data;

  const credential = await platformCredentialsService.storeManualCredentials({
    organizationId: authResult.organization_id,
    userId: authResult.id,
    platform,
    credentials: toManualCredentials(parsed.data),
  });

  logger.info("[SocialConnections] Manual credentials stored", { 
    platform, 
    userId: authResult.id,
    credentialId: credential.id,
  });

  return NextResponse.json({
    success: true,
    connection: {
      id: credential.id,
      platform: credential.platform,
      username: credential.platform_username,
      displayName: credential.platform_display_name,
      avatarUrl: credential.platform_avatar_url,
      status: credential.status,
      linkedAt: credential.linked_at,
    },
  });
}

