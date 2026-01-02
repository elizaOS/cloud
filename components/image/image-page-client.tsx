/**
 * Image page client component wrapping the advanced image generator.
 * Sets page header context for the image studio page.
 */

"use client";

import { ImageGeneratorAdvanced } from "./image-generator-advanced";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import type { GalleryItem } from "@/app/actions/gallery";

interface ImagePageClientProps {
  initialHistory?: GalleryItem[];
}

export function ImagePageClient({ initialHistory = [] }: ImagePageClientProps) {
  useSetPageHeader({
    title: "Image Studio",
  });

  return (
    <div className="w-full flex flex-col pb-6 md:pb-8">
      <ImageGeneratorAdvanced initialHistory={initialHistory} />
    </div>
  );
}
