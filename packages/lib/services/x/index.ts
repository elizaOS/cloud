import { applyMarkup, type MarkupBreakdown } from "@elizaos/billing";
import { servicePricingRepository } from "@/db/repositories/service-pricing";
import { twitterAutomationService } from "@/lib/services/twitter-automation";

export type XOperation = "status" | "post" | "dm.send" | "dm.digest" | "dm.curate";

export interface XOperationCostMetadata extends MarkupBreakdown {
  operation: XOperation;
  service: "x";
}

export class XServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "XServiceError";
  }
}

async function resolveXOperationCost(operation: XOperation): Promise<XOperationCostMetadata> {
  const pricing = await servicePricingRepository.findByServiceAndMethod("x", operation);
  if (!pricing) {
    throw new XServiceError(503, `X pricing is not configured for operation ${operation}`);
  }

  const rawCost = Number(pricing.cost);
  if (!Number.isFinite(rawCost) || rawCost < 0) {
    throw new XServiceError(503, `Invalid X pricing for operation ${operation}`);
  }

  const breakdown = applyMarkup(rawCost);
  return {
    operation,
    service: "x",
    ...breakdown,
  };
}

export async function requireXCloudCredentials(organizationId: string): Promise<Record<string, string>> {
  const credentials = await twitterAutomationService.getCredentialsForAgent(organizationId);
  if (!credentials) {
    throw new XServiceError(401, "X is not connected for this organization");
  }
  return credentials;
}

export async function getXCloudStatus(organizationId: string): Promise<{
  configured: boolean;
  connected: boolean;
  status: Awaited<ReturnType<typeof twitterAutomationService.getConnectionStatus>>;
  cost: XOperationCostMetadata;
}> {
  if (!twitterAutomationService.isConfigured()) {
    throw new XServiceError(503, "X integration is not configured on this platform");
  }

  const status = await twitterAutomationService.getConnectionStatus(organizationId);
  const cost = await resolveXOperationCost("status");
  return {
    configured: true,
    connected: status.connected,
    status,
    cost,
  };
}

export async function buildXPostSkeleton(args: {
  organizationId: string;
  text: string;
}): Promise<{
  accepted: boolean;
  operation: "post";
  cost: XOperationCostMetadata;
}> {
  await requireXCloudCredentials(args.organizationId);
  const cost = await resolveXOperationCost("post");
  return {
    accepted: true,
    operation: "post",
    cost,
  };
}

export async function buildXDmSendSkeleton(args: {
  organizationId: string;
  participantId: string;
  text: string;
}): Promise<{
  accepted: boolean;
  operation: "dm.send";
  cost: XOperationCostMetadata;
}> {
  await requireXCloudCredentials(args.organizationId);
  const cost = await resolveXOperationCost("dm.send");
  return {
    accepted: true,
    operation: "dm.send",
    cost,
  };
}

export async function buildXDmDigestSkeleton(args: {
  organizationId: string;
}): Promise<{
  accepted: boolean;
  operation: "dm.digest";
  cost: XOperationCostMetadata;
}> {
  await requireXCloudCredentials(args.organizationId);
  const cost = await resolveXOperationCost("dm.digest");
  return {
    accepted: true,
    operation: "dm.digest",
    cost,
  };
}

export async function buildXDmCurateSkeleton(args: {
  organizationId: string;
}): Promise<{
  accepted: boolean;
  operation: "dm.curate";
  cost: XOperationCostMetadata;
}> {
  await requireXCloudCredentials(args.organizationId);
  const cost = await resolveXOperationCost("dm.curate");
  return {
    accepted: true,
    operation: "dm.curate",
    cost,
  };
}

export { resolveXOperationCost };
