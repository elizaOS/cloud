/**
 * GET /api/organizations/members
 * Lists all members of the organization. Owner / admin only.
 */

import { Hono } from "hono";

import { usersService } from "@/lib/services/users";
import { logger } from "@/lib/utils/logger";
import { requireUserWithOrg } from "../../../src/lib/auth";
import type { AppEnv } from "../../../src/lib/context";
import { failureResponse } from "../../../src/lib/errors";
import { rateLimit, RateLimitPresets } from "../../../src/lib/rate-limit";

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STANDARD));

app.get("/", async (c) => {
  try {
    const user = await requireUserWithOrg(c);
    if (user.role !== "owner" && user.role !== "admin") {
      return c.json({ success: false, error: "Only owners and admins can view members" }, 403);
    }

    const members = await usersService.listByOrganization(user.organization_id);
    return c.json({
      success: true,
      data: members.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        wallet_address: member.wallet_address,
        wallet_chain_type: member.wallet_chain_type,
        role: member.role,
        is_active: member.is_active,
        created_at: member.created_at,
        updated_at: member.updated_at,
      })),
    });
  } catch (error) {
    logger.error("Error fetching members:", error);
    return failureResponse(c, error);
  }
});

export default app;
