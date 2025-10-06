// CORRECTED Serverless-compatible agent runtime with Drizzle ORM for Next.js
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
  type IDatabaseAdapter,
} from "@elizaos/core";
import { createDatabaseAdapter } from "@elizaos/plugin-sql";
import agent from "./agent";

interface GlobalWithEliza {
  __elizaManagerLogged?: boolean;
  __elizaRuntime?: AgentRuntime;
  __elizaDatabaseAdapter?: IDatabaseAdapter;
  __elizaInitPromise?: Promise<AgentRuntime>;
  logger?: Logger;
}

const globalAny = globalThis as GlobalWithEliza;
if (typeof globalAny.__elizaManagerLogged === "undefined")
  globalAny.__elizaManagerLogged = false;

class AgentRuntimeManager {
  private static instance: AgentRuntimeManager;
  public runtime: AgentRuntime | null = null;

  private constructor() {
    // Configure the elizaLogger to use console
    if (elizaLogger) {
      elizaLogger.log = console.log.bind(console);
      elizaLogger.info = console.info.bind(console);
      elizaLogger.warn = console.warn.bind(console);
      elizaLogger.error = console.error.bind(console);
      elizaLogger.debug = console.debug.bind(console);
      elizaLogger.success = (obj: string | Error | Record<string, unknown>, msg?: string) => {
        if (typeof obj === 'string') {
          console.log(`✓ ${obj}`);
        } else {
          console.log('✓', obj, msg);
        }
      };
      if ("notice" in elizaLogger) {
        (elizaLogger as Logger & { notice: typeof console.info }).notice = console.info.bind(console);
      }
    }

    // Also configure global console if needed
    if (typeof globalThis !== "undefined" && !globalAny.logger) {
      globalAny.logger = {
        level: 'info',
        log: console.log.bind(console),
        trace: console.trace.bind(console),
        debug: console.debug.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        fatal: console.error.bind(console),
        success: (obj: string | Error | Record<string, unknown>, msg?: string) => {
          if (typeof obj === 'string') {
            console.log(`✓ ${obj}`);
          } else {
            console.log('✓', obj, msg);
          }
        },
        progress: console.log.bind(console),
        clear: () => console.clear(),
        child: () => globalAny.logger!,
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
      // Determine the desired agent ID for this deployment
      const desiredAgentId = (agent.character?.id as UUID) || (stringToUuid("eliza-cloud-v2-agent") as UUID);
      // Reuse a cached singleton runtime across warm invocations
      if (globalAny.__elizaRuntime) {
        // Invalidate cached runtime if agentId mismatches the configured one
        if (globalAny.__elizaRuntime.agentId !== desiredAgentId) {
          elizaLogger.warn("#Eliza", "Cached runtime agentId mismatch. Reinitializing runtime.");
          globalAny.__elizaRuntime = undefined;
          globalAny.__elizaDatabaseAdapter = undefined;
          this.runtime = null;
        } else {
          this.runtime = globalAny.__elizaRuntime;
        }
        // Ensure agent exists even when using cached runtime
        if (this.runtime) {
          await this.runtime.ensureAgentExists({
            id: this.runtime.agentId,
            name: agent.character?.name || "Eliza",
          } as Agent);
          return this.runtime;
        }
      }

      // If another request is already initializing the runtime, wait for it
      if (globalAny.__elizaInitPromise) {
        elizaLogger.info("#Eliza", "Awaiting existing runtime initialization");
        await globalAny.__elizaInitPromise;
        this.runtime = globalAny.__elizaRuntime!;
        // Ensure agent exists even when using cached runtime
        await this.runtime.ensureAgentExists({
          id: this.runtime.agentId,
          name: agent.character?.name || "Eliza",
        } as Agent);
        return this.runtime;
      }

      // Validate database URL before proceeding
      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL environment variable is required for ElizaOS runtime");
      }

      // ARCHITECTURE NOTE:
      // - ONE Agent (this ID) serves ALL conversations
      // - MANY Rooms (created in POST /api/eliza/rooms) - one per user  
      // - The agent runtime is cached globally for all requests
      // Use the character id if provided; else derive from stable seed
      const RUNTIME_AGENT_ID = desiredAgentId;
      
      elizaLogger.info("#Eliza", "Creating database adapter before runtime initialization");

      // ========================================================================
      // CRITICAL: Create and initialize database adapter FIRST
      // ========================================================================
      let dbAdapter;
      
      // Reuse cached adapter if available (for warm containers)
      if (globalAny.__elizaDatabaseAdapter) {
        elizaLogger.info("#Eliza", "Reusing cached database adapter");
        dbAdapter = globalAny.__elizaDatabaseAdapter;
      } else {
        elizaLogger.info("#Eliza", "Creating new database adapter");
        dbAdapter = createDatabaseAdapter(
          {
            postgresUrl: process.env.DATABASE_URL,
          },
          RUNTIME_AGENT_ID
        );

        // Initialize the adapter
        await dbAdapter.init();
        elizaLogger.info("#Eliza", "Database adapter initialized");

        // Cache globally for warm containers
        globalAny.__elizaDatabaseAdapter = dbAdapter;
      }

      // ========================================================================
      // Create runtime WITHOUT plugin-sql (we already have the adapter)
      // ========================================================================
      elizaLogger.info("#Eliza", "Creating AgentRuntime with plugins:", 
        agent.plugins.filter(p => p.name !== '@elizaos/plugin-sql').map(p => p.name).join(", "));
      
      // Filter out plugin-sql since we're providing our own adapter
      const pluginsWithoutSql = agent.plugins.filter(p => p.name !== '@elizaos/plugin-sql');

      this.runtime = new AgentRuntime({
        character: agent.character,
        plugins: pluginsWithoutSql,  // Exclude plugin-sql
        agentId: RUNTIME_AGENT_ID,
        settings: {
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
          POSTGRES_URL: process.env.DATABASE_URL,
          DATABASE_URL: process.env.DATABASE_URL,
          ...agent.character.settings,
        },
      });

      // ========================================================================
      // CRITICAL: Register the pre-initialized adapter BEFORE runtime.initialize()
      // ========================================================================
      elizaLogger.info("#Eliza", "Registering pre-initialized database adapter");
      this.runtime.registerDatabaseAdapter(dbAdapter);

      // Expose an init promise to serialize concurrent initializations
      globalAny.__elizaInitPromise = (async () => {
        // Cache runtime early so waiters can pick it up after init
        globalAny.__elizaRuntime = this.runtime!;
        return this.runtime!;
      })();

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

      // ========================================================================
      // Initialize runtime with error handling for existing records
      // ========================================================================
      try {
        elizaLogger.info("#Eliza", "Starting runtime initialization...");
        
        // Call runtime.initialize() to load plugins and set up everything
        // This may fail if agent/entity records already exist - handle gracefully
        try {
          await this.runtime.initialize();
          elizaLogger.success("#Eliza", "Runtime initialized successfully");
        } catch (initError) {
          const errorMsg = initError instanceof Error ? initError.message : String(initError);
          
          // If error is about agent/entity already existing, that's fine - continue
          if (errorMsg.includes("Failed to create entity") ||
              errorMsg.includes("Failed to create agent") ||
              errorMsg.toLowerCase().includes("duplicate key") ||
              errorMsg.toLowerCase().includes("unique constraint")) {
            elizaLogger.warn("#Eliza", "Agent/entity records already exist, continuing with existing data");
            
            // Verify adapter is functional
            const isReady = await dbAdapter.isReady();
            if (!isReady) {
              throw new Error("Database adapter is not ready after initialization attempt");
            }
          } else {
            // Other errors are serious, re-throw
            throw initError;
          }
        }

        // Verify agent and entity exist using RUNTIME methods (not adapter directly)
        const agentExists = await this.runtime.getAgent(RUNTIME_AGENT_ID);
        if (!agentExists) {
          elizaLogger.info("#Eliza", "Agent not found, creating via runtime...");
          await this.runtime.ensureAgentExists({
            id: RUNTIME_AGENT_ID,
            name: agent.character?.name || "Eliza",
            username: agent.character?.username,
            system: agent.character?.system || "",
            bio: agent.character?.bio || [],
            messageExamples: agent.character?.messageExamples || [],
            postExamples: agent.character?.postExamples || [],
            topics: agent.character?.topics || [],
            adjectives: agent.character?.adjectives || [],
            knowledge: agent.character?.knowledge || [],
            plugins: agent.character?.plugins || [],
            settings: agent.character?.settings || {},
            style: agent.character?.style || {},
          } as Agent);
        }

        // Check if entity exists using runtime
        const entities = await this.runtime.getEntitiesByIds([RUNTIME_AGENT_ID]);
        if (!entities || entities.length === 0) {
          elizaLogger.info("#Eliza", "Agent entity not found, creating via runtime...");
          try {
            await this.runtime.createEntity({
              id: RUNTIME_AGENT_ID,
              agentId: RUNTIME_AGENT_ID,
              names: [agent.character?.name || "Eliza"],
              metadata: { name: agent.character?.name || "Eliza" },
            });
          } catch (entityError) {
            const msg = entityError instanceof Error ? entityError.message : String(entityError);
            if (
              msg.toLowerCase().includes("duplicate key") ||
              msg.toLowerCase().includes("unique constraint")
            ) {
              elizaLogger.warn("#Eliza", "Agent entity already exists, continuing");
            } else {
              throw entityError;
            }
          }
        }

        elizaLogger.success("#Eliza", "Runtime ready - agent exists and operational");
      } catch (error) {
        elizaLogger.error("#Eliza", "Runtime setup failed:", error);
        // Only clear caches on truly fatal errors (when runtime never set)
        if (!globalAny.__elizaRuntime) {
          this.runtime = null;
          globalAny.__elizaRuntime = undefined;
          globalAny.__elizaDatabaseAdapter = undefined;
        }
        throw error;
      } finally {
        // Clear init promise so future calls don't hang
        globalAny.__elizaInitPromise = undefined;
      }
    }
    return this.runtime;
  }

