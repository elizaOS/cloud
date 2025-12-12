/**
 * Validate Social Media Credentials API
 *
 * POST /api/v1/social-media/credentials/validate
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { socialMediaService } from "@/lib/services/social-media";
import type { SocialPlatform } from "@/lib/types/social-media";

const ValidateSchema = z.object({
  platform: z.enum([
    "twitter",
    "bluesky",
    "discord",
    "telegram",
    "reddit",
    "facebook",
    "instagram",
    "tiktok",
    "linkedin",
  ]),
  credentialId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();
  const validated = ValidateSchema.parse(body);

  const result = await socialMediaService.validateCredentials(
    user.organization_id,
    validated.platform as SocialPlatform,
    validated.credentialId
  );

  return NextResponse.json(result);
}

