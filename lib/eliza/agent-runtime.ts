// Serverless-compatible agent runtime with Eliza for Next.js
import { v4 as uuidv4 } from "uuid";
import {
  AgentRuntime,
  ChannelType,
  EventType,
  Memory,
  elizaLogger,
  stringToUuid,
  type UUID,
  type Agent,
  type Logger,
} from "@elizaos/core";
import agent from "./agent";

interface GlobalWithEliza {
  __elizaMigrationsRan?: boolean;
  __elizaManagerLogged?: boolean;
  __elizaRuntime?: AgentRuntime;
  logger?: Logger;
}

const globalAny = globalThis as GlobalWithEliza;
if (typeof globalAny.__elizaMigrationsRan === "undefined")
  globalAny.__elizaMigrationsRan = false;
if (typeof globalAny.__elizaManagerLogged === "undefined")
  globalAny.__elizaManagerLogged = false;

class AgentRuntimeManager {
  private static instance: AgentRuntimeManager;
  public runtime: AgentRuntime | null = null;
  private hasRunMigrations = false;

  private constructor() {
    // Configure the elizaLogger to use console
    if (elizaLogger) {
      elizaLogger.log = console.log.bind(console);
      elizaLogger.info = console.info.bind(console);
      elizaLogger.warn = console.warn.bind(console);
      elizaLogger.error = console.error.bind(console);
      elizaLogger.debug = console.debug.bind(console);
      elizaLogger.success = (msg: string) => console.log(`✓ ${msg}`);
      if ("notice" in elizaLogger) {
        (elizaLogger as Logger & { notice: typeof console.info }).notice = console.info.bind(console);
      }
    }

    // Also configure global console if needed
    if (typeof globalThis !== "undefined" && !globalAny.logger) {
      globalAny.logger = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
      };
    }

    if (!globalAny.__elizaManagerLogged) {
      // Silence noisy init log; keep flag to avoid repeated work
      globalAny.__elizaManagerLogged = true;
    }
  }

  public static getInstance(): AgentRuntimeManager {
    if (!AgentRuntimeManager.instance) {
      AgentRuntimeManager.instance = new AgentRuntimeManager();
    }
    return AgentRuntimeManager.instance;
  }

  public isReady(): boolean {
    return true;
  }

  // Helper method to get or create the runtime instance
  async getRuntime(): Promise<AgentRuntime> {
    if (!this.runtime) {
      // Reuse a cached singleton runtime across warm invocations
      if (globalAny.__elizaRuntime) {
        this.runtime = globalAny.__elizaRuntime;
        // Ensure agent exists even when using cached runtime
        await this.runtime.ensureAgentExists({
          id: this.runtime.agentId,
          name: agent.character?.name || "Eliza",
        } as Agent);
        return this.runtime;
      }

      // Generate a consistent agent ID for this deployment
      const RUNTIME_AGENT_ID = stringToUuid("eliza-serverless-agent") as UUID;
      
      this.runtime = new AgentRuntime({
        character: agent.character,
        plugins: agent.plugins,
        providers: agent.providers,
        actions: agent.actions,
        agentId: RUNTIME_AGENT_ID,
        settings: {
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
          POSTGRES_URL: process.env.DATABASE_URL,
          ...agent.character.settings,
        },
      });

      // Cache globally for reuse in warm container
      globalAny.__elizaRuntime = this.runtime;

      // Ensure runtime has a logger with all required methods
      if (!this.runtime.logger || !this.runtime.logger.log) {
        this.runtime.logger = {
          log: console.log.bind(console),
          info: console.info.bind(console),
          warn: console.warn.bind(console),
          error: console.error.bind(console),
          debug: console.debug.bind(console),
          success: (message: string) => console.log(`✓ ${message}`),
          notice: console.info.bind(console),
        } as Logger & { notice: typeof console.info };
      }

      // Ensure SQL plugin built-in tables exist (idempotent)
      await this.ensureBuiltInTables();

      // Initialize runtime - this calls ensureAgentExists internally
      // which creates both the agent record AND its entity record
      await this.runtime.initialize();
    }
    return this.runtime;
  }

  private async ensureBuiltInTables(): Promise<void> {
    if (this.hasRunMigrations || globalAny.__elizaMigrationsRan)
      return;

    this.hasRunMigrations = true;
    globalAny.__elizaMigrationsRan = true;

    // Database adapter and migrations are handled by @elizaos/plugin-sql during runtime.initialize()
    console.log("[AgentRuntime] Using Eliza database system");
  }

  // Helper method to handle messages
  public async handleMessage(
    roomId: string,
    entityId: string,
    content: { text?: string; attachments?: unknown[] },
  ): Promise<Memory> {
    const runtime = await this.getRuntime();

    // Ensure room and entity connection (follows Eliza's ensureConnection pattern)
    const entityUuid = stringToUuid(entityId) as UUID;
    await runtime.ensureConnection({
      entityId: entityUuid,
      roomId: roomId as UUID,
      worldId: stringToUuid("eliza-world"),
      source: "web",
      type: ChannelType.DM,
      channelId: roomId,
      serverId: "eliza-server",
      userName: entityId,
    });

    // Create user message
    const userMessage: Memory = {
      roomId: roomId as UUID,
      entityId: entityUuid,
      agentId: runtime.agentId as UUID,
      content: {
        text: content.text || "",
        attachments: content.attachments || [],
      },
    };
    
    // Emit MESSAGE_RECEIVED and delegate handling to plugins
    await runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
      runtime,
      message: {
        id: userMessage.id,
        content: {
          text: content.text || "",
          attachments: content.attachments || [],
        },
        entityId: stringToUuid(entityId) as UUID,
        agentId: runtime.agentId,
        roomId: roomId,
        createdAt: Date.now(),
      },
      callback: async (result: { text?: string; attachments?: unknown[] }) => {
        const responseText = result?.text || "";

        const agentMessage: Memory = {
          id: uuidv4() as UUID,
          roomId: roomId as UUID,
          entityId: runtime.agentId as UUID,
          agentId: runtime.agentId as UUID,
          content: {
            text: responseText,
            type: "agent",
          },
        };

        await runtime.createMemory(agentMessage, "messages");
      },
    });

    return userMessage;
  }
}

// Export singleton instance
export const agentRuntime = AgentRuntimeManager.getInstance();

