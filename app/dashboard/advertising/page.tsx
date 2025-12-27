import type { Metadata } from "next";
import { AdvertisingPageClient } from "@/components/advertising/advertising-page-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Advertising",
  description: "Manage your advertising campaigns across multiple platforms",
};

export default function AdvertisingPage() {
  return <AdvertisingPageClient />;
}
