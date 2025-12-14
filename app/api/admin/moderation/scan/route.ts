/**
 * Manual Moderation Scan Endpoint
 * Allows admins to trigger scans on specific domains or agents
 */

import { NextRequest, NextResponse } from "next/server";
import { domainContentModerationService } from "@/lib/services/domain-content-moderation";
import { logger } from "@/lib/utils/logger";

// Simple admin check - in production use proper auth middleware
function isAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return false;
  return authHeader === `Bearer ${adminKey}`;
}

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { type, id, force } = body as { type?: string; id?: string; force?: boolean };

  if (!type || !id) {
    return NextResponse.json({ error: "Missing type or id" }, { status: 400 });
  }

  if (type !== "domain" && type !== "agent") {
    return NextResponse.json({ error: "Invalid type, must be 'domain' or 'agent'" }, { status: 400 });
  }

  logger.info("[Admin] Manual scan triggered", { type, id, force });

  if (type === "domain") {
    const result = await domainContentModerationService.scanDomain(id, { force: force ?? true, deepScan: true });
    return NextResponse.json({ success: true, type: "domain", id, result });
  }

  if (type === "agent") {
    const result = await domainContentModerationService.sampleAgentResponses(id);
    return NextResponse.json({ success: true, type: "agent", id, result });
  }

  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/admin/moderation/scan",
    method: "POST",
    headers: { "Authorization": "Bearer <ADMIN_API_KEY>" },
    body: {
      type: "domain | agent",
      id: "uuid of domain or agent",
      force: "optional boolean, defaults to true"
    }
  });
}

