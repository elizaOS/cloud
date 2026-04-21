import { describe, expect, test } from "bun:test";
import {
  MILADY_CHARACTER_OWNERSHIP_KEY,
  readManagedMiladyDiscordBinding,
  readManagedMiladyDiscordGateway,
  withManagedMiladyDiscordBinding,
  withManagedMiladyDiscordGateway,
  withoutManagedMiladyDiscordBinding,
} from "@/lib/services/eliza-agent-config";

describe("managed Milady Discord config helpers", () => {
  test("writes and reads the managed Discord binding payload", () => {
    const config = withManagedMiladyDiscordBinding(
      {
        existing: true,
        [MILADY_CHARACTER_OWNERSHIP_KEY]: "reuse-existing",
      },
      {
        mode: "cloud-managed",
        applicationId: "discord-app-1",
        guildId: "guild-1",
        guildName: "Guild One",
        adminDiscordUserId: "discord-user-1",
        adminDiscordUsername: "owner",
        adminDiscordDisplayName: "Owner Person",
        adminDiscordAvatarUrl:
          "https://cdn.discordapp.com/avatars/discord-user-1/avatar.png?size=128",
        adminElizaUserId: "user-1",
        botNickname: "Milady",
        connectedAt: "2026-04-04T16:00:00.000Z",
      },
    );

    expect(readManagedMiladyDiscordBinding(config)).toEqual({
      mode: "cloud-managed",
      applicationId: "discord-app-1",
      guildId: "guild-1",
      guildName: "Guild One",
      adminDiscordUserId: "discord-user-1",
      adminDiscordUsername: "owner",
      adminDiscordDisplayName: "Owner Person",
      adminDiscordAvatarUrl:
        "https://cdn.discordapp.com/avatars/discord-user-1/avatar.png?size=128",
      adminElizaUserId: "user-1",
      botNickname: "Milady",
      connectedAt: "2026-04-04T16:00:00.000Z",
    });
    expect(config[MILADY_CHARACTER_OWNERSHIP_KEY]).toBe("reuse-existing");
  });

  test("removes only the managed Discord binding", () => {
    const config = withoutManagedMiladyDiscordBinding({
      existing: true,
      [MILADY_CHARACTER_OWNERSHIP_KEY]: "reuse-existing",
      __miladyManagedDiscord: {
        guildId: "guild-1",
        guildName: "Guild One",
        adminDiscordUserId: "discord-user-1",
        adminDiscordUsername: "owner",
        adminElizaUserId: "user-1",
        connectedAt: "2026-04-04T16:00:00.000Z",
      },
    });

    expect(readManagedMiladyDiscordBinding(config)).toBeNull();
    expect(config).toEqual({
      existing: true,
      [MILADY_CHARACTER_OWNERSHIP_KEY]: "reuse-existing",
    });
  });

  test("writes and reads the managed Discord gateway marker", () => {
    const config = withManagedMiladyDiscordGateway(
      {
        existing: true,
      },
      {
        mode: "shared-gateway",
        createdAt: "2026-04-09T00:00:00.000Z",
      },
    );

    expect(readManagedMiladyDiscordGateway(config)).toEqual({
      mode: "shared-gateway",
      createdAt: "2026-04-09T00:00:00.000Z",
    });
    expect(config.existing).toBe(true);
  });
});
