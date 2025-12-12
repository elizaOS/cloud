/**
 * Social Media Credentials API
 *
 * POST /api/v1/social-media/credentials - Store credentials for a platform
 * POST /api/v1/social-media/credentials/validate - Validate credentials
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { socialMediaService } from "@/lib/services/social-media";
import type { SocialPlatform, SocialCredentials } from "@/lib/types/social-media";

const SocialPlatformSchema = z.enum([
  "twitter",
  "bluesky",
  "discord",
  "telegram",
  "reddit",
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
]);

const StoreCredentialsSchema = z.object({
  platform: SocialPlatformSchema,
  credentials: z.object({
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
    botToken: z.string().optional(),
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    email: z.string().optional(),
    handle: z.string().optional(),
    appPassword: z.string().optional(),
    webhookUrl: z.string().optional(),
  }),
});

const ValidateSchema = z.object({
  platform: SocialPlatformSchema,
  credentialId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();
  const validated = StoreCredentialsSchema.parse(body);

  await socialMediaService.storeCredentials(
    user.organization_id,
    user.id,
    validated.platform as SocialPlatform,
    validated.credentials as Partial<SocialCredentials>
  );

  return NextResponse.json({
    success: true,
    platform: validated.platform,
    message: "Credentials stored successfully",
  });
}
