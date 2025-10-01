import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Image Generation",
  description: "Create stunning AI-generated images and artwork with advanced image generation models",
};

export default function ImagePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Images</h1>
        <p className="text-muted-foreground mt-2">
          Generate AI images and artwork
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Image Generation Studio</h2>
        <p className="text-muted-foreground">
          Image generation interface coming soon...
        </p>
      </div>
    </div>
  );
}

