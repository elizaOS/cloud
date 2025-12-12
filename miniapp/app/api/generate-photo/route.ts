import { NextRequest } from "next/server";

import { getCloudUrl } from "@/lib/cloud-url";

const ELIZA_CLOUD_API_KEY = process.env.ELIZA_CLOUD_API_KEY;

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const { prompt, name, personality, backstory } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ success: false, error: "Prompt required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!ELIZA_CLOUD_API_KEY) {
      console.error("[Generate Photo] ELIZA_CLOUD_API_KEY not configured");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Image generation not configured. Please contact support.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Build enhanced prompt with context
    let enhancedPrompt = prompt;
    if (name || personality || backstory) {
      const contextParts: string[] = [];
      if (name) contextParts.push(name);
      if (personality) contextParts.push(personality.slice(0, 100));
      enhancedPrompt = `${prompt}. ${contextParts.join(". ")}`;
    }

    const finalPrompt = `Professional portrait photo of ${name || "a person"}. ${enhancedPrompt}. High quality, natural lighting, friendly expression, realistic photographic style.`;

    console.log(`[Generate Photo] Calling Eliza Cloud generate-image API`);

    // Call Eliza Cloud's generate-image endpoint
    const cloudUrl = getCloudUrl();
    const response = await fetch(`${cloudUrl}/api/v1/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ELIZA_CLOUD_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: finalPrompt,
        numImages: 1,
        aspectRatio: "1:1",
        stylePreset: "photographic",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Generate Photo] Eliza Cloud API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });

      // Parse error if possible
      let errorMessage = "Failed to generate photo";
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error) {
          errorMessage =
            typeof errorData.error === "string"
              ? errorData.error
              : errorData.error.message || errorMessage;
        }
      } catch {
        // Use default error message
      }

      // Return streaming response with error for consistency with client expectations
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`,
            ),
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await response.json();

    // Extract the image URL from the response
    // The Eliza Cloud API returns { images: [{ url, mimeType, text }], numImages }
    const imageUrl = data.images?.[0]?.url || data.images?.[0]?.image;

    if (!imageUrl) {
      console.error("[Generate Photo] No image URL in response:", data);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: "No image generated" })}\n\n`,
            ),
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    console.log(
      `[Generate Photo] Successfully generated image: ${imageUrl.slice(0, 100)}...`,
    );

    // Return streaming response for consistency with client expectations
    const stream = new ReadableStream({
      start(controller) {
        // Send progress update
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "progress", message: "Image generated" })}\n\n`,
          ),
        );
        // Send the image
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "image", imageUrl })}\n\n`,
          ),
        );
        // Send completion
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "complete", imageUrl })}\n\n`,
          ),
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Generate Photo] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate photo";

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`,
          ),
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
}
