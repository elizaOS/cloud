/**
 * Admin Headscale Status API
 *
 * GET /api/v1/admin/headscale — Get headscale server status, list all VPN
 *     nodes with IPs and online status.
 *
 * Requires admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Headscale API configuration
// ---------------------------------------------------------------------------

const HEADSCALE_API_URL =
  process.env.HEADSCALE_API_URL || "http://localhost:8081";
const HEADSCALE_API_KEY = process.env.HEADSCALE_API_KEY || "";
const HEADSCALE_USER = process.env.HEADSCALE_USER || "milady";

// ---------------------------------------------------------------------------
// GET — Headscale server status + VPN node list
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Admin access required";
    return NextResponse.json(
      { success: false, error: message },
      { status: 403 },
    );
  }

  if (!HEADSCALE_API_KEY) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Headscale not configured: HEADSCALE_API_KEY environment variable is missing",
      },
      { status: 503 },
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${HEADSCALE_API_KEY}`,
    Accept: "application/json",
  };

  try {
    // Fetch VPN nodes (machines) from headscale
    const nodesResponse = await fetch(
      `${HEADSCALE_API_URL}/api/v1/machine`,
      {
        headers,
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!nodesResponse.ok) {
      const errText = await nodesResponse.text().catch(() => "");
      logger.error("[Admin Headscale] API request failed", {
        status: nodesResponse.status,
        body: errText.slice(0, 500),
      });
      return NextResponse.json(
        {
          success: false,
          error: `Headscale API error: ${nodesResponse.status} ${nodesResponse.statusText}`,
        },
        { status: 502 },
      );
    }

    const nodesData = (await nodesResponse.json()) as {
      machines?: Array<{
        id: string;
        machineKey: string;
        nodeKey: string;
        name: string;
        givenName: string;
        user: { id: string; name: string };
        ipAddresses: string[];
        online: boolean;
        lastSeen: string;
        expiry: string;
        createdAt: string;
        forcedTags?: string[];
      }>;
    };

    const machines = nodesData.machines || [];

    // Optionally filter to the configured user
    const filteredMachines = HEADSCALE_USER
      ? machines.filter(
          (m) =>
            m.user?.name === HEADSCALE_USER || !m.user?.name,
        )
      : machines;

    const vpnNodes = filteredMachines.map((m) => ({
      id: m.id,
      name: m.name,
      givenName: m.givenName,
      user: m.user?.name,
      ipAddresses: m.ipAddresses,
      online: m.online,
      lastSeen: m.lastSeen,
      expiry: m.expiry,
      createdAt: m.createdAt,
      tags: m.forcedTags || [],
    }));

    const onlineCount = vpnNodes.filter((n) => n.online).length;

    return NextResponse.json({
      success: true,
      data: {
        serverUrl: HEADSCALE_API_URL,
        user: HEADSCALE_USER,
        vpnNodes,
        summary: {
          total: vpnNodes.length,
          online: onlineCount,
          offline: vpnNodes.length - onlineCount,
        },
        queriedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("[Admin Headscale] Failed to fetch status", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Distinguish network errors from other failures
    if (
      error instanceof TypeError &&
      error.message.includes("fetch")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot reach headscale server at ${HEADSCALE_API_URL}`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to fetch headscale status" },
      { status: 500 },
    );
  }
}
