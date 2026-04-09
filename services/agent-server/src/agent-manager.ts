import {
  AgentRuntime,
  ChannelType,
  createMessageMemory,
  type IAgentRuntime,
  mergeCharacterDefaults,
  type Plugin,
  stringToUuid,
} from "@elizaos/core";
import sqlPlugin from "@elizaos/plugin-sql";
import { type DispatchResult, dispatchEvent, type JsonObject } from "./handlers/event";
import { logger } from "./logger";
import { getRedis } from "./redis";

interface AgentEntry {
  agentId: string;
  characterRef: string;
  runtime: IAgentRuntime;
  state: "running" | "stopped";
}

const REDIS_STATE_TTL_SECONDS = Math.max(
  60,
  Number.parseInt(process.env.REDIS_STATE_TTL_SECONDS ?? "120", 10) || 120,
);
const REDIS_REFRESH_INTERVAL_MS = 30_000;
const AGENT_ROUTING_TTL_SECONDS = 30 * 24 * 3600;

/**
 * Manages the lifecycle of agent runtimes within this pod.
 *
 * Responsibilities:
 *   - Maintains an in-memory Map of loaded agents and their runtimes
 *   - Tracks in-flight request count for graceful SIGTERM drain
 *   - Publishes server/agent state to Redis for gateway routing
 *   - Provides handleMessage() and handleEvent() entry points
 */
export class AgentManager {
  private agents = new Map<string, AgentEntry>();
  private _draining = false;
  private inFlight = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Returns the internal K8s service URL for this pod. */
  private getServerUrl(): string {
    const namespace = process.env.POD_NAMESPACE || "eliza-agents";
    return `http://${process.env.SERVER_NAME}.${namespace}.svc:3000`;
  }

  /** Publishes server status, URL, and agent→server mappings to Redis with TTLs. */
  private async refreshRedisState(status = this._draining ? "draining" : "running") {
    const redis = getRedis();
    const multi = redis.multi();
    const serverName = process.env.SERVER_NAME!;

    multi.set(`server:${serverName}:status`, status, "EX", REDIS_STATE_TTL_SECONDS);
    multi.set(`server:${serverName}:url`, this.getServerUrl(), "EX", REDIS_STATE_TTL_SECONDS);

    for (const agentId of this.agents.keys()) {
      multi.set(`agent:${agentId}:server`, serverName, "EX", AGENT_ROUTING_TTL_SECONDS);
    }

    await multi.exec();
  }

  /** Starts the periodic Redis state refresh timer. */
  private startHeartbeat() {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      void this.refreshRedisState().catch((err) => {
        logger.error("Failed to refresh agent-server Redis state", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, REDIS_REFRESH_INTERVAL_MS);

    if (typeof this.heartbeatTimer === "object" && "unref" in this.heartbeatTimer) {
      this.heartbeatTimer.unref();
    }
  }

  /** Stops the periodic Redis state refresh timer. */
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Initializes Redis state and starts the heartbeat. Must be called before accepting traffic. */
  async initialize() {
    await this.refreshRedisState("running");
    this.startHeartbeat();
  }

  /** Returns true when SIGTERM has been received and the server is draining. */
  isDraining(): boolean {
    return this._draining;
  }

  /** Returns a snapshot of server and agent state for the /status endpoint. */
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

  /**
   * Returns the IAgentRuntime for a loaded, running agent.
   * @throws {Error} "Agent not found" if the agent is not loaded on this pod
   * @throws {Error} "Agent not running" if the agent is in a stopped state
   */
  getRuntime(agentId: string): IAgentRuntime {
    const entry = this.agents.get(agentId);
    if (!entry) throw new Error("Agent not found");
    if (entry.state !== "running") throw new Error("Agent not running");
    return entry.runtime;
  }

  /**
   * Starts a new agent runtime on this pod.
   * Reserves capacity immediately, then initializes the runtime asynchronously.
   * @throws {Error} "At capacity" if no slots are available
   * @throws {Error} "Agent already exists" if the agent is already loaded
   */
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
      const character = mergeCharacterDefaults({
        name: characterRef.toLowerCase(),
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
        const openaiMod = (await import("@elizaos/plugin-openai")) as {
          openaiPlugin?: Plugin;
          default?: Plugin;
        };
        const openaiPlugin = openaiMod.openaiPlugin ?? openaiMod.default;
        if (!openaiPlugin) {
          throw new Error("@elizaos/plugin-openai: expected openaiPlugin or default export");
        }
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
      await this.refreshRedisState();
    } catch (err) {
      this.agents.delete(agentId);
      throw err;
    }
  }

  /** Stops a running agent's runtime, transitioning it to "stopped" state. */
  async stopAgent(id: string) {
    const entry = this.agents.get(id);
    if (!entry) throw new Error("Agent not found");
    if (entry.state === "stopped") return;
    await entry.runtime.stop();
    entry.state = "stopped";
    await this.refreshRedisState();
  }

  /** Stops and removes an agent, cleaning up its Redis routing key. */
  async deleteAgent(id: string) {
    const entry = this.agents.get(id);
    if (!entry) throw new Error("Agent not found");
    if (entry.state === "running") await entry.runtime.stop();
    this.agents.delete(id);
    await getRedis().del(`agent:${id}:server`);
    await this.refreshRedisState();
  }

  /**
   * Handles a structured event delivered by the gateway's forwardEventToServer().
   *
   * Tracks in-flight count so drain() waits for event processing to complete
   * before stopping runtimes on SIGTERM. Delegates dispatch to handlers/event.ts.
   */
  async handleEvent(
    agentId: string,
    userId: string,
    type: "cron" | "notification" | "system",
    payload: JsonObject,
  ): Promise<DispatchResult> {
    this.inFlight++;
    try {
      const rt = this.getRuntime(agentId);
      return await dispatchEvent(rt, agentId, userId, type, payload);
    } finally {
      this.inFlight--;
    }
  }

  /**
   * Handles a user message by routing it through the agent's message pipeline.
   * Tracks in-flight count for graceful drain during SIGTERM.
   */
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

  /**
   * Initiates graceful drain: marks the server as draining, waits up to 50s
   * for in-flight requests (messages + events) to complete, then stops all runtimes.
   */
  async drain() {
    this._draining = true;
    await this.refreshRedisState("draining");
    this.stopHeartbeat();

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

  /** Removes this server's status/url keys from Redis during shutdown. */
  async cleanupRedis() {
    this.stopHeartbeat();
    const redis = getRedis();
    // Only clean server status/url — agent mappings are managed by the operator
    // and must persist across scale-down so the gateway can still route messages
    const keys = [
      `server:${process.env.SERVER_NAME}:status`,
      `server:${process.env.SERVER_NAME}:url`,
    ];
    await redis.del(...keys);
  }
}
