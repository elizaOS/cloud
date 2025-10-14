import type { Metadata } from "next";
import { StoragePageClient } from "@/components/storage/storage-page-client";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Storage",
  description:
    "Manage your cloud storage, datasets, and data for AI agent development",
  keywords: ["storage", "cloud storage", "data management", "datasets"],
};

export default function StoragePage() {
  return <StoragePageClient />;
}
