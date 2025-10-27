import { createPaidMcpHandler } from "x402-mcp";
import z from "zod";
import { experimental_generateImage as generateImage } from "ai";
import { openai } from "@ai-sdk/openai";
import { facilitator } from "@coinbase/x402";
import { getOrCreateSellerAccount, env } from "@/lib/accounts";

const sellerAccount = await getOrCreateSellerAccount();

const handler = createPaidMcpHandler(
  (server) => {
    server.paidTool(
      "generate_image",
      "Generate an AI image using OpenAI's gpt-image-1 model. Pay $0.50 for one AI-generated image. Features: superior instruction following, text rendering, detailed editing, and real-world knowledge. Supports custom size (square/landscape/portrait), quality (low/medium/high), transparent backgrounds, and multiple output formats (PNG/JPEG/WebP).",
      { price: 0.5 },
      {
        prompt: z
          .string()
          .describe("The description of the image to generate") as any,
        size: z
          .enum(["1024x1024", "1536x1024", "1024x1536", "auto"])
          .optional()
          .describe(
            "Image size: square (1024x1024), landscape (1536x1024), portrait (1024x1536), or auto (default: auto)"
          ) as any,
        quality: z
          .enum(["low", "medium", "high", "auto"])
          .optional()
          .describe(
            "Image quality: low (fast), medium, high (best), or auto (default: auto)"
          ) as any,
        background: z
          .enum(["transparent", "opaque", "auto"])
          .optional()
          .describe(
            "Background type: transparent (PNG only), opaque, or auto (default: auto)"
          ) as any,
        output_format: z
          .enum(["png", "jpeg", "webp"])
          .optional()
          .describe(
            "Output format: png (default), jpeg (faster), or webp"
          ) as any,
      },
      {},
      async (args) => {
        try {
          const {
            prompt,
            size = "auto",
            quality = "auto",
            background = "auto",
            output_format = "png",
          } = args as {
            prompt: string;
            size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
            quality?: "low" | "medium" | "high" | "auto";
            background?: "transparent" | "opaque" | "auto";
            output_format?: "png" | "jpeg" | "webp";
          };

          // Generate image using gpt-image-1 via AI SDK
          const result = await generateImage({
            model: openai.image("gpt-image-1"),
            prompt: prompt,
            ...(size !== "auto" && {
              size: size as "1024x1024" | "1536x1024" | "1024x1536",
            }),
            providerOptions: {
              openai: {
                quality: quality,
                background: background,
                response_format: "b64_json",
                ...(output_format !== "png" && { output_format }),
              },
            },
          });

          // Get the image as base64
          const imageBase64 = result.image.base64;

          // Determine MIME type based on format
          const mimeType =
            output_format === "jpeg"
              ? "image/jpeg"
              : output_format === "webp"
                ? "image/webp"
                : "image/png";

          return {
            content: [
              {
                type: "image",
                data: imageBase64,
                mimeType: mimeType,
              },
              {
                type: "text",
                text: `Image generated successfully!\n\nSize: ${size}\nQuality: ${quality}\nFormat: ${output_format}`,
              },
            ],
          };
        } catch (error: any) {
          console.error("Image generation error:", error);
          return {
            content: [
              {
                type: "text",
                text: `Failed to generate image: ${error.message || "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  },
  {
    serverInfo: {
      name: "openai-image-generator",
      version: "1.0.0",
    },
  },
  {
    recipient: sellerAccount.address,
    facilitator,
    network: env.NETWORK,
  }
);

export { handler as GET, handler as POST };
