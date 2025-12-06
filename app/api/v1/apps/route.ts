import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

// Schema for creating an app
const CreateAppSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  app_url: z.string().url(),
  website_url: z.string().url().optional(),
  contact_email: z.string().email().optional(),
  allowed_origins: z.array(z.string()).optional(),
  features_enabled: z
    .object({
      chat: z.boolean().optional(),
      image: z.boolean().optional(),
      video: z.boolean().optional(),
      voice: z.boolean().optional(),
      agents: z.boolean().optional(),
      embedding: z.boolean().optional(),
    })
    .optional(),
  custom_pricing_enabled: z.boolean().optional(),
  custom_pricing_markup: z.string().optional(),
  rate_limit_per_minute: z.number().int().positive().optional(),
  rate_limit_per_hour: z.number().int().positive().optional(),
  logo_url: z.string().url().optional(),
  generate_affiliate_code: z.boolean().optional(),
});

/**
 * GET /api/v1/apps
 * List all apps for the authenticated user's organization
 */
export async function GET() {
  try {
    const user = await requireAuthWithOrg();

    const apps = await appsService.listByOrganization(user.organization_id);

    return NextResponse.json({
      success: true,
      apps,
    });
  } catch (error) {
    logger.error("Failed to list apps:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list apps",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/apps
 * Create a new app
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    // Parse and validate request body
    const body = await request.json();
    const validationResult = CreateAppSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        },
        { status: 400 },
      );
    }

    const data = validationResult.data;

    // Create the app
    const result = await appsService.create({
      name: data.name,
      description: data.description,
      organization_id: user.organization_id,
      created_by_user_id: user.id,
      app_url: data.app_url,
      website_url: data.website_url,
      contact_email: data.contact_email,
      allowed_origins: data.allowed_origins,
      features_enabled: data.features_enabled,
      custom_pricing_enabled: data.custom_pricing_enabled,
      custom_pricing_markup: data.custom_pricing_markup,
      rate_limit_per_minute: data.rate_limit_per_minute,
      rate_limit_per_hour: data.rate_limit_per_hour,
      logo_url: data.logo_url,
      generate_affiliate_code: data.generate_affiliate_code,
    });

    logger.info(`Created app: ${result.app.name}`, {
      appId: result.app.id,
      userId: user.id,
      organizationId: user.organization_id,
    });

    return NextResponse.json({
      success: true,
      app: result.app,
      apiKey: result.apiKey, // Only returned once during creation
    });
  } catch (error) {
    logger.error("Failed to create app:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create app",
      },
      { status: 500 },
    );
  }
}
