/**
 * POST /api/v1/advertising/campaigns/[id]/start — activate a campaign.
 */

import { Hono } from "hono";
import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";
import { advertisingService } from "@/lib/services/advertising";
import { logger } from "@/lib/utils/logger";

const app = new Hono<AppEnv>();

app.post("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const id = c.req.param("id")!;

    const campaign = await advertisingService.startCampaign(id, user.organization_id);

    logger.info("[Advertising API] Campaign started", { campaignId: id });

    return c.json({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      updatedAt: campaign.updated_at.toISOString(),
    });
  } catch (error) {
    return failureResponse(c, error);
  }
});

export default app;
