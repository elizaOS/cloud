import type { Metadata } from "next";
import { ImagePageClient } from "@/components/image/image-page-client";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.imageGeneration,
  path: "/dashboard/image",
  noIndex: true,
});

/**
 * Image Generation page for creating AI-generated images.
 *
 * @returns The rendered image generation page client component.
 */
export default function ImagePage() {
  return <ImagePageClient />;
}
