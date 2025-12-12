import type { Metadata } from "next";
import { CollectionsPageClient } from "@/components/collections/collections-page-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collections",
  description: "Organize your media into collections for campaigns and apps",
};

export default function CollectionsPage() {
  return <CollectionsPageClient />;
}
