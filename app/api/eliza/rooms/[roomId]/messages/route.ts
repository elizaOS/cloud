import { NextResponse } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import type { UUID } from "@elizaos/core";
import { requireAuthOrApiKey } from "@/lib/auth";
import { deductCredits } from "@/lib/queries/credits";
import { createUsageRecord } from "@/lib/queries/usage";
import { createGeneration } from "@/lib/queries/generations";
import { calculateCost, getProviderFromModel } from "@/lib/pricing";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

// POST /api/eliza/rooms/[roomId]/messages - Send a message
export async function POST(request: NextRequest, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    // Authenticate user or validate API key
    const { user, apiKey } = await requireAuthOrApiKey(request);

    const { roomId } = await ctx.params;
    const body = await request.json();
    const { entityId, text, attachments } = body;

    if (!roomId) {
      console.error("[Eliza Messages API] Missing roomId");
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 },
      );
    }

    if (!entityId) {
      console.error("[Eliza Messages API] Missing entityId");
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 },
      );
    }

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      console.error("[Eliza Messages API] Invalid or missing text", { text });
      return NextResponse.json(
        { error: "text is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    // Handle the message and get usage information
    const result = await agentRuntime.handleMessage(roomId, entityId, {
      text,
      attachments: attachments || [],
    });

    const { message, usage } = result;

    console.log(`[Eliza Messages API] Message sent successfully`, {
      roomId,
      entityId,
      messageId: message.id,
      usage,
    });

    // Deduct credits and track usage if we have token information
    if (usage && usage.inputTokens > 0 && usage.outputTokens > 0) {
      try {
        const model = usage.model || "gpt-4o";
        const provider = getProviderFromModel(model);

        // Calculate costs
        const { inputCost, outputCost, totalCost } = await calculateCost(
          model,
          provider,
          usage.inputTokens,
          usage.outputTokens,
        );

        // Deduct credits
        const deductionResult = await deductCredits(
          user.organization_id,
          totalCost,
          `Eliza chat completion: ${model}`,
          user.id,
        );

        if (!deductionResult.success) {
          console.error(
            "[Eliza Messages API] Failed to deduct credits - insufficient balance",
          );
        }

        // Create usage record
        const usageRecord = await createUsageRecord({
          organization_id: user.organization_id,
          user_id: user.id,
          api_key_id: apiKey?.id || null,
          type: "eliza",
          model,
          provider,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          input_cost: inputCost,
          output_cost: outputCost,
          is_successful: true,
        });

        // Create generation record if using API key
        if (apiKey) {
          await createGeneration({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey.id,
            type: "eliza",
            model,
            provider,
            prompt: text,
            status: "completed",
            tokens: usage.inputTokens + usage.outputTokens,
            cost: totalCost,
            credits: totalCost,
            usage_record_id: usageRecord.id,
            completed_at: new Date(),
          });
        }

        console.log(
          `[Eliza Messages API] Credits deducted: ${totalCost} (Input: ${inputCost}, Output: ${outputCost}), New balance: ${deductionResult.newBalance}`,
        );
      } catch (error) {
        console.error(
          "[Eliza Messages API] Error deducting credits or tracking usage:",
          error,
        );

        // Still create an unsuccessful usage record for tracking
        try {
          await createUsageRecord({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "eliza",
            model: usage.model || "gpt-4o",
            provider: getProviderFromModel(usage.model || "gpt-4o"),
            input_tokens: usage.inputTokens || 0,
            output_tokens: usage.outputTokens || 0,
            input_cost: 0,
            output_cost: 0,
            is_successful: false,
            error_message:
              error instanceof Error ? error.message : "Unknown error",
          });
        } catch (usageError) {
          console.error(
            "[Eliza Messages API] Error creating usage record:",
            usageError,
          );
        }
      }
    }

    // Return the created message
    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        entityId: message.entityId || "",
        agentId: message.agentId,
        content: message.content,
        createdAt: message.createdAt,
        roomId,
      },
      // Include polling hint for the client
      pollForResponse: true,
      pollDuration: 30000, // 30 seconds
      pollInterval: 1000, // 1 second
    });
  } catch (error) {
    console.error("[Eliza Messages API] Error sending message:", error);

    // Provide more specific error messages based on the error type
    if (error instanceof TypeError) {
      return NextResponse.json(
        {
          error: "Invalid request format",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to send message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// GET /api/eliza/rooms/[roomId]/messages - Get messages (for polling)
export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit");
    const afterTimestamp = searchParams.get("afterTimestamp");

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 },
      );
    }

    const runtime = await agentRuntime.getRuntime();
    const messages = await runtime.getMemories({
      tableName: "messages",
      roomId: roomId as UUID,
      count: limit ? parseInt(limit) : 100, // Higher count for polling to catch all new messages
      unique: false,
    });

    // Filter messages by timestamp if provided (for polling)
    const parsed = afterTimestamp ? Number(afterTimestamp) : 0;
    const afterTimestampNum = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const isValidAfter = afterTimestampNum > 0;
    const filteredMessages = isValidAfter
      ? messages.filter((msg) => {
          const msgTime = (msg as { createdAt: number }).createdAt;
          return msgTime > afterTimestampNum;
        })
      : messages;

    const simple = filteredMessages
      .map((msg) => {
        let parsedContent: unknown = msg.content;
        try {
          if (typeof msg.content === "string")
            parsedContent = JSON.parse(msg.content);
        } catch {
          parsedContent = msg.content;
        }
        return {
          id: msg.id,
          entityId: msg.entityId,
          agentId: msg.agentId,
          content: parsedContent,
          createdAt: (msg as { createdAt: number }).createdAt,
          isAgent: msg.entityId === msg.agentId,
        };
      })
      .sort((a, b) => a.createdAt - b.createdAt);

    return NextResponse.json(
      {
        success: true,
        messages: simple,
        hasMore: false,
        lastTimestamp:
          simple.length > 0 ? simple[simple.length - 1].createdAt : Date.now(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Eliza Messages API] Error getting messages:", error);
    return NextResponse.json(
      {
        error: "Failed to get messages",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

