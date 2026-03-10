/**
 * GET /api/compat/availability — aggregate capacity is public, node topology requires auth
 */

import { NextRequest, NextResponse } from "next/server";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import { validateServiceKey } from "@/lib/auth/service-key";
import { authenticateWaifuBridge } from "@/lib/auth/waifu-bridge";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function canViewNodeTopology(request: NextRequest): Promise<boolean> {
  try {
    if (validateServiceKey(request)) {
      return true;
    }

    if (await authenticateWaifuBridge(request)) {
      return true;
    }

    await requireAuthOrApiKeyWithOrg(request);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const nodes = await dockerNodesRepository.findAll();
    const includeNodeTopology = await canViewNodeTopology(request);

    let totalSlots = 0;
    let usedSlots = 0;

    const nodesSummary = nodes.map((n) => {
      const cap = n.capacity ?? 0;
      const allocated = n.allocated_count ?? 0;
      totalSlots += cap;
      usedSlots += allocated;
      return {
        nodeId: n.node_id,
        hostname: n.hostname,
        capacity: cap,
        allocated,
        available: Math.max(0, cap - allocated),
        status: n.status,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        totalSlots,
        usedSlots,
        availableSlots: Math.max(0, totalSlots - usedSlots),
        acceptingNewAgents: totalSlots > usedSlots,
        ...(includeNodeTopology ? { nodes: nodesSummary } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to fetch availability: ${message}` },
      { status: 500 },
    );
  }
}
