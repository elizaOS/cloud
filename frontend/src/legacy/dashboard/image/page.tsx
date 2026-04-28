// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.
// TODO(migrate): server-rendered initialHistory fetch removed. ImagePageClient
// must fetch its own gallery items via /api/v1/gallery on mount.
import { ImagePageClient } from "@/packages/ui/src/components/image/image-page-client";

/**
 * Image Generation page for creating AI-generated images.
 *
 * @returns The rendered image generation page client component.
 */
export default function ImagePage() {
  return <ImagePageClient initialHistory={[]} />;
}
