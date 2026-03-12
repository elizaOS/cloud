import {
  AgentRuntime,
  ChannelType,
  createCharacter,
  createMessageMemory,
  type IAgentRuntime,
  type Plugin,
  stringToUuid,
} from "@elizaos/core";
import sqlPlugin from "@elizaos/plugin-sql";
import { getRedis } from "./redis";

interface AgentEntry {
  agentId: string;
  characterRef: string;
  runtime: IAgentRuntime;
  state: "running" | "stopped";
}

export class AgentManager {
  private agents = new Map<string, AgentEntry>();
  private _draining = false;
  private inFlight = 0;

  async initialize() {
    await getRedis().set(`server:${process.env.SERVER_NAME}:status`, "running");
  }

  isDraining(): boolean {
    return this._draining;
  }

  getStatus() {
    return {
      serverName: process.env.SERVER_NAME,
      tier: process.env.TIER,
      capacity: Number(process.env.CAPACITY),
      agentCount: this.agents.size,
      inFlight: this.inFlight,
      draining: this._draining,
      agents: [...this.agents.values()].map((a) => ({
        agentId: a.agentId,
        characterRef: a.characterRef,
        state: a.state,
      })),
    };
  }

  getRuntime(agentId: string): IAgentRuntime {
    const entry = this.agents.get(agentId);
    if (!entry) throw new Error("Agent not found");
    if (entry.state !== "running") throw new Error("Agent not running");
    return entry.runtime;
  }

  async startAgent(agentId: string, characterRef: string) {
    if (this.agents.size >= Number(process.env.CAPACITY)) {
      throw new Error("At capacity");
    }
    if (this.agents.has(agentId)) {
      throw new Error("Agent already exists");
    }

    // Reserve the slot immediately to prevent concurrent requests from exceeding capacity
    this.agents.set(agentId, {
      agentId,
      characterRef,
      runtime: null as unknown as IAgentRuntime,
      state: "stopped",
    });

    try {
      const character = createCharacter({
        name: characterRef,
        secrets: {
          POSTGRES_URL: process.env.POSTGRES_URL || "",
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
          ELIZAOS_CLOUD_API_KEY: process.env.ELIZAOS_CLOUD_API_KEY || "",
        },
      });

      // Priority: elizacloud (unified proxy) > openai
      const plugins: Plugin[] = [sqlPlugin as Plugin];
      if (process.env.ELIZAOS_CLOUD_API_KEY) {
        const elizacloudPlugin = await import("@elizaos/plugin-elizacloud");
        plugins.push(elizacloudPlugin.default as Plugin);
      } else if (process.env.OPENAI_API_KEY) {
        const { openaiPlugin } = await import("@elizaos/plugin-openai");
        plugins.push(openaiPlugin);
      }

      const runtime = new AgentRuntime({ character, plugins });
      const skipMigrations = process.env.SKIP_MIGRATIONS === "true";
      await runtime.initialize({ skipMigrations });

      this.agents.set(agentId, {
        agentId,
        characterRef,
        runtime,
        state: "running",
      });
      await getRedis().set(`agent:${agentId}:server`, process.env.SERVER_NAME!);
    } catch (err) {
      this.agents.delete(agentId);
      throw err;
    }
  }

  async stopAgent(id: string) {
    const entry = this.agents.get(id);
    if (!entry) throw new Error("Agent not found");
    if (entry.state === "stopped") return;
    await entry.runtime.stop();
    entry.state = "stopped";
  }

  async deleteAgent(id: string) {
    const entry = this.agents.get(id);
    if (!entry) throw new Error("Agent not found");
    if (entry.state === "running") await entry.runtime.stop();
    this.agents.delete(id);
    await getRedis().del(`agent:${id}:server`);
  }

  async handleMessage(agentId: string, userId: string, text: string) {
    this.inFlight++;
    try {
      const rt = this.getRuntime(agentId);
      const uid = stringToUuid(userId);
      const roomId = stringToUuid(`${agentId}:${userId}`);
      const worldId = stringToUuid(`server:${process.env.SERVER_NAME}`);

      await rt.ensureConnection({
        entityId: uid,
        roomId,
        worldId,
        userName: userId,
        source: "agent-server",
        channelId: `${agentId}-${userId}`,
        type: ChannelType.DM,
      } as Parameters<typeof rt.ensureConnection>[0]);

      const mem = createMessageMemory({
        entityId: uid,
        roomId,
        content: {
          text,
          source: "agent-server",
          channelType: ChannelType.DM,
        },
      });

      let response = "";
      await rt.messageService?.handleMessage(rt, mem, async (content) => {
        if (content?.text) response += content.text;
        return [];
      });

      return response || "No response generated.";
    } finally {
      this.inFlight--;
    }
  }

  async drain() {
    this._draining = true;

    // Wait for in-flight requests to finish before stopping runtimes
    const deadline = Date.now() + 50_000;
    while (this.inFlight > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }

    for (const [, entry] of this.agents) {
      if (entry.state === "running") {
        await entry.runtime.stop();
        entry.state = "stopped";
      }
    }
  }

  async cleanupRedis() {
    const redis = getRedis();
    const keys = [
      `server:${process.env.SERVER_NAME}:status`,
      ...Array.from(this.agents.keys()).map((id) => `agent:${id}:server`),
    ];
    if (keys.length > 0) await redis.del(...keys);
  }
}
