import { streamText } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { prompt }: { prompt: string } = await req.json();

  const result = streamText({
    model: "google/gemini-2.5-flash-image-preview",
    providerOptions: {
      google: { responseModalities: ["TEXT", "IMAGE"] },
    },
    prompt: `Generate an image: ${prompt}`,
  });

  let imageBase64: string | null = null;
  let textResponse = "";

  // Process the stream to extract image and text
  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case "text-delta": {
        textResponse += delta.text;
        break;
      }

      case "file": {
        if (delta.file.mediaType.startsWith("image/")) {
          // Convert uint8Array to base64
          const uint8Array = delta.file.uint8Array;
          const base64 = Buffer.from(uint8Array).toString("base64");
          const mimeType = delta.file.mediaType || "image/png";
          imageBase64 = `data:${mimeType};base64,${base64}`;
          break;
        }
        break;
      }
    }
  }

  if (!imageBase64) {
    return Response.json(
      { error: "No image was generated" },
      { status: 500 }
    );
  }

  return Response.json({ 
    image: imageBase64,
    text: textResponse,
    finishReason: await result.finishReason,
  });
}
