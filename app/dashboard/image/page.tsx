import type { Metadata } from "next";
import { ImagePageClient } from "@/components/image/image-page-client";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Image Generation",
  description:
    "Create stunning AI-generated images and artwork with advanced image generation models",
};

export default function ImagePage() {
  return <ImagePageClient />;
}
