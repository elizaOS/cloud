import { describe, expect, test } from "bun:test";
import {
  MILADY_CHARACTER_OWNERSHIP_KEY,
  readManagedMiladyGithubBinding,
  withManagedMiladyGithubBinding,
  withoutManagedMiladyGithubBinding,
} from "@/lib/services/eliza-agent-config";

describe("managed Milady GitHub config helpers", () => {
  test("writes and reads the managed GitHub binding payload", () => {
    const config = withManagedMiladyGithubBinding(
      {
        existing: true,
        [MILADY_CHARACTER_OWNERSHIP_KEY]: "reuse-existing",
      },
      {
        mode: "cloud-managed",
        connectionId: "conn-1",
        githubUserId: "12345",
        githubUsername: "octocat",
        githubDisplayName: "The Octocat",
        githubAvatarUrl: "https://avatars.githubusercontent.com/u/12345",
        githubEmail: "octocat@github.com",
        scopes: ["repo", "read:user", "user:email"],
        adminElizaUserId: "user-1",
        connectedAt: "2026-04-05T16:00:00.000Z",
      },
    );

    expect(readManagedMiladyGithubBinding(config)).toEqual({
      mode: "cloud-managed",
      connectionId: "conn-1",
      githubUserId: "12345",
      githubUsername: "octocat",
      githubDisplayName: "The Octocat",
      githubAvatarUrl: "https://avatars.githubusercontent.com/u/12345",
      githubEmail: "octocat@github.com",
      scopes: ["repo", "read:user", "user:email"],
      adminElizaUserId: "user-1",
      connectedAt: "2026-04-05T16:00:00.000Z",
    });
    expect(config[MILADY_CHARACTER_OWNERSHIP_KEY]).toBe("reuse-existing");
  });

  test("removes only the managed GitHub binding", () => {
    const config = withoutManagedMiladyGithubBinding({
      existing: true,
      [MILADY_CHARACTER_OWNERSHIP_KEY]: "reuse-existing",
      __miladyManagedGithub: {
        connectionId: "conn-1",
        githubUserId: "12345",
        githubUsername: "octocat",
        scopes: ["repo"],
        adminElizaUserId: "user-1",
        connectedAt: "2026-04-05T16:00:00.000Z",
      },
    });

    expect(readManagedMiladyGithubBinding(config)).toBeNull();
    expect(config).toEqual({
      existing: true,
      [MILADY_CHARACTER_OWNERSHIP_KEY]: "reuse-existing",
    });
  });

  test("returns null for missing or incomplete binding", () => {
    expect(readManagedMiladyGithubBinding(null)).toBeNull();
    expect(readManagedMiladyGithubBinding({})).toBeNull();
    expect(
      readManagedMiladyGithubBinding({
        __miladyManagedGithub: { githubUserId: "12345" },
      }),
    ).toBeNull();
  });
});
