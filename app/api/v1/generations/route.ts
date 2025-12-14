/**
 * Generations API
 *
 * GET /api/v1/generations - List AI-generated media (images/videos)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { generationsRepository } from "@/db/repositories";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/generations
 * List AI-generated media for the organization
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const url = new URL(request.url);
  const type = url.searchParams.get("type") as "image" | "video" | null;
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  let generations;

  if (type) {
    generations = await generationsRepository.listByOrganizationAndType(
      user.organization_id!,
      type,
      limit
    );
  } else {
    generations = await generationsRepository.listByOrganizationAndStatus(
      user.organization_id!,
      "completed",
      { limit, offset }
    );
  }

  return NextResponse.json({
    generations: generations.map((g) => ({
      id: g.id,
      type: g.type,
      status: g.status,
      url: g.output_url,
      output_url: g.output_url,
      thumbnailUrl: g.thumbnail_url,
      thumbnail_url: g.thumbnail_url,
      prompt: g.prompt,
      model: g.model,
      provider: g.provider,
      width: g.width,
      height: g.height,
      duration: g.duration,
      metadata: g.metadata,
      createdAt: g.created_at.toISOString(),
      created_at: g.created_at.toISOString(),
    })),
    count: generations.length,
  });
}

