import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { getAppContext, handleSecretsError } from "@/lib/api/secrets-helpers";

const CreateSchema = z.object({
  name: z.string().min(1).max(255),
  value: z.string().min(1),
  description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { app, audit } = await getAppContext(request);
    const secrets = await secretsService.getAppSecrets(
      app.id,
      app.organization_id,
      audit,
    );
    return NextResponse.json({
      secrets: Object.entries(secrets).map(([name, value]) => ({
        name,
        value,
      })),
    });
  } catch (error) {
    return handleSecretsError(error, "App Secrets");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { app, user, audit } = await getAppContext(request);
    const parsed = CreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const secret = await secretsService.create(
      {
        organizationId: app.organization_id,
        name: parsed.data.name,
        value: parsed.data.value,
        description: parsed.data.description,
        scope: "project",
        projectId: app.id,
        projectType: "app",
        createdBy: user.id,
      },
      audit,
    );

    logger.info("[App Secrets] Created", {
      name: parsed.data.name,
      appId: app.id,
    });
    return NextResponse.json(
      { id: secret.id, name: secret.name },
      { status: 201 },
    );
  } catch (error) {
    return handleSecretsError(error, "App Secrets");
  }
}