  // Helper method to handle messages using the full ElizaOS event pipeline
  public async handleMessage(
    roomId: string,
    entityId: string,
    content: { text?: string; attachments?: unknown[] },
  ): Promise<{
    message: Memory;
    usage?: { inputTokens: number; outputTokens: number; model: string };
  }> {
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
      id: uuidv4() as UUID,
      roomId: roomId as UUID,
      entityId: entityUuid,
      agentId: runtime.agentId as UUID,
      createdAt: Date.now(),
      content: {
        text: content.text || "",
        ...(content.attachments && Array.isArray(content.attachments) && content.attachments.length > 0
          ? { attachments: content.attachments as unknown as import("@elizaos/core").Media[] }
          : {}),
      },
    };

    // Track usage from callback
    let usage: { inputTokens: number; outputTokens: number; model: string } | undefined;

    // Use the full ElizaOS event pipeline (like OTC agent)
    // This triggers the plugin's messageReceivedHandler which will:
    // 1. Use providers to gather context
    // 2. Compose state with composeState()
    // 3. Call useModel() with full context
    // 4. Process any actions
    // 5. Create and save the response memory
    await runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
      runtime,
      message: userMessage,
      callback: async (result: { text?: string; usage?: { inputTokens: number; outputTokens: number; model: string } }) => {
        // Response is already saved by the plugin's messageReceivedHandler
        elizaLogger.debug("#Eliza", "Message processed via event pipeline");
        if (result.usage) {
          usage = result.usage;
        }
        return [];
      },
    });

    return { message: userMessage, usage };
  }
}

// Export singleton instance
export const agentRuntime = AgentRuntimeManager.getInstance();

