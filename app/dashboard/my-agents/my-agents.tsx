import { myAgentsService } from "@/lib/services/my-agents";
import { requireAuthWithOrg } from "@/lib/auth";
import { MyAgentsClient as MyAgentsClientComponent } from "@/components/my-agents";
import type { ElizaCharacter } from "@/lib/types";

export async function MyAgentsClient() {
  const user = await requireAuthWithOrg();

  const result = await myAgentsService.searchCharacters({
    userId: user.id,
    organizationId: user.organization_id!,
    filters: {},
    sortOptions: {
      sortBy: "updated",
      order: "desc",
    },
    pagination: {
      page: 1,
      limit: 100,
    },
    includeStats: false,
  });

  const characters: ElizaCharacter[] = result.characters.map(char => ({
    id: char.id,
    name: char.name,
    username: char.username,
    system: char.system,
    bio: char.bio,
    messageExamples: char.messageExamples,
    postExamples: char.postExamples,
    topics: char.topics,
    adjectives: char.adjectives,
    knowledge: char.knowledge,
    plugins: char.plugins,
    settings: char.settings,
    secrets: char.secrets,
    style: char.style,
    ...(char.avatarUrl && { avatarUrl: char.avatarUrl }),
  }));

  return <MyAgentsClientComponent initialCharacters={characters} />;
}
