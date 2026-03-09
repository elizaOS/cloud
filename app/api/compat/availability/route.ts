/**
 * GET /api/compat/availability — public capacity check (no auth)
 */

import { NextResponse } from "next/server";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const nodes = await dockerNodesRepository.findAll();

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
        nodes: nodesSummary,
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
