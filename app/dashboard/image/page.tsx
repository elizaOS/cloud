import type { Metadata } from "next";
import { ImageGenerator } from "@/components/image/image-generator";

export const metadata: Metadata = {
  title: "Image Generation",
  description: "Create stunning AI-generated images and artwork with advanced image generation models",
};

export default function ImagePage() {
  return (
    <div className="flex flex-col items-center justify-start min-h-full w-full">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Images</h1>
          <p className="text-muted-foreground mt-2">
            Generate stunning AI-powered images and artwork
          </p>
        </div>

        <ImageGenerator />
      </div>
    </div>
  );
}

