"use client";

import { useSetPageHeader } from "@/components/layout/page-header-context";
import { Badge } from "@/components/ui/badge";

export function StoragePageClient() {
  useSetPageHeader({
    title: "Storage",
    description: "Manage your cloud storage and data",
    actions: (
      <Badge variant="default" className="text-xs">
        NEW
      </Badge>
    ),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Storage Management</h2>
        <p className="text-muted-foreground">
          Storage management interface coming soon...
        </p>
      </div>
    </div>
  );
}
