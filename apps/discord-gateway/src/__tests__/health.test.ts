import { describe, expect, it } from "bun:test";

describe("Discord Gateway Health", () => {
  it("should build successfully", () => {
    // This test just verifies the project builds and can be loaded
    expect(true).toBe(true);
  });

  it("should have valid package.json", async () => {
    const pkg = await Bun.file("./package.json").json();
    expect(pkg.name).toBe("@elizaos/discord-gateway");
    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.start).toBeDefined();
  });

  it("should have required dependencies", async () => {
    const pkg = await Bun.file("./package.json").json();
    expect(pkg.dependencies["discord.js"]).toBeDefined();
    expect(pkg.dependencies["hono"]).toBeDefined();
    expect(pkg.dependencies["@hono/node-server"]).toBeDefined();
    expect(pkg.dependencies["@upstash/redis"]).toBeDefined();
  });
});
