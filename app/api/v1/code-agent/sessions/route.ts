import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit-redis";
import { logger } from "@/lib/utils/logger";

const createSessionSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  runtimeType: z.literal("vercel").default("vercel"), // Only Vercel is currently implemented
  templateUrl: z.string().url().optional(),
  environmentVariables: z.record(z.string()).optional(),
  loadOrgSecrets: z.boolean().default(true),
  capabilities: z
    .object({
      languages: z
        .array(z.enum(["python", "javascript", "typescript", "shell", "rust", "go"]))
        .optional(),
      hasGit: z.boolean().optional(),
      hasDocker: z.boolean().optional(),
      maxCpuSeconds: z.number().min(60).max(36000).optional(),
      maxMemoryMb: z.number().min(256).max(8192).optional(),
      maxDiskMb: z.number().min(100).max(51200).optional(),
      networkAccess: z.boolean().optional(),
    })
    .optional(),
  expiresInSeconds: z.number().min(60).max(86400).default(1800), // 30 min default, 24h max
  webhookUrl: z.string().url().optional(),
  webhookEvents: z
    .array(z.enum(["session_ready", "session_error", "session_terminated", "snapshot_created"]))
    .optional(),
});

const listSessionsSchema = z.object({
  status: z
    .enum([
      "creating",
      "ready",
      "executing",
      "suspended",
      "restoring",
      "terminated",
      "error",
    ])
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

async function handlePOST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const validated = createSessionSchema.parse(body);

  logger.info("[Code Agent API] Creating session", {
    userId: user.id,
    organizationId: user.organization_id,
    runtimeType: validated.runtimeType,
  });

  const session = await codeAgentService.createSession({
    organizationId: user.organization_id,
    userId: user.id,
    name: validated.name,
    description: validated.description,
    runtimeType: validated.runtimeType,
    templateUrl: validated.templateUrl,
    environmentVariables: validated.environmentVariables,
    loadOrgSecrets: validated.loadOrgSecrets,
    capabilities: validated.capabilities,
    expiresInSeconds: validated.expiresInSeconds,
    webhookUrl: validated.webhookUrl,
    webhookEvents: validated.webhookEvents,
  });

  return NextResponse.json({ session }, { status: 201 });
}

async function handleGET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const { searchParams } = new URL(request.url);
  const params = listSessionsSchema.parse({
    status: searchParams.get("status") || undefined,
    limit: searchParams.get("limit") || 50,
  });

  const sessions = await codeAgentService.listSessions(user.organization_id, {
    status: params.status,
    limit: params.limit,
  });

  return NextResponse.json({ sessions });
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
export const GET = withRateLimit(handleGET, RateLimitPresets.RELAXED);
