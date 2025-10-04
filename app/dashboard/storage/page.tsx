import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Storage",
  description:
    "Manage your cloud storage, datasets, and data for AI agent development",
  keywords: ["storage", "cloud storage", "data management", "datasets"],
};

export default function StoragePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">Storage</h1>
        <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
          NEW
        </span>
      </div>
      <p className="text-muted-foreground -mt-4">
        Manage your cloud storage and data
      </p>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Storage Management</h2>
        <p className="text-muted-foreground">
          Storage management interface coming soon...
        </p>
      </div>
    </div>
  );
}
