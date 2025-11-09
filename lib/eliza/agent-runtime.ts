// CORRECTED Serverless-compatible agent runtime with Drizzle ORM for Next.js
// Initialize DOM polyfills first (before any imports that might need them)
import "@/lib/polyfills/dom-polyfills";

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
  type Plugin,
} from "@elizaos/core";
// @ts-expect-error - Type definitions missing in published package (index.node.d.ts not included)
import { createDatabaseAdapter } from "@elizaos/plugin-sql/node";
import agent from "./agent";
import { characterLoader } from "./character-loader";
import type { Character } from "@elizaos/core";
import { connectionCache } from "@/lib/cache/connection-cache";
import { runWithContext } from "./request-context";

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
      elizaLogger.success = (
        obj: string | Error | Record<string, unknown>,
        msg?: string,
      ) => {
        if (typeof obj === "string") {
          console.log(`✓ ${obj}`);
        } else {
          console.log("✓", obj, msg);
        }
      };
      if ("notice" in elizaLogger) {
        (elizaLogger as Logger & { notice: typeof console.info }).notice =
          console.info.bind(console);
      }
    }

    // Also configure global console if needed
    if (typeof globalThis !== "undefined" && !globalAny.logger) {
      globalAny.logger = {
        level: "info",
        log: console.log.bind(console),
        trace: console.trace.bind(console),
        debug: console.debug.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        fatal: console.error.bind(console),
        success: (
          obj: string | Error | Record<string, unknown>,
          msg?: string,
        ) => {
          if (typeof obj === "string") {
            console.log(`✓ ${obj}`);
          } else {
            console.log("✓", obj, msg);
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
      const desiredAgentId =
        (agent.character?.id as UUID) ||
        (stringToUuid("eliza-cloud-v2-agent") as UUID);
      // Reuse a cached singleton runtime across warm invocations
      if (globalAny.__elizaRuntime) {
        // Invalidate cached runtime if agentId mismatches the configured one
        if (globalAny.__elizaRuntime.agentId !== desiredAgentId) {
          elizaLogger.warn(
            "#Eliza",
            "Cached runtime agentId mismatch. Reinitializing runtime.",
          );
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
        throw new Error(
          "DATABASE_URL environment variable is required for ElizaOS runtime",
        );
      }

      // ARCHITECTURE NOTE:
      // - ONE Agent (this ID) serves ALL conversations
      // - MANY Rooms (created in POST /api/eliza/rooms) - one per user
      // - The agent runtime is cached globally for all requests
      // Use the character id if provided; else derive from stable seed
      const RUNTIME_AGENT_ID = desiredAgentId;

      elizaLogger.info(
        "#Eliza",
        "Creating database adapter before runtime initialization",
      );

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
          RUNTIME_AGENT_ID,
        );

        // Initialize the adapter connection
        await dbAdapter.init();
        elizaLogger.info("#Eliza", "Database adapter initialized");

        // Cache globally for warm containers (adapter init runs only ONCE)
        globalAny.__elizaDatabaseAdapter = dbAdapter;
      }

      // ========================================================================
      // Create runtime WITHOUT plugin-sql (we already have the adapter)
      // ========================================================================
      // Load plugins asynchronously (including lazy-loaded knowledge plugin)
      const allPlugins = await agent.getPlugins();

      elizaLogger.info(
        "#Eliza",
        "Creating AgentRuntime with plugins:",
        allPlugins
          .filter((p) => p.name !== "@elizaos/plugin-sql")
          .map((p) => p.name)
          .join(", "),
      );

      // Filter out plugin-sql since we're providing our own adapter
      const pluginsWithoutSql = allPlugins.filter(
        (p) => p.name !== "@elizaos/plugin-sql",
      );

      elizaLogger.info(
        "#Eliza",
        "Plugins being loaded:",
        pluginsWithoutSql.map((p) => ({
          name: p.name,
          hasServices: !!(p.services && p.services.length > 0),
          serviceCount: p.services?.length || 0,
        })),
      );

      // Construct settings with proper fallback for API keys
      const elizaCloudKeyRaw =
        process.env.ELIZAOS_CLOUD_API_KEY ||
        agent.character.secrets?.ELIZAOS_CLOUD_API_KEY ||
        agent.character.settings?.ELIZAOS_CLOUD_API_KEY;

      const elizaCloudKey =
        typeof elizaCloudKeyRaw === "string"
          ? elizaCloudKeyRaw
          : String(elizaCloudKeyRaw || "");

      if (
        !elizaCloudKey ||
        elizaCloudKey === "" ||
        elizaCloudKey === "undefined"
      ) {
        elizaLogger.warn(
          "#Eliza",
          "⚠️  ELIZAOS_CLOUD_API_KEY not configured - AI features may fail. User API key should be injected at runtime.",
        );
      }

      this.runtime = new AgentRuntime({
        character: agent.character,
        plugins: pluginsWithoutSql as Plugin[],
        agentId: RUNTIME_AGENT_ID,
        settings: {
          ELIZAOS_CLOUD_API_KEY: elizaCloudKey,
          POSTGRES_URL: process.env.DATABASE_URL,
          DATABASE_URL: process.env.DATABASE_URL,
          ...agent.character.settings,
          ...agent.character.secrets,
        },
      });

      // ========================================================================
      // CRITICAL: Register the pre-initialized adapter BEFORE runtime.initialize()
      // ========================================================================
      elizaLogger.info(
        "#Eliza",
        "Registering pre-initialized database adapter",
      );
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
          await this.runtime.initialize({ skipMigrations: true });
          elizaLogger.success("#Eliza", "Runtime initialized successfully");

          // Log available services
          const services = (this.runtime as never)["services"];
          if (services) {
            elizaLogger.info(
              "#Eliza",
              "Available services:",
              Object.keys(services),
            );
          }
        } catch (initError) {
          const errorMsg =
            initError instanceof Error ? initError.message : String(initError);

          // If error is about agent/entity already existing, that's fine - continue
          if (
            errorMsg.includes("Failed to create entity") ||
            errorMsg.includes("Failed to create agent") ||
            errorMsg.toLowerCase().includes("duplicate key") ||
            errorMsg.toLowerCase().includes("unique constraint")
          ) {
            elizaLogger.warn(
              "#Eliza",
              "Agent/entity records already exist, continuing with existing data",
            );

            // Verify adapter is functional
            const isReady = await dbAdapter.isReady();
            if (!isReady) {
              throw new Error(
                "Database adapter is not ready after initialization attempt",
              );
            }
          } else {
            // Other errors are serious, re-throw
            throw initError;
          }
        }

        // Verify agent and entity exist using RUNTIME methods (not adapter directly)
        const agentExists = await this.runtime.getAgent(RUNTIME_AGENT_ID);
        if (!agentExists) {
          elizaLogger.info(
            "#Eliza",
            "Agent not found, creating via runtime...",
          );
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
        const entities = await this.runtime.getEntitiesByIds([
          RUNTIME_AGENT_ID,
        ]);
        if (!entities || entities.length === 0) {
          elizaLogger.info(
            "#Eliza",
            "Agent entity not found, creating via runtime...",
          );
          try {
            await this.runtime.createEntity({
              id: RUNTIME_AGENT_ID,
              agentId: RUNTIME_AGENT_ID,
              names: [agent.character?.name || "Eliza"],
              metadata: { name: agent.character?.name || "Eliza" },
            });
          } catch (entityError) {
            const msg =
              entityError instanceof Error
                ? entityError.message
                : String(entityError);
            if (
              msg.toLowerCase().includes("duplicate key") ||
              msg.toLowerCase().includes("unique constraint")
            ) {
              elizaLogger.warn(
                "#Eliza",
                "Agent entity already exists, continuing",
              );
            } else {
              throw entityError;
            }
          }
        }

        elizaLogger.success(
          "#Eliza",
          "Runtime ready - agent exists and operational",
        );
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

  /**
   * Get or create runtime for a specific character
   * Supports dynamic character loading from database
   */
  async getRuntimeForCharacter(characterId?: string): Promise<AgentRuntime> {
    // If no characterId provided, use default character
    if (!characterId) {
      return this.getRuntime();
    }

    // Load character and plugins
    const { character: loadedCharacter, plugins: loadedPlugins } =
      await characterLoader.loadCharacter(characterId);

    // Build runtime with loaded character
    return this.buildRuntimeForCharacter(loadedCharacter, loadedPlugins);
  }

  /**
   * Build runtime for a specific character
   * Internal method used by getRuntimeForCharacter
   * IMPORTANT: Uses the same agent ID for all characters to maintain database consistency
   */
  private async buildRuntimeForCharacter(
    character: Character,
    plugins: Plugin[],
  ): Promise<AgentRuntime> {
    // Validate database URL
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL environment variable is required for ElizaOS runtime",
      );
    }

    // CRITICAL: Always use the default Eliza agent ID for database consistency
    // All characters share the same agent ID to avoid database conflicts
    const desiredAgentId = stringToUuid(
      "b850bc30-45f8-0041-a00a-83df46d8555d",
    ) as UUID;

    elizaLogger.info(
      "#Eliza",
      `Creating runtime for character: ${character.name} (${desiredAgentId})`,
    );

    // Get or create database adapter
    let dbAdapter: IDatabaseAdapter;

    if (globalAny.__elizaDatabaseAdapter) {
      elizaLogger.info("#Eliza", "Reusing cached database adapter");
      dbAdapter = globalAny.__elizaDatabaseAdapter;
    } else {
      elizaLogger.info("#Eliza", "Creating new database adapter");
      dbAdapter = createDatabaseAdapter(
        {
          postgresUrl: process.env.DATABASE_URL,
        },
        desiredAgentId,
      );

      await dbAdapter.init();
      elizaLogger.info("#Eliza", "Database adapter initialized");

      globalAny.__elizaDatabaseAdapter = dbAdapter;
    }

    // Filter out plugin-sql since we're providing our own adapter
    const pluginsWithoutSql = plugins.filter(
      (p) => p.name !== "@elizaos/plugin-sql",
    );

    // Extract ElizaCloud API key with proper fallbacks
    const elizaCloudKeyRaw =
      process.env.ELIZAOS_CLOUD_API_KEY ||
      character.secrets?.ELIZAOS_CLOUD_API_KEY ||
      character.settings?.ELIZAOS_CLOUD_API_KEY;

    const elizaCloudKey =
      typeof elizaCloudKeyRaw === "string"
        ? elizaCloudKeyRaw
        : String(elizaCloudKeyRaw || "");

    if (
      !elizaCloudKey ||
      elizaCloudKey === "" ||
      elizaCloudKey === "undefined"
    ) {
      elizaLogger.warn(
        "#Eliza",
        "⚠️  ELIZAOS_CLOUD_API_KEY not configured - AI features may fail",
      );
    }

    // Create new runtime for this character
    const characterRuntime = new AgentRuntime({
      character,
      plugins: pluginsWithoutSql as Plugin[],
      agentId: desiredAgentId,
      settings: {
        ELIZAOS_CLOUD_API_KEY: elizaCloudKey,
        POSTGRES_URL: process.env.DATABASE_URL,
        DATABASE_URL: process.env.DATABASE_URL,
        ...character.settings,
        ...character.secrets,
      },
    });

    // Register database adapter
    characterRuntime.registerDatabaseAdapter(dbAdapter);

    // Ensure runtime has logger
    if (!characterRuntime.logger || !characterRuntime.logger.log) {
      characterRuntime.logger = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
        success: (message: string) => console.log(`✓ ${message}`),
        notice: console.info.bind(console),
      } as Logger & { notice: typeof console.info };
    }

    // Initialize runtime
    try {
      elizaLogger.info("#Eliza", "Initializing character runtime...");

      try {
        await characterRuntime.initialize();
        elizaLogger.success("#Eliza", "Character runtime initialized");
      } catch (initError) {
        const errorMsg =
          initError instanceof Error ? initError.message : String(initError);

        if (
          errorMsg.includes("Failed to create entity") ||
          errorMsg.includes("Failed to create agent") ||
          errorMsg.toLowerCase().includes("duplicate key") ||
          errorMsg.toLowerCase().includes("unique constraint")
        ) {
          elizaLogger.warn(
            "#Eliza",
            "Agent/entity records already exist, continuing",
          );

          const isReady = await dbAdapter.isReady();
          if (!isReady) {
            throw new Error("Database adapter not ready after initialization");
          }
        } else {
          throw initError;
        }
      }

      // Ensure agent entity exists
      try {
        await characterRuntime.ensureAgentExists({
          id: characterRuntime.agentId,
          name: character.name || "Eliza",
        } as Agent);
      } catch (entityError) {
        const msg =
          entityError instanceof Error
            ? entityError.message.toLowerCase()
            : String(entityError).toLowerCase();

        if (
          msg.includes("duplicate key") ||
          msg.includes("unique constraint")
        ) {
          elizaLogger.warn("#Eliza", "Agent entity already exists");
        } else {
          throw entityError;
        }
      }

      elizaLogger.success(
        "#Eliza",
        `Character runtime ready: ${character.name}`,
      );
    } catch (error) {
      elizaLogger.error("#Eliza", "Character runtime setup failed:", error);
      throw error;
    }

    return characterRuntime;
  }

  // Helper method to handle messages using the full ElizaOS event pipeline
  public async handleMessage(
    roomId: string,
    entityId: string,
    content: { text?: string; attachments?: unknown[] },
    characterId?: string,
    userSettings?: {
      userId?: string;
      apiKey?: string;
      modelPreferences?: {
        smallModel?: string;
        largeModel?: string;
      };
    },
  ): Promise<{
    message: Memory;
    usage?: { inputTokens: number; outputTokens: number; model: string };
  }> {
    // Get runtime for specific character or default
    let runtime: AgentRuntime;
    
    if (characterId) {
      runtime = await this.getRuntimeForCharacter(characterId);
    } else {
      runtime = await this.getRuntime();
    }

    // CRITICAL: Use AsyncLocalStorage for per-request context isolation
    // This prevents race conditions in multi-tenant shared runtime
    // The plugin can access context via getRequestContext() helper
    
    // Log API key being used (FULL KEY for debugging)
    console.log("[AgentRuntime] ==================== API KEY INJECTION ====================");
    if (userSettings?.apiKey) {
      console.log("[AgentRuntime] ✅ User API key provided (FULL KEY):", userSettings.apiKey);
      console.log("[AgentRuntime] API key length:", userSettings.apiKey.length);
      console.log("[AgentRuntime] User ID:", userSettings.userId);
      if (userSettings.modelPreferences) {
        console.log("[AgentRuntime] Model preferences:", userSettings.modelPreferences);
      }
    } else {
      console.log("[AgentRuntime] ❌ No user API key provided!");
    }
    console.log("[AgentRuntime] ================================================================");
    
    return runWithContext(
      {
        userId: userSettings?.userId,
        apiKey: userSettings?.apiKey,
        modelPreferences: userSettings?.modelPreferences,
      },
      async () => {
        console.log("[AgentRuntime] ✅ Running with isolated request context");
        console.log("[AgentRuntime] Context API key:", userSettings?.apiKey);
        elizaLogger.debug(
          "[AgentRuntime] Running with isolated request context",
        );

        // OPTIMIZATION: Check connection cache before calling ensureConnection
        // This avoids a DB query on every message for established connections
        const entityUuid = stringToUuid(entityId) as UUID;
    const isConnectionCached = await connectionCache.isEstablished(
      roomId,
      entityId,
    );

    if (!isConnectionCached) {
      // Connection not cached - ensure it exists and cache the result

      // Use ensureConnections (plural) for more robust entity/room creation
      // This avoids the core library bug in ensureConnection (singular) that
      // improperly formats the names array parameter
      const worldId = stringToUuid("eliza-world") as UUID;

      await runtime.ensureConnections(
        [
          {
            id: entityUuid,
            names: [entityId],
            metadata: { name: entityId, web: { userName: entityId } },
          },
        ],
        [
          {
            id: roomId as UUID,
            name: entityId,
            type: ChannelType.DM,
            channelId: roomId,
          },
        ],
        "web",
        {
          id: worldId,
          name: "eliza-world",
          serverId: "eliza-server",
        },
      );

      // Mark connection as established in cache
      await connectionCache.markEstablished(roomId, entityId);
      elizaLogger.debug("[AgentRuntime] Connection established and cached");
    } else {
      elizaLogger.debug("[AgentRuntime] Using cached connection");
    }

    // Create user message
    // Note: The plugin (assistantPlugin) will save this to the database via the event handler
    const userMessage: Memory = {
      id: uuidv4() as UUID,
      roomId: roomId as UUID,
      entityId: entityUuid,
      agentId: runtime.agentId as UUID,
      createdAt: Date.now(),
      content: {
        text: content.text || "",
        ...(content.attachments &&
        Array.isArray(content.attachments) &&
        content.attachments.length > 0
          ? {
              attachments:
                content.attachments as unknown as import("@elizaos/core").Media[],
            }
          : {}),
      },
    };

    // Track usage and response
    let usage:
      | { inputTokens: number; outputTokens: number; model: string }
      | undefined;
    let responseText: string | undefined;
    let agentResponse: Memory | undefined;

      // Process message through event pipeline to generate response
      try {
        await runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
          runtime,
          message: userMessage,
          callback: async (result: {
            text?: string;
            usage?: {
              inputTokens: number;
              outputTokens: number;
              model: string;
            };
          }) => {
            elizaLogger.debug(
              "#Eliza",
              "Message processed, generating response",
            );
            if (result.text) {
              responseText = result.text;
            }
            if (result.usage) {
              usage = result.usage;
            }
            return [];
          },
        });
      } catch (error) {
        elizaLogger.error(
          "#Eliza",
          "Error during message processing:",
          error instanceof Error ? error.message : String(error),
        );

        // Check if it's an API key error
        if (error instanceof Error && error.message.includes("API key")) {
          responseText =
            "⚠️ Configuration error: ElizaCloud API key is missing or invalid. Please try logging out and back in.";
        } else {
          responseText =
            "I apologize, but I encountered an error processing your message. Please try again.";
        }
      }

      // Construct agent response memory object for return value
      // NOTE: The message is already created and saved by the plugin-assistant event handler
      // We only create this object for the return value, not to save it again
      if (responseText) {
        agentResponse = {
          id: uuidv4() as UUID,
          roomId: roomId as UUID,
          entityId: runtime.agentId as UUID,
          agentId: runtime.agentId as UUID,
          createdAt: Date.now(),
          content: {
            text: responseText,
            type: "agent",
          },
        };

        elizaLogger.debug(
          "#Eliza",
          "Agent response generated (already saved by plugin)",
        );
      } else {
        elizaLogger.warn(
          "#Eliza",
          "No response text generated from event pipeline",
        );
      }

        // Return agent response if available, otherwise fallback to user message
        // (This should rarely happen as we set error messages above)
        return { message: agentResponse || userMessage, usage };
      },
    ); // End of runWithContext - context automatically cleaned up
  }
}

// Export singleton instance
export const agentRuntime = AgentRuntimeManager.getInstance();
