import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gallery",
  description: "View and manage all your AI-generated content including images, text, and other assets",
};

export default function GalleryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Gallery</h1>
        <p className="text-muted-foreground mt-2">
          View and manage your generated content
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Your Gallery</h2>
        <p className="text-muted-foreground">
          Gallery interface coming soon...
        </p>
      </div>
    </div>
  );
}

