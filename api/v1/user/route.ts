/**
 * GET   /api/v1/user — current user's profile + organization summary.
 * PATCH /api/v1/user — update profile fields.
 */

import { Hono } from "hono";
import { z } from "zod";

import { usersService } from "@/lib/services/users";
import { logger } from "@/lib/utils/logger";
import { requireUserOrApiKey } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse, NotFoundError } from "@/api-lib/errors";
import { rateLimit, RateLimitPresets } from "@/api-lib/rate-limit";

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional().or(z.literal("")),
  nickname: z.string().max(50).optional(),
  work_function: z
    .enum(["developer", "designer", "product", "data", "marketing", "sales", "other"])
    .optional(),
  preferences: z.string().max(1000).optional(),
  response_notifications: z.boolean().optional(),
  email_notifications: z.boolean().optional(),
});

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STANDARD));

app.get("/", async (c) => {
  try {
    const authed = await requireUserOrApiKey(c);
    const user = await usersService.getWithOrganization(authed.id);
    if (!user) throw NotFoundError("User not found");

    return c.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        nickname: user.nickname,
        work_function: user.work_function,
        preferences: user.preferences,
        response_notifications: user.response_notifications,
        email_notifications: user.email_notifications,
        role: user.role,
        email_verified: user.email_verified,
        wallet_address: user.wallet_address,
        wallet_chain_type: user.wallet_chain_type,
        wallet_verified: user.wallet_verified,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
        organization: {
          id: user.organization?.id,
          name: user.organization?.name,
          slug: user.organization?.slug,
          credit_balance: user.organization?.credit_balance,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching user:", error);
    return failureResponse(c, error);
  }
});

app.patch("/", async (c) => {
  try {
    const authed = await requireUserOrApiKey(c);
    const body = await c.req.json();
    const validated = updateUserSchema.parse(body);

    const updated = await usersService.update(authed.id, {
      ...(validated.name && { name: validated.name }),
      ...(validated.avatar !== undefined && { avatar: validated.avatar || null }),
      ...(validated.nickname !== undefined && { nickname: validated.nickname }),
      ...(validated.work_function !== undefined && { work_function: validated.work_function }),
      ...(validated.preferences !== undefined && { preferences: validated.preferences }),
      ...(validated.response_notifications !== undefined && {
        response_notifications: validated.response_notifications,
      }),
      ...(validated.email_notifications !== undefined && {
        email_notifications: validated.email_notifications,
      }),
    });

    if (!updated) {
      return c.json({ success: false, error: "Failed to update user" }, 500);
    }

    return c.json({
      success: true,
      data: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        avatar: updated.avatar,
        nickname: updated.nickname,
        work_function: updated.work_function,
        preferences: updated.preferences,
        response_notifications: updated.response_notifications,
        email_notifications: updated.email_notifications,
        role: updated.role,
        wallet_address: updated.wallet_address,
        wallet_chain_type: updated.wallet_chain_type,
        wallet_verified: updated.wallet_verified,
        updated_at: updated.updated_at,
      },
      message: "Profile updated successfully",
    });
  } catch (error) {
    logger.error("Error updating user:", error);
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: "Validation error", details: error.issues }, 400);
    }
    return failureResponse(c, error);
  }
});

export default app;
