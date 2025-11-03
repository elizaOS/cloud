import type { Metadata } from "next";
import { SEO_CONSTANTS } from "./constants";
import type {
  PageMetadataOptions,
  DynamicMetadataOptions,
  OGImageParams,
} from "./types";

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function generateOGImageUrl(params: OGImageParams): string {
  const baseUrl = getBaseUrl();
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });

  return `${baseUrl}/api/og?${searchParams.toString()}`;
}

export function generatePageMetadata(options: PageMetadataOptions): Metadata {
  const baseUrl = getBaseUrl();
  const canonicalUrl = `${baseUrl}${options.path}`;

  const ogImage =
    options.ogImage ||
    generateOGImageUrl({
      type: "default",
      title: options.title,
      description: options.description,
    });

  const metadata: Metadata = {
    title: options.title,
    description: options.description,
    keywords: options.keywords
      ? [...options.keywords]
      : [...SEO_CONSTANTS.defaultKeywords],
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${options.title} | ${SEO_CONSTANTS.siteName}`,
      description: options.description,
      url: canonicalUrl,
      siteName: SEO_CONSTANTS.siteName,
      type: options.type || "website",
      locale: SEO_CONSTANTS.locale,
      images: [
        {
          url: ogImage,
          width: SEO_CONSTANTS.ogImageDimensions.width,
          height: SEO_CONSTANTS.ogImageDimensions.height,
          alt: options.title,
        },
      ],
    },
    twitter: {
      card: SEO_CONSTANTS.twitterCardType,
      title: options.title,
      description: options.description,
      images: [ogImage],
      creator: SEO_CONSTANTS.twitterHandle,
      site: SEO_CONSTANTS.twitterHandle,
    },
  };

  if (options.noIndex) {
    metadata.robots = {
      index: false,
      follow: false,
    };
  }

  return metadata;
}

export function generateDynamicMetadata(
  options: DynamicMetadataOptions,
): Metadata {
  const baseMetadata = generatePageMetadata(options);

  if (options.type === "article" && options.updatedAt) {
    baseMetadata.openGraph = {
      ...baseMetadata.openGraph,
      type: "article",
      modifiedTime: options.updatedAt.toISOString(),
    };
  }

  if (options.type === "profile") {
    baseMetadata.openGraph = {
      ...baseMetadata.openGraph,
      type: "profile",
    };
  }

  return baseMetadata;
}

export function generateContainerMetadata(
  id: string,
  name: string,
  description: string | null,
  characterName?: string | null,
): Metadata {
  const title = `${name} - Container Details`;
  const desc =
    description ||
    `View logs, metrics, and deployment history for ${name}${characterName ? ` running ${characterName}` : ""}`;

  return generateDynamicMetadata({
    title,
    description: desc,
    keywords: [
      "container",
      "deployment",
      name,
      ...(characterName ? [characterName] : []),
    ],
    path: `/dashboard/containers/${id}`,
    ogImage: generateOGImageUrl({
      type: "container",
      id,
      name,
      characterName: characterName || undefined,
    }),
    entityId: id,
    entityType: "container",
  });
}

export function generateCharacterMetadata(
  id: string,
  name: string,
  bio: string | string[],
  avatarUrl: string | null,
  tags: string[] = [],
): Metadata {
  const bioText = Array.isArray(bio) ? bio[0] : bio;
  const description = bioText.slice(0, 160);

  return generateDynamicMetadata({
    title: `${name} - AI Character`,
    description,
    keywords: [name, "AI character", "AI agent", "elizaOS", ...tags],
    path: `/marketplace/characters/${id}`,
    ogImage:
      avatarUrl ||
      generateOGImageUrl({
        type: "character",
        id,
        name,
        description: bioText,
        avatarUrl: avatarUrl || undefined,
      }),
    type: "profile",
    entityId: id,
    entityType: "character",
  });
}

export function generateChatMetadata(
  roomId: string,
  characterName: string,
  messageCount: number,
  characterAvatarUrl?: string | null,
): Metadata {
  const title = `Chat with ${characterName}`;
  const description = `${messageCount} message${messageCount === 1 ? "" : "s"} in this conversation with ${characterName}`;

  return generateDynamicMetadata({
    title,
    description,
    keywords: [characterName, "AI chat", "conversation", "elizaOS"],
    path: `/chat/${roomId}`,
    ogImage: generateOGImageUrl({
      type: "chat",
      roomId,
      characterName,
      avatarUrl: characterAvatarUrl || undefined,
    }),
    type: "article",
    entityId: roomId,
    entityType: "chat",
  });
}
