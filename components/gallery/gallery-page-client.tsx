"use client";

import { useSetPageHeader } from "@/components/layout/page-header-context";

export function GalleryPageClient() {
  useSetPageHeader({
    title: "Gallery",
    description: "View and manage your generated content",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Your Gallery</h2>
        <p className="text-muted-foreground">
          Gallery interface coming soon...
        </p>
      </div>
    </div>
  );
}
