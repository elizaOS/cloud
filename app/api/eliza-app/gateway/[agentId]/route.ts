import { NextResponse } from "next/server";

// Simple stateful memory for the demo gateway
const agentMemories = new Map<
  string,
  Array<{ role: string; content: string }>
>();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await params;
    const body = await req.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Empty message" },
        { status: 400 },
      );
    }

    // Initialize memory
    if (!agentMemories.has(agentId)) {
      agentMemories.set(agentId, []);
    }

    const history = agentMemories.get(agentId)!;

    // In a real scenario, this would route to a persistent n8n graph or AI Sandbox instance
    // For this demo, we'll respond as the provisioned agent
    history.push({ role: "user", content: message });

    let reply = "";
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) {
      reply = `Hello there! I'm your dedicated agent (${agentId}). How can I help you today?`;
    } else if (
      lowerMessage.includes("status") ||
      lowerMessage.includes("mode")
    ) {
      reply = `I am operating normally. If I were a workflow agent, I'd trigger n8n here. If I were autonomous, I'd spawn an isolated container.`;
    } else {
      reply = `I received your message: "${message}". I will process it based on my configured capabilities.`;
    }

    history.push({ role: "assistant", content: reply });

    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 800));

    return NextResponse.json({
      success: true,
      reply,
      historyLength: history.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 },
    );
  }
}
