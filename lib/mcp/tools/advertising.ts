import { z } from "zod";
import { advertisingService, type AdPlatform } from "@/lib/services/advertising";
import {
  AdPlatformSchema,
  ListAccountsSchema,
  ConnectAccountSchema,
  CreateCampaignSchema,
  UpdateCampaignSchema,
  CampaignIdSchema,
  CreateCreativeSchema,
  GetAnalyticsSchema,
  ListCampaignsSchema,
} from "@/lib/services/advertising/schemas";
import type { ToolResponse, AuthResultWithOrg } from "./types";

const McpConnectAccountSchema = ConnectAccountSchema.omit({ externalAccountId: true });
const McpUpdateCampaignSchema = CampaignIdSchema.merge(UpdateCampaignSchema);
const McpCreateCreativeSchema = CampaignIdSchema.merge(CreateCreativeSchema);

function ok(data: unknown): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// ============================================
// Handlers
// ============================================

export async function handleListAdAccounts(
  params: z.infer<typeof ListAccountsSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const accounts = await advertisingService.listAccounts(
    auth.user.organization_id,
    params.platform ? { platform: params.platform as AdPlatform } : undefined
  );

  return ok({
    accounts: accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      accountName: a.account_name,
      status: a.status,
    })),
    count: accounts.length,
  });
}

export async function handleConnectAdAccount(
  params: z.infer<typeof ConnectAccountSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const account = await advertisingService.connectAccount({
    organizationId: auth.user.organization_id,
    userId: auth.user.id,
    platform: params.platform as AdPlatform,
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    accountName: params.accountName,
  });

  return ok({
    success: true,
    account: {
      id: account.id,
      platform: account.platform,
      accountName: account.account_name,
      status: account.status,
    },
  });
}

export async function handleListCampaigns(
  params: { adAccountId?: string; platform?: string; status?: string },
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const campaigns = await advertisingService.listCampaigns(
    auth.user.organization_id,
    {
      adAccountId: params.adAccountId,
      platform: params.platform as AdPlatform,
      status: params.status,
    }
  );

  return ok({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      objective: c.objective,
      status: c.status,
      budgetAmount: c.budget_amount,
      totalSpend: c.total_spend,
      totalImpressions: c.total_impressions,
      totalClicks: c.total_clicks,
    })),
    count: campaigns.length,
  });
}

export async function handleCreateCampaign(
  params: z.infer<typeof CreateCampaignSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const campaign = await advertisingService.createCampaign({
    organizationId: auth.user.organization_id,
    adAccountId: params.adAccountId,
    name: params.name,
    objective: params.objective,
    budgetType: params.budgetType,
    budgetAmount: params.budgetAmount,
    budgetCurrency: params.budgetCurrency,
    startDate: params.startDate ? new Date(params.startDate) : undefined,
    endDate: params.endDate ? new Date(params.endDate) : undefined,
    targeting: params.targeting,
    appId: params.appId,
  });

  return ok({
    success: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      creditsAllocated: campaign.credits_allocated,
    },
  });
}

export async function handleUpdateCampaign(
  params: z.infer<typeof McpUpdateCampaignSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const campaign = await advertisingService.updateCampaign(
    params.campaignId,
    auth.user.organization_id,
    {
      name: params.name,
      budgetAmount: params.budgetAmount,
      targeting: params.targeting,
    }
  );

  return ok({
    success: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
    },
  });
}

export async function handleStartCampaign(
  params: z.infer<typeof CampaignIdSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const campaign = await advertisingService.startCampaign(
    params.campaignId,
    auth.user.organization_id
  );

  return ok({
    success: true,
    campaign: { id: campaign.id, status: campaign.status },
  });
}

export async function handlePauseCampaign(
  params: z.infer<typeof CampaignIdSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const campaign = await advertisingService.pauseCampaign(
    params.campaignId,
    auth.user.organization_id
  );

  return ok({
    success: true,
    campaign: { id: campaign.id, status: campaign.status },
  });
}

