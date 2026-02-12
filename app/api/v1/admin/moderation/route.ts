
/**
 * Admin Moderation API
 *
 * Comprehensive endpoints for admin panel:
 * - View/manage admins
 * - View/manage users
 * - View moderation violations
 * - Ban/unban users
 * - Mark users as spammers/scammers
 *
 * Authentication: Requires wallet-connected user with admin privileges.
 * In devnet, the default anvil wallet (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266) is auto-admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminWithResponse } from "@/lib/api/admin-auth";
import type { AdminAuthResult } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { adminService } from "@/lib/services/admin";
import { z } from "zod";

/**
 * GET /api/v1/admin/moderation
 * Get admin dashboard data.
 *
 * Query params:
 * - view: "overview" | "violations" | "users" | "admins" | "user-detail"
 * - limit: Number of items to return (default 100)
 * - userId: For user-detail view
 */
export async function GET(request: NextRequest) {
  let user;
  let role: string;
  const authResult = await requireAdminWithResponse(
    request,
    "[Admin] Moderation GET auth error",
  );
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  user = authResult.user;
  role = authResult.role;

  try {

    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "overview";
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "100"),
      1000,
    );
    const userId = url.searchParams.get("userId");

    switch (view) {
      case "overview": {
        const [violations, flaggedUsers, bannedUsers, admins] = await Promise.all(
          [
            adminService.getRecentViolations(10),
            adminService.getUsersFlaggedForReview(),
            adminService.getBannedUsers(),
            adminService.getAdmins(),
          ],
        );

        return NextResponse.json({
          violations,
          flaggedUsers,
          bannedUsers,
          admins,
          currentUser: {
            id: user.id,
            role,
          },
        });
      }

      case "violations": {
        const violations = await adminService.getRecentViolations(limit);
        return NextResponse.json({ violations });
      }

      case "users": {
        const users = await adminService.getUsersFlaggedForReview();
        return NextResponse.json({ users });
      }

      case "admins": {
        const admins = await adminService.getAdmins();
        return NextResponse.json({ admins });
      }

      case "user-detail": {
        if (!userId) {
          return NextResponse.json(
            { error: "userId query parameter is required" },
            { status: 400 },
          );
        }
        const userDetail = await adminService.getUserDetail(userId);
        if (!userDetail) {
          return NextResponse.json(
            { error: "User not found" },
            { status: 404 },
          );
        }
        return NextResponse.json({ user: userDetail });
      }

      default:
        return NextResponse.json(
          { error: `Unknown view: ${view}` },
          { status: 400 },
        );
    }
  } catch (error) {
    logger.error("[Admin] Moderation GET error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

const ActionSchema = z.object({
  action: z.enum([
    "ban",
    "unban",
    "mark_spammer",
    "mark_scammer",
    "clear_flags",
    "add_admin",
    "revoke_admin",
  ]),
  targetUserId: z.string().optional(),
  targetWalletAddress: z.string().optional(),
  reason: z.string().optional(),
  role: z.string().optional(),
});

/**
 * POST /api/v1/admin/moderation
 * Perform admin actions: ban, unban, mark users, manage admins.
 */
export async function POST(request: NextRequest) {
  let user: AdminAuthResult["user"];
  let adminRole: string;

  const authResult = await requireAdminWithResponse(
    request,
    "[Admin] Moderation POST auth error",
  );
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  user = authResult.user;
  adminRole = authResult.role;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ActionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { action, targetUserId, targetWalletAddress, reason, role } =
    parsed.data;

  try {
    switch (action) {
      case "ban": {
        if (!targetUserId) {
          return NextResponse.json(
            { error: "targetUserId is required" },
            { status: 400 },
          );
        }
        await adminService.banUser(targetUserId, user.id, reason);
        logger.info("[Admin] User banned", {
          targetUserId,
          adminId: user.id,
          reason,
        });
        return NextResponse.json({ success: true, action: "ban" });
      }

      case "unban": {
        if (!targetUserId) {
          return NextResponse.json(
            { error: "targetUserId is required" },
            { status: 400 },
          );
        }
        await adminService.unbanUser(targetUserId, user.id);
        logger.info("[Admin] User unbanned", {
          targetUserId,
          adminId: user.id,
        });
        return NextResponse.json({ success: true, action: "unban" });
      }

      case "mark_spammer": {
        if (!targetUserId) {
          return NextResponse.json(
            { error: "targetUserId is required" },
            { status: 400 },
          );
        }
        await adminService.markSpammer(targetUserId, user.id, reason);
        logger.info("[Admin] User marked as spammer", {
          targetUserId,
          adminId: user.id,
        });
        return NextResponse.json({ success: true, action: "mark_spammer" });
      }

      case "mark_scammer": {
        if (!targetUserId) {
          return NextResponse.json(
            { error: "targetUserId is required" },
            { status: 400 },
          );
        }
        await adminService.markScammer(targetUserId, user.id, reason);
        logger.info("[Admin] User marked as scammer", {
          targetUserId,
          adminId: user.id,
        });
        return NextResponse.json({ success: true, action: "mark_scammer" });
      }

      case "clear_flags": {
        if (!targetUserId) {
          return NextResponse.json(
            { error: "targetUserId is required" },
            { status: 400 },
          );
        }
        await adminService.clearFlags(targetUserId, user.id);
        logger.info("[Admin] User flags cleared", {
          targetUserId,
          adminId: user.id,
        });
        return NextResponse.json({ success: true, action: "clear_flags" });
      }

      case "add_admin": {
        if (adminRole !== "super_admin") {
          return NextResponse.json(
            { error: "Super admin privileges required" },
            { status: 403 },
          );
        }
        if (!targetWalletAddress) {
          return NextResponse.json(
            { error: "targetWalletAddress is required" },
            { status: 400 },
          );
        }
        if (adminRole !== "super_admin") {
          return NextResponse.json(
            { error: "Super admin privileges required" },
            { status: 403 },
          );
        }
        await adminService.addAdmin(
          targetWalletAddress,
          role || "admin",
          user.id,
        );
        logger.info("[Admin] Admin added", {
          targetWalletAddress,
          role: role || "admin",
          adminId: user.id,
        });
        return NextResponse.json({ success: true, action: "add_admin" });
      }

      case "revoke_admin": {
        if (adminRole !== "super_admin") {
          return NextResponse.json(
            { error: "Super admin privileges required" },
            { status: 403 },
          );
        }
        if (!targetWalletAddress) {
          return NextResponse.json(
            { error: "targetWalletAddress is required" },
            { status: 400 },
          );
        }
        if (targetWalletAddress === user.wallet_address) {
          return NextResponse.json(
            { error: "Cannot revoke your own admin privileges" },
            { status: 400 },
          );
        }
        await adminService.revokeAdmin(targetWalletAddress, user.id);
        logger.info("[Admin] Admin revoked", {
          targetWalletAddress,
          adminId: user.id,
        });
        return NextResponse.json({ success: true, action: "revoke_admin" });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    logger.error("[Admin] Moderation POST error", {
      action,
      error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
