"use client";

import { ImageGenerator } from "./image-generator";
import { useSetPageHeader } from "@/components/layout/page-header-context";

export function ImagePageClient() {
  useSetPageHeader({
    title: "Images",
    description:
      "Generate stunning AI-powered images and artwork from text descriptions",
  });

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      <div className="w-full max-w-6xl mx-auto px-6 py-6 space-y-6">
        <ImageGenerator />
      </div>
    </div>
  );
}
