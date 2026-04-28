import { NextResponse } from "next/server";

// In-memory store for provisioned agents for the demo
const agentsStore = new Map();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, mode } = body;

    // Basic validation
    if (!userId || !mode) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Generate a new Agent ID
    const agentId = "agent-" + Math.random().toString(36).substring(2, 10);

    // Store configuration
    agentsStore.set(agentId, {
      ownerId: userId,
      name: name || "Unknown",
      mode,
      createdAt: Date.now(),
      status: "provisioned",
    });

    // Simulate provisioning delay for effect
    await new Promise((resolve) => setTimeout(resolve, 1500));

    let message = "";
    if (mode === "Chat") {
      message = "Allocated shared cloud-hosted base agent.";
    } else if (mode === "Workflow") {
      message = "Allocated cloud-hosted agent + n8n plugin connected.";
    } else if (mode === "Autonomous") {
      message = "Provisioned dedicated Vercel Sandbox for autonomous execution.";
    }

    return NextResponse.json({
      success: true,
      agentId,
      message,
      gatewayUrl: `http://localhost:3000/api/eliza-app/gateway/${agentId}`,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
