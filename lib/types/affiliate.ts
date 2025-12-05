export type AffiliateVibe =
  | "playful"
  | "mysterious"
  | "romantic"
  | "bold"
  | "shy"
  | "flirty"
  | "intellectual"
  | "spicy";

export interface AffiliateImageReference {
  url: string;
  isProfilePic?: boolean;
  width?: number;
  height?: number;
  uploadedAt?: string;
}

export interface AffiliateSocialPost {
  caption: string;
  timestamp?: string;
  likeCount?: number;
  commentCount?: number;
}

export interface AffiliateData {
  affiliateId: string;
  source?: string;
  vibe?: AffiliateVibe | string;
  backstory?: string;
  instagram?: string;
  twitter?: string;
  socialContent?: string;
  imageUrls: string[];
  referenceImages?: AffiliateImageReference[];
  topPosts?: AffiliateSocialPost[];
  createdAt: string;
  appearanceDescription?: string;
}

export interface AffiliateMetadata {
  source?: string;
  vibe?: AffiliateVibe | string;
  backstory?: string;
  instagram?: string;
  twitter?: string;
  socialContent?: string;
  imageUrls?: string[];
  imageBase64s?: string[];
  images?: Array<{ type: "url" | "base64"; data: string }>;
  avatarBase64?: string;
}

export interface ProcessedAffiliateImages {
  avatarUrl: string | null;
  referenceImageUrls: string[];
  failedUploads: number;
}

export function isValidAffiliateVibe(vibe: string): vibe is AffiliateVibe {
  return [
    "playful",
    "mysterious",
    "romantic",
    "bold",
    "shy",
    "flirty",
    "intellectual",
    "spicy",
  ].includes(vibe);
}

export function isAffiliateData(data: unknown): data is AffiliateData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.affiliateId === "string" &&
    Array.isArray(d.imageUrls) &&
    typeof d.createdAt === "string"
  );
}
