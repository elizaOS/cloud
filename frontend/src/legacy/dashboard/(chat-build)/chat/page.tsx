// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.
// TODO(migrate): server-side cookie/anon-session migration, character list,
// and shared-character access control are all dropped here. ElizaPageClient
// must do these client-side using:
//   - /api/auth/anonymous-session for the anon session bootstrap
//   - /api/my-agents/characters for the user's character list
//   - /api/my-agents/characters/:id for shared-character access checks
import { ElizaPageClient } from "@/packages/ui/src/components/chat/eliza-page-client";

/**
 * Eliza chat page for interacting with AI agents/characters.
 * Supports both authenticated and anonymous users.
 *
 * @returns The rendered Eliza chat page client component.
 */
export default function ElizaPage() {
  return (
    <ElizaPageClient
      initialCharacters={[]}
      isAuthenticated={false}
      userId={null}
      initialRoomId={undefined}
      initialCharacterId={undefined}
      sharedCharacter={null}
      isOwnerOfSelectedCharacter={false}
      accessError={undefined}
    />
  );
}
