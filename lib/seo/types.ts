import type { Metadata } from "next";

export interface OGImageParams {
  type: "default" | "character" | "chat" | "container" | "marketplace";
  title?: string;
  description?: string;
  id?: string;
  name?: string;
  characterName?: string;
  roomId?: string;
  avatarUrl?: string;
}

export interface PageMetadataOptions {
  title: string;
  description: string;
  keywords?: readonly string[] | string[];
  path: string;
  ogImage?: string;
  type?: "website" | "article" | "profile";
  noIndex?: boolean;
}

export interface DynamicMetadataOptions extends PageMetadataOptions {
  entityId: string;
  entityType: "character" | "container" | "chat" | "generation";
  updatedAt?: Date;
}

export interface StructuredDataOptions {
  type:
    | "Organization"
    | "WebApplication"
    | "Product"
    | "Article"
    | "SoftwareApplication";
  name: string;
  description?: string;
  url?: string;
  image?: string;
  additionalProperties?: Record<string, unknown>;
}

export type MetadataGenerator = (
  options: PageMetadataOptions | DynamicMetadataOptions,
) => Metadata;

