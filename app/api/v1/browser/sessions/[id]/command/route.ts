import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { executeHostedBrowserCommand, logHostedBrowserFailure } from "@/lib/services/browser-tools";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const commandSchema = z.object({
  id: z.string().trim().optional(),
  key: z.string().trim().optional(),
  pixels: z.number().int().min(-5000).max(5000).optional(),
  script: z.string().optional(),
  selector: z.string().trim().optional(),
  subaction: z.enum([
    "back",
    "click",
    "eval",
    "forward",
    "get",
    "navigate",
    "press",
    "reload",
    "scroll",
    "state",
    "type",
    "wait",
  ]),
  text: z.string().optional(),
  timeoutMs: z.number().int().min(1).max(300_000).optional(),
  url: z.string().trim().url().optional(),
});

async function handlePOST(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await context.params;
    const bodyResult = commandSchema.safeParse(await request.json());
    if (!bodyResult.success) {
      return NextResponse.json(
        {
          error: "Invalid browser command",
          details: bodyResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const result = await executeHostedBrowserCommand(id, bodyResult.data, {
      apiKeyId: authResult.apiKey?.id ?? null,
      organizationId: authResult.user.organization_id,
      requestSource: "api",
      userId: authResult.user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    logHostedBrowserFailure("browser_command", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: getErrorStatusCode(error) },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