export async function handleDeleteCampaign(
  params: z.infer<typeof CampaignIdSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  await advertisingService.deleteCampaign(
    params.campaignId,
    auth.user.organization_id
  );

  return ok({ success: true });
}

export async function handleCreateCreative(
  params: z.infer<typeof McpCreateCreativeSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const creative = await advertisingService.createCreative(
    auth.user.organization_id,
    {
      campaignId: params.campaignId,
      name: params.name,
      type: params.type,
      headline: params.headline,
      primaryText: params.primaryText,
      description: params.description,
      callToAction: params.callToAction,
      destinationUrl: params.destinationUrl,
      media: params.media,
    }
  );

  return ok({
    success: true,
    creative: {
      id: creative.id,
      name: creative.name,
      type: creative.type,
      status: creative.status,
    },
  });
}

export async function handleGetCampaignAnalytics(
  params: z.infer<typeof GetAnalyticsSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const dateRange =
    params.startDate && params.endDate
      ? { start: new Date(params.startDate), end: new Date(params.endDate) }
      : undefined;

  const metrics = await advertisingService.getCampaignMetrics(
    params.campaignId,
    auth.user.organization_id,
    dateRange
  );

  return ok({ campaignId: params.campaignId, metrics });
}

export async function handleGetAdStats(
  params: { platform?: string },
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const stats = await advertisingService.getStats(auth.user.organization_id, {
    platform: params.platform as AdPlatform,
  });

  return ok(stats);
}

export function handleGetSupportedPlatforms(): ToolResponse {
  const platforms = advertisingService.getSupportedPlatforms();
  return ok({
    platforms,
    count: platforms.length,
  });
}

// ============================================
// Tool Definitions
// ============================================

export const advertisingTools = [
  {
    name: "ads_list_accounts",
    description: "List connected advertising platform accounts.",
    inputSchema: ListAccountsSchema,
    handler: handleListAdAccounts,
  },
  {
    name: "ads_connect_account",
    description: "Connect a new advertising platform account (Meta, Google, TikTok).",
    inputSchema: McpConnectAccountSchema,
    handler: handleConnectAdAccount,
  },
  {
    name: "ads_list_campaigns",
    description: "List advertising campaigns with optional filters.",
    inputSchema: ListCampaignsSchema,
    handler: handleListCampaigns,
  },
  {
    name: "ads_create_campaign",
    description: "Create a new advertising campaign with budget and targeting.",
    inputSchema: CreateCampaignSchema,
    handler: handleCreateCampaign,
  },
  {
    name: "ads_update_campaign",
    description: "Update an existing advertising campaign.",
    inputSchema: McpUpdateCampaignSchema,
    handler: handleUpdateCampaign,
  },
  {
    name: "ads_start_campaign",
    description: "Start/activate an advertising campaign.",
    inputSchema: CampaignIdSchema,
    handler: handleStartCampaign,
  },
  {
    name: "ads_pause_campaign",
    description: "Pause an active advertising campaign.",
    inputSchema: CampaignIdSchema,
    handler: handlePauseCampaign,
  },
  {
    name: "ads_delete_campaign",
    description: "Delete an advertising campaign and refund unused budget.",
    inputSchema: CampaignIdSchema,
    handler: handleDeleteCampaign,
  },
  {
    name: "ads_create_creative",
    description: "Create an ad creative with media from gallery.",
    inputSchema: McpCreateCreativeSchema,
    handler: handleCreateCreative,
  },
  {
    name: "ads_get_campaign_analytics",
    description: "Get analytics/metrics for a campaign.",
    inputSchema: GetAnalyticsSchema,
    handler: handleGetCampaignAnalytics,
  },
  {
    name: "ads_get_stats",
    description: "Get overall advertising statistics.",
    inputSchema: z.object({ platform: AdPlatformSchema.optional() }),
    handler: handleGetAdStats,
  },
  {
    name: "ads_get_supported_platforms",
    description: "List supported advertising platforms.",
    inputSchema: z.object({}),
    handler: handleGetSupportedPlatforms,
  },
];
