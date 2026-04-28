// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.
// TODO(migrate): server-rendered character list dropped. BuildPageClient must
// fetch its own characters via /api/my-agents/characters when it mounts.
import { BuildPageClient } from "@/packages/ui/src/components/chat/build-page-client";

/**
 * Build page for creating and configuring AI agents/characters.
 * Supports both authenticated and anonymous users.
 *
 * ACCESS CONTROL: Build mode only allows editing your own characters.
 * If a characterId is provided that the user doesn't own, it's ignored.
 *
 * @returns The rendered build page client component.
 */
export default function BuildPage() {
  return (
    <BuildPageClient
      initialCharacters={[]}
      isAuthenticated={false}
      userId={null}
      initialCharacterId={undefined}
    />
  );
}
