"use client";

import { ImageGeneratorAdvanced } from "./image-generator-advanced";
import { useSetPageHeader } from "@/components/layout/page-header-context";

export function ImagePageClient() {
  useSetPageHeader({
    title: "Image Studio",
    description:
      "Create stunning AI-powered images with advanced controls and settings",
  });

  return (
    <div className="flex flex-col w-full h-full">
      <div className="w-full max-w-[1800px] mx-auto px-4 md:px-6 py-4 md:py-6 pb-6 md:pb-8">
        <ImageGeneratorAdvanced />
      </div>
    </div>
  );
}
