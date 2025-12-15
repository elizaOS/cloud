import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { seoService } from "@/lib/services/seo";
import {
  seoArtifactsRepository,
  seoProviderCallsRepository,
  seoRequestsRepository,
} from "@/db/repositories";
import {
  seoRequestStatusEnum,
  seoRequestTypeEnum,
  type SeoArtifact,
  type SeoProviderCall,
  type SeoRequest,
} from "@/db/schemas/seo";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  type: z.enum(seoRequestTypeEnum.enumValues),
  pageUrl: z.string().url().optional(),
  keywords: z.array(z.string().min(1)).max(100).optional(),
  locale: z.string().optional(),
  searchEngine: z.string().optional(),
  device: z.string().optional(),
  environment: z.string().optional(),
  agentIdentifier: z.string().optional(),
  promptContext: z.string().optional(),
  idempotencyKey: z.string().max(128).optional(),
  locationCode: z.number().int().optional(),
  query: z.string().optional(),
  appId: z.string().optional(),
});

function serializeRequest(request: SeoRequest) {
  return {
    ...request,
    created_at: request.created_at?.toISOString(),
    updated_at: request.updated_at?.toISOString(),
    completed_at: request.completed_at?.toISOString(),
  };
}

function serializeArtifact(artifact: SeoArtifact) {
  return {
    ...artifact,
    created_at: artifact.created_at?.toISOString(),
  };
}

function serializeProviderCall(call: SeoProviderCall) {
  return {
    ...call,
    started_at: call.started_at?.toISOString(),
    completed_at: call.completed_at?.toISOString(),
    created_at: call.created_at?.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const limitParam = searchParams.get("limit");

  const parsedStatus =
    status &&
    seoRequestStatusEnum.enumValues.includes(
      status as (typeof seoRequestStatusEnum.enumValues)[number],
    )
      ? (status as (typeof seoRequestStatusEnum.enumValues)[number])
      : undefined;

  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  const requests = await seoRequestsRepository.listByOrganization(
    user.organization_id!,
    {
      status: parsedStatus,
      limit: limit && Number.isFinite(limit) ? limit : undefined,
    },
  );

  return NextResponse.json({
    requests: requests.map(serializeRequest),
    count: requests.length,
  });
}

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await seoService.createRequest({
    organizationId: user.organization_id!,
    userId: user.id,
    apiKeyId: user.api_key_id || undefined,
    appId: parsed.data.appId,
    type: parsed.data.type,
    pageUrl: parsed.data.pageUrl,
    keywords: parsed.data.keywords,
    locale: parsed.data.locale,
    searchEngine: parsed.data.searchEngine,
    device: parsed.data.device,
    environment: parsed.data.environment,
    agentIdentifier: parsed.data.agentIdentifier,
    promptContext: parsed.data.promptContext,
    idempotencyKey: parsed.data.idempotencyKey,
    locationCode: parsed.data.locationCode,
    query: parsed.data.query,
  });

  return NextResponse.json(
    {
      request: serializeRequest(result.request),
      artifacts: result.artifacts.map(serializeArtifact),
      providerCalls: result.providerCalls.map(serializeProviderCall),
    },
    { status: 201 },
  );
}
