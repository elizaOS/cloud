import { type NextRequest, NextResponse } from "next/server";

import { getCloudUrl } from "@/lib/cloud-url";

interface CreateCharacterRequest {
  name: string;
  backstory?: string;
  personality?: string;
  avatarUrl?: string;
  avatarBase64?: string;
  imageUrls?: string[];
  imageBase64s?: string[];
  authToken?: string; // Optional auth token for authenticated users
}

interface ElizaCloudResponse {
  success: boolean;
  characterId: string;
  sessionId: string;
  redirectUrl: string;
  message: string;
  error?: string;
}

interface MiniappAgentResponse {
  success: boolean;
  agent: {
    id: string;
    name: string;
    bio: string | string[];
    avatarUrl: string | null;
    isPublic: boolean;
    createdAt: string;
  };
}

function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;

  if (url.startsWith("data:image/")) {
    return true;
  }

  if (url.startsWith("/uploads/")) {
    return true;
  }

  const parsedUrl = new URL(url);
  const trustedDomains = [
    "vercel-storage.com",
    "blob.vercel-storage.com",
  ];

  return trustedDomains.some((domain) => parsedUrl.hostname.includes(domain));
}

function extractValidImages(body: CreateCharacterRequest): {
  avatarUrl: string | undefined;
  avatarBase64: string | undefined;
  imageUrls: string[];
  imageBase64s: string[];
} {
  let avatarUrl: string | undefined;
  let avatarBase64: string | undefined;
  const imageUrls: string[] = [];
  const imageBase64s: string[] = [];

  if (body.avatarBase64 && body.avatarBase64.startsWith("data:image/")) {
    avatarBase64 = body.avatarBase64;
  }

  if (body.avatarUrl && isValidImageUrl(body.avatarUrl)) {
    if (body.avatarUrl.startsWith("data:image/")) {
      avatarBase64 = avatarBase64 || body.avatarUrl;
    } else {
      avatarUrl = body.avatarUrl;
    }
  }

  if (body.imageUrls && Array.isArray(body.imageUrls)) {
    for (const url of body.imageUrls) {
      if (typeof url === "string" && isValidImageUrl(url)) {
        if (url.startsWith("data:image/")) {
          imageBase64s.push(url);
        } else if (!imageUrls.includes(url)) {
          imageUrls.push(url);
        }
      }
    }
  }

  if (body.imageBase64s && Array.isArray(body.imageBase64s)) {
    for (const base64 of body.imageBase64s) {
      if (
        typeof base64 === "string" &&
        base64.startsWith("data:image/") &&
        !imageBase64s.includes(base64)
      ) {
        imageBase64s.push(base64);
      }
    }
  }

  return {
    avatarUrl,
    avatarBase64,
    imageUrls: imageUrls.slice(0, 10),
    imageBase64s: imageBase64s.slice(0, 10),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateCharacterRequest = await request.json();

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const sanitizedName = body.name.trim().slice(0, 50);
    const sanitizedBackstory = body.backstory?.trim().slice(0, 500) || "";
    const sanitizedPersonality = body.personality?.trim().slice(0, 1000) || "";

    const { avatarUrl, avatarBase64, imageUrls, imageBase64s } =
      extractValidImages(body);

    console.log(`[Create-Character API] Image extraction result:`, {
      hasAvatarUrl: !!avatarUrl,
      hasAvatarBase64: !!avatarBase64,
      imageUrlCount: imageUrls.length,
      imageBase64Count: imageBase64s.length,
      hasAuthToken: !!body.authToken,
    });

    const bioLines: string[] = [];

    if (sanitizedBackstory) {
      bioLines.push(`Backstory: ${sanitizedBackstory}`);
    }

    if (sanitizedPersonality) {
      const personalityPreview = sanitizedPersonality.slice(0, 300);
      bioLines.push(
        `Personality traits: ${personalityPreview}${sanitizedPersonality.length > 300 ? "..." : ""}`,
      );
    }

    const finalAvatarUrl = avatarBase64 || avatarUrl;

    const elizaCloudUrl =
      getCloudUrl();
    const apiKey = process.env.ELIZA_CLOUD_API_KEY;

    if (!apiKey) {
      console.error(
        "[Create-Character API] ELIZA_CLOUD_API_KEY not configured",
      );
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 500 },
      );
    }

    // If user is authenticated, use the miniapp agents API
    if (body.authToken) {
      console.log(
        `[Create-Character API] Creating character "${sanitizedName}" for authenticated user`,
      );

      const response = await fetch(`${elizaCloudUrl}/api/v1/miniapp/agents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
          "X-Miniapp-Token": body.authToken,
        },
        body: JSON.stringify({
          name: sanitizedName,
          bio: bioLines.length > 0 ? bioLines : `A companion named ${sanitizedName}`,
          avatarUrl: finalAvatarUrl || null,
          style: {
            all: [
              "Keep responses concise and natural",
              "Be conversational, not robotic",
            ],
            chat: [
              "Use casual language",
              "Show personality in every message",
              "React emotionally to what the user says",
            ],
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        console.error("[Create-Character API] Miniapp API error:", {
          status: response.status,
          error: errorData,
        });

        if (response.status === 401) {
          return NextResponse.json(
            { error: "Authentication failed. Please sign in again." },
            { status: 401 },
          );
        }

        return NextResponse.json(
          { error: "Failed to create your character. Please try again." },
          { status: 502 },
        );
      }

      const result: MiniappAgentResponse = await response.json();

      console.log(`[Create-Character API] Character created for authenticated user:`, {
        characterId: result.agent.id,
      });

      return NextResponse.json({
        success: true,
        characterId: result.agent.id,
        sessionId: null, // No session needed for authenticated users
        redirectUrl: `/chats/${result.agent.id}`,
        message: "Character created successfully",
        authenticated: true,
      });
    }

    // For unauthenticated users, use the affiliate API
    console.log(
      `[Create-Character API] Creating character "${sanitizedName}" via affiliate API`,
    );

    const elizaCharacter = {
      name: sanitizedName,
      bio: bioLines,
      lore: [
        sanitizedBackstory || "You have a special connection with the user.",
        ...(sanitizedPersonality
          ? [`Personality context: ${sanitizedPersonality}`]
          : []),
      ],
      style: {
        all: [
          "Keep responses concise and natural",
          "Be conversational, not robotic",
        ],
        chat: [
          "Use casual language",
          "Show personality in every message",
          "React emotionally to what the user says",
        ],
      },
      avatar_url: finalAvatarUrl,
    };

    const allImages = [
      ...imageUrls.map((url) => ({ type: "url" as const, data: url })),
      ...imageBase64s.map((base64) => ({ type: "base64" as const, data: base64 })),
    ];

    const response = await fetch(
      `${elizaCloudUrl}/api/affiliate/create-character`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          character: elizaCharacter,
          affiliateId: "create-a-character",
          metadata: {
            source: "landing-page",
            backstory: sanitizedBackstory,
            personality: sanitizedPersonality,
            imageUrls: imageUrls,
            imageBase64s: imageBase64s.length > 0 ? imageBase64s : undefined,
            images: allImages.length > 0 ? allImages : undefined,
            avatarBase64: avatarBase64,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      console.error("[Create-Character API] ElizaOS Cloud API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });

      if (response.status === 401) {
        return NextResponse.json(
          { error: "Authentication failed. Please try again later." },
          { status: 502 },
        );
      } else if (response.status === 403) {
        console.error("[Create-Character API] API key lacks required permissions");
        return NextResponse.json(
          { error: "Service configuration error. Please contact support." },
          { status: 502 },
        );
      } else if (response.status === 429) {
        return NextResponse.json(
          { error: "Too many requests. Please try again in a few moments." },
          { status: 429 },
        );
      } else {
        return NextResponse.json(
          { error: "Failed to create your character. Please try again." },
          { status: 502 },
        );
      }
    }

    const result: ElizaCloudResponse = await response.json();

    if (!result.success || !result.characterId) {
      console.error(
        "[Create-Character API] Invalid response from ElizaOS Cloud:",
        result,
      );
      return NextResponse.json(
        { error: "Invalid response from server. Please try again." },
        { status: 500 },
      );
    }

    console.log(`[Create-Character API] Character created successfully:`, {
      characterId: result.characterId,
      sessionId: result.sessionId,
    });

    return NextResponse.json({
      success: true,
      characterId: result.characterId,
      sessionId: result.sessionId,
      redirectUrl: result.redirectUrl,
      message: "Character created successfully",
      authenticated: false,
    });
  } catch (error) {
    console.error("[Create-Character API] Unexpected error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred. Please try again.",
      },
      { status: 500 },
    );
  }
}
