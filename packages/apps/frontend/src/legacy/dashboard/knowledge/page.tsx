// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.
// TODO(migrate): server-side getCurrentUser() and listCharacters() are gone.
// KnowledgePageClient should fetch the user's characters via
// /api/my-agents/characters when it mounts.
import { KnowledgePageClient } from "@/packages/ui/src/components/knowledge/knowledge-page-client";

/**
 * File Management page for uploading and managing agent documents.
 *
 * @returns The rendered knowledge page client component.
 */
export default function KnowledgePage() {
  return <KnowledgePageClient initialCharacters={[]} />;
}
