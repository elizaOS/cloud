import type { Metadata } from "next";
import { ImageGenerator } from "@/components/image/image-generator";

export const metadata: Metadata = {
  title: "Image Generation",
  description:
    "Create stunning AI-generated images and artwork with advanced image generation models",
};

export default function ImagePage() {
  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      <div className="w-full max-w-6xl mx-auto px-6 py-6 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            AI Image Generation
          </h1>
          <p className="text-muted-foreground mt-2">
            Generate stunning AI-powered images and artwork from text
            descriptions
          </p>
        </div>

        <ImageGenerator />
      </div>
    </div>
  );
}
