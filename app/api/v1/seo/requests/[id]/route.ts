import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  seoArtifactsRepository,
  seoProviderCallsRepository,
  seoRequestsRepository,
} from "@/db/repositories";
import type { SeoArtifact, SeoProviderCall, SeoRequest } from "@/db/schemas/seo";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(_request);
  const request = await seoRequestsRepository.findById(params.id);

  if (!request || request.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "SEO request not found" }, { status: 404 });
  }

  const [artifacts, providerCalls] = await Promise.all([
    seoArtifactsRepository.listByRequest(request.id),
    seoProviderCallsRepository.listByRequest(request.id),
  ]);

  return NextResponse.json({
    request: serializeRequest(request),
    artifacts: artifacts.map(serializeArtifact),
    providerCalls: providerCalls.map(serializeProviderCall),
  });
}

