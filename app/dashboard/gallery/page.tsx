import type { Metadata } from "next";
import { GalleryPageClient } from "@/components/gallery/gallery-page-client";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "View and manage all your AI-generated content including images and videos",
};

export default function GalleryPage() {
  return <GalleryPageClient />;
}
