/**
 * Admin Content Moderation API
 * 
 * Endpoints for reviewing flagged content, viewing user risk profiles,
 * and managing content moderation across all content types.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { adminService } from "@/lib/services/admin";
import { unifiedModerationService } from "@/lib/services/unified-moderation";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

async function requireAdmin(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!user.wallet_address) {
    return { error: "Wallet required", status: 401, user: null, role: null };
  }

  const isAdmin = await adminService.isAdmin(user.wallet_address);
  if (!isAdmin) {
    return { error: "Admin required", status: 403, user: null, role: null };
  }

  const role = await adminService.getAdminRole(user.wallet_address);
  return { error: null, status: 200, user, role };
}

/**
 * GET /api/v1/admin/content-moderation
 * Get content moderation dashboard data
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "stats";
  const userId = url.searchParams.get("userId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);

  switch (view) {
    case "stats": {
      const stats = await unifiedModerationService.getStats();
      const usersWithStrikes = await unifiedModerationService.getUsersWithStrikes(10);
      return NextResponse.json({ stats, topRiskUsers: usersWithStrikes });
    }

    case "pending": {
      const items = await unifiedModerationService.getPendingReview(limit);
      return NextResponse.json({ items });
    }

    case "user-risk": {
      if (!userId) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
      }
      const profile = await unifiedModerationService.getUserRiskProfile(userId);
      return NextResponse.json(profile);
    }

    case "users-with-strikes": {
      const users = await unifiedModerationService.getUsersWithStrikes(limit);
      return NextResponse.json({ users });
    }

    default:
      return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  }
}

const ReviewSchema = z.object({
  action: z.literal("review"),
  itemId: z.string().uuid(),
  decision: z.enum(["confirm", "dismiss", "escalate"]),
  notes: z.string().optional(),
});

const ScanSchema = z.object({
  action: z.literal("scan"),
  contentType: z.enum(["image", "text", "agent", "domain", "file"]),
  sourceTable: z.string(),
  sourceId: z.string().uuid(),
  contentUrl: z.string().optional(),
});

/**
 * POST /api/v1/admin/content-moderation
 * Perform admin actions
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const action = body.action;

  if (action === "review") {
    const parsed = ReviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
    }

    await unifiedModerationService.reviewItem(
      parsed.data.itemId,
      auth.user!.id,
      parsed.data.decision,
      parsed.data.notes
    );

    logger.info("[Admin] Content reviewed", { 
      itemId: parsed.data.itemId, 
      decision: parsed.data.decision,
      reviewer: auth.user!.id,
    });

    return NextResponse.json({ success: true });
  }

  if (action === "scan") {
    const parsed = ScanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
    }

    const result = await unifiedModerationService.scan({
      contentType: parsed.data.contentType,
      sourceTable: parsed.data.sourceTable,
      sourceId: parsed.data.sourceId,
      isPublic: true,
      contentUrl: parsed.data.contentUrl,
    });

    return NextResponse.json({ success: true, result });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/**
 * HEAD /api/v1/admin/content-moderation
 * Check admin access
 */
export async function HEAD(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return new NextResponse(null, { status: auth.status });
  }
  return new NextResponse(null, { 
    status: 200, 
    headers: { "X-Admin-Role": auth.role || "unknown" },
  });
}

