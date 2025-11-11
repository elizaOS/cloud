import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { isTemplateCharacter, getTemplate } from "@/lib/characters/template-loader";
import { db } from "@/db/client";
import { userCharacters } from "@/db/schemas/user-characters";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthOrApiKey(request);
    const user = authResult.user;

    const body = await request.json();
    const { templateId } = body;

    if (!templateId || !isTemplateCharacter(templateId)) {
      return NextResponse.json(
        { error: "Invalid template ID" },
        { status: 400 }
      );
    }

    const template = getTemplate(templateId);
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    const existing = await db.query.userCharacters.findFirst({
      where: and(
        eq(userCharacters.user_id, user.id),
        eq(userCharacters.username, template.username!)
      ),
    });

    if (existing) {
      logger.debug("[Resolve Template] Found existing character:", {
        templateId,
        realId: existing.id,
        username: template.username,
      });

      return NextResponse.json({
        success: true,
        templateId,
        realId: existing.id,
        exists: true,
      });
    }

    logger.debug("[Resolve Template] Character does not exist yet:", {
      templateId,
      username: template.username,
    });

    return NextResponse.json({
      success: true,
      templateId,
      realId: null,
      exists: false,
    });
  } catch (error) {
    logger.error("[Resolve Template] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to resolve template",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
