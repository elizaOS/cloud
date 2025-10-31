import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { getKnowledgeService } from "@/lib/eliza/knowledge-service";
import type { UUID } from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

export const maxDuration = 60;

/**
 * GET /api/v1/knowledge - List all knowledge documents
 */
async function handleGET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);
    const runtime = await agentRuntime.getRuntime();

    console.log("[Knowledge API] Runtime initialized:", {
      agentId: runtime.agentId,
      hasRuntime: !!runtime,
    });

    // Wait for knowledge service to be available
    const knowledgeService = await getKnowledgeService(runtime);

    if (!knowledgeService) {
      const status = runtime.getServiceRegistrationStatus("knowledge");
      console.error("[Knowledge API] Knowledge service not available!");
      console.error("[Knowledge API] Service registration status:", status);

      return NextResponse.json(
        {
          error: "Knowledge service not available",
          details: `Service status: ${status}. The knowledge plugin may not be loaded or is still initializing.`,
        },
        { status: 503 },
      );
    }

    console.log("[Knowledge API] Knowledge service loaded successfully");

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const count = parseInt(searchParams.get("count") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Use runtime.agentId as roomId (matching plugin pattern)
    const roomId = runtime.agentId;

    // Get documents
    const documents = await knowledgeService.getMemories({
      tableName: "documents",
      roomId,
      count,
      offset,
    });

    // Get total count
    const total = await knowledgeService.countMemories({
      tableName: "documents",
      roomId,
      unique: false,
    });

    return NextResponse.json({
      documents,
      total,
      count: documents.length,
      offset,
    });
  } catch (error) {
    console.error("Error listing knowledge documents:", error);
    return NextResponse.json(
      {
        error: "Failed to list documents",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/knowledge - Upload a new knowledge document
 */
async function handlePOST(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);
    const runtime = await agentRuntime.getRuntime();
    const knowledgeService = await getKnowledgeService(runtime);

    if (!knowledgeService) {
      return NextResponse.json(
        { error: "Knowledge service not available" },
        { status: 503 },
      );
    }

    const body = await req.json();
    const { content, contentType, filename, metadata } = body;

    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    // For text content, check if it needs base64 encoding
    let processedContent = content;
    const finalContentType = contentType || "text/plain";

    // If content looks like it might be binary or already base64, keep it as is
    // Otherwise, convert text to base64 for consistency
    if (
      finalContentType.startsWith("text/") ||
      finalContentType === "application/json"
    ) {
      // Text content - convert to base64
      processedContent = Buffer.from(content).toString("base64");
    }

    // Add knowledge document (matching plugin-knowledge pattern exactly)
    // Use runtime.agentId for roomId, worldId, entityId (same as plugin)
    const result = await knowledgeService.addKnowledge({
      agentId: runtime.agentId,
      clientDocumentId: "" as UUID, // This will be ignored by the service
      content: processedContent,
      contentType: finalContentType,
      originalFilename: filename || "document.txt",
      worldId: runtime.agentId,
      roomId: runtime.agentId,
      entityId: runtime.agentId,
      metadata: {
        uploadedBy: user.id,
        uploadedAt: Date.now(),
        organizationId: user.organization_id,
        ...metadata,
      },
    });

    return NextResponse.json({
      success: true,
      documentId: result.clientDocumentId,
      fragmentCount: result.fragmentCount,
      message: `Document processed successfully. Created ${result.fragmentCount} knowledge fragments.`,
    });
  } catch (error) {
    console.error("Error uploading knowledge document:", error);
    return NextResponse.json(
      {
        error: "Failed to upload document",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
