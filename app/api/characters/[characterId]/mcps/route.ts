import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

// SECURITY FIX: Zod schemas for validation after JSON.parse
// Prevents malicious JSON with unexpected types or deeply nested structures

const McpServerConfigSchema = z.object({
  type: z.enum(["http", "sse", "streamable-http"]),
  url: z.string().url().max(2048), // Limit URL length
  timeout: z.number().int().min(0).max(300000).optional(), // Max 5 minutes
});

const McpSettingsSchema = z.object({
  servers: z.record(
    z.string().max(100), // Server ID max 100 chars
    McpServerConfigSchema
  ).refine(
    (servers) => Object.keys(servers).length <= 50, // Max 50 servers
    { message: "Maximum 50 MCP servers allowed" }
  ),
  maxRetries: z.number().int().min(0).max(10).optional(),
});

/**
 * MCP Server Configuration
 */
interface McpServerConfig {
  type: "http" | "sse" | "streamable-http";
  url: string;
  timeout?: number;
}

interface McpSettings {
  servers: Record<string, McpServerConfig>;
  maxRetries?: number;
}

/**
 * SECURITY: Safe JSON parsing with depth and size limits
 * Prevents DoS attacks from deeply nested or large JSON structures
 */
function safeJsonParse(jsonString: string, maxDepth: number = 10, maxSize: number = 100000): unknown {
  // Check size limit (100KB default)
  if (jsonString.length > maxSize) {
    throw new Error(`JSON string too large: ${jsonString.length} bytes (max: ${maxSize})`);
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`);
  }

  // Check depth limit
  function checkDepth(obj: unknown, currentDepth: number = 0): void {
    if (currentDepth > maxDepth) {
      throw new Error(`JSON structure too deep: exceeds ${maxDepth} levels`);
    }

    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj)) {
        for (const item of obj) {
          checkDepth(item, currentDepth + 1);
        }
      } else {
        for (const value of Object.values(obj)) {
          checkDepth(value, currentDepth + 1);
        }
      }
    }
  }

  checkDepth(parsed);
  return parsed;
}

/**
 * SECURITY: Parse and validate MCP settings
 * Combines safe parsing with Zod schema validation
 */
function parseMcpSettings(mcpSetting: unknown): McpSettings {
  let parsed: unknown;

  if (typeof mcpSetting === "string") {
    // Safe JSON parsing with limits
    parsed = safeJsonParse(mcpSetting, 10, 100000);
  } else if (typeof mcpSetting === "object" && mcpSetting !== null) {
    parsed = mcpSetting;
  } else {
    return { servers: {} };
  }

  // Validate with Zod schema
  const validationResult = McpSettingsSchema.safeParse(parsed);
  
  if (!validationResult.success) {
    throw new Error(
      `Invalid MCP settings structure: ${validationResult.error.issues.map(i => i.message).join(", ")}`
    );
  }

  return validationResult.data;
}

/**
 * GET /api/characters/[characterId]/mcps
 * Get current MCP configuration for a character
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ characterId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    const { characterId } = await ctx.params;

    // Get character
    const character = await charactersService.getById(characterId);

    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    // Check ownership
    if (
      character.user_id !== user.id &&
      character.organization_id !== user.organization_id
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Extract MCP settings from character settings
    const settings = character.settings || {};
    const mcpSetting = settings.mcp;

    let mcpSettings: McpSettings = { servers: {} };

    // SECURITY FIX: Use safe parsing with validation
    try {
      mcpSettings = parseMcpSettings(mcpSetting);
    } catch (error) {
      logger.warn(
        `[Characters/MCPs] Invalid MCP settings for character ${characterId}: ${error instanceof Error ? error.message : 'Parse error'}`,
      );
      // Return empty settings on validation failure
      mcpSettings = { servers: {} };
    }

    // Check if plugin-mcp is enabled
    const plugins = character.plugins || [];
    const pluginMcpEnabled = plugins.includes("@elizaos/plugin-mcp");

    return NextResponse.json({
      characterId,
      mcpSettings,
      pluginMcpEnabled,
      enabledServers: Object.keys(mcpSettings.servers || {}),
      serverCount: Object.keys(mcpSettings.servers || {}).length,
    });
  } catch (error) {
    logger.error("[Characters/MCPs] Error getting MCP config:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get MCP configuration",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/characters/[characterId]/mcps
 * Update MCP configuration for a character
 */
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ characterId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    const { characterId } = await ctx.params;
    const body = await request.json();

    // SECURITY FIX: Validate request body with Zod schema
    const requestSchema = z.object({
      mcpSettings: McpSettingsSchema,
      enablePlugin: z.boolean().optional().default(true),
    });

    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: validationResult.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const { mcpSettings, enablePlugin } = validationResult.data;

    // Get character
    const character = await charactersService.getById(characterId);

    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    // Check ownership
    if (
      character.user_id !== user.id &&
      character.organization_id !== user.organization_id
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Build new settings
    const currentSettings = character.settings || {};
    const newSettings = {
      ...currentSettings,
      mcp: mcpSettings,
    };

    // Handle plugins array
    let newPlugins = character.plugins || [];
    const hasServers = Object.keys(mcpSettings.servers || {}).length > 0;

    if (enablePlugin && hasServers) {
      // Add plugin-mcp if not present
      if (!newPlugins.includes("@elizaos/plugin-mcp")) {
        newPlugins = [...newPlugins, "@elizaos/plugin-mcp"];
      }
    } else if (!hasServers) {
      // Remove plugin-mcp if no servers configured
      newPlugins = newPlugins.filter((p) => p !== "@elizaos/plugin-mcp");
    }

    // Update character
    const updatedCharacter = await charactersService.update(characterId, {
      settings: newSettings,
      plugins: newPlugins,
    });

    logger.info(
      `[Characters/MCPs] Updated MCP config for character ${characterId}: ${Object.keys(mcpSettings.servers || {}).length} servers`,
    );

    return NextResponse.json({
      success: true,
      characterId,
      mcpSettings,
      pluginMcpEnabled: newPlugins.includes("@elizaos/plugin-mcp"),
      enabledServers: Object.keys(mcpSettings.servers || {}),
      serverCount: Object.keys(mcpSettings.servers || {}).length,
    });
  } catch (error) {
    logger.error("[Characters/MCPs] Error updating MCP config:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update MCP configuration",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/characters/[characterId]/mcps
 * Add a single MCP server to character configuration
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ characterId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    const { characterId } = await ctx.params;
    const body = await request.json();

    // SECURITY FIX: Validate request body with Zod schema
    const requestSchema = z.object({
      serverId: z.string().min(1).max(100),
      serverConfig: McpServerConfigSchema,
    });

    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: validationResult.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const { serverId, serverConfig } = validationResult.data;

    // Get character
    const character = await charactersService.getById(characterId);

    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    // Check ownership
    if (
      character.user_id !== user.id &&
      character.organization_id !== user.organization_id
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get current MCP settings
    const currentSettings = character.settings || {};
    const mcpSetting = currentSettings.mcp;

    let mcpSettings: McpSettings = { servers: {} };

    // SECURITY FIX: Use safe parsing with validation
    try {
      mcpSettings = parseMcpSettings(mcpSetting);
    } catch (error) {
      logger.warn(
        `[Characters/MCPs] Could not parse existing MCP settings for character ${characterId}, starting fresh: ${error instanceof Error ? error.message : 'Parse error'}`,
      );
      // Start fresh on validation failure
      mcpSettings = { servers: {} };
    }

    // Add the new server
    mcpSettings.servers = {
      ...mcpSettings.servers,
      [serverId]: serverConfig,
    };

    // Build new settings
    const newSettings = {
      ...currentSettings,
      mcp: mcpSettings,
    };

    // Ensure plugin-mcp is in plugins
    let newPlugins = character.plugins || [];
    if (!newPlugins.includes("@elizaos/plugin-mcp")) {
      newPlugins = [...newPlugins, "@elizaos/plugin-mcp"];
    }

    // Update character
    await charactersService.update(characterId, {
      settings: newSettings,
      plugins: newPlugins,
    });

    logger.info(
      `[Characters/MCPs] Added MCP server ${serverId} to character ${characterId}`,
    );

    return NextResponse.json({
      success: true,
      characterId,
      serverId,
      mcpSettings,
      enabledServers: Object.keys(mcpSettings.servers || {}),
    });
  } catch (error) {
    logger.error("[Characters/MCPs] Error adding MCP server:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to add MCP server",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/characters/[characterId]/mcps
 * Remove a MCP server from character configuration
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ characterId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    const { characterId } = await ctx.params;

    // Get serverId from query params
    const serverId = request.nextUrl.searchParams.get("serverId");

    if (!serverId) {
      return NextResponse.json(
        { error: "Missing serverId query parameter" },
        { status: 400 },
      );
    }

    // Get character
    const character = await charactersService.getById(characterId);

    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    // Check ownership
    if (
      character.user_id !== user.id &&
      character.organization_id !== user.organization_id
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get current MCP settings
    const currentSettings = character.settings || {};
    const mcpSetting = currentSettings.mcp;

    let mcpSettings: McpSettings = { servers: {} };

    // SECURITY FIX: Use safe parsing with validation
    try {
      mcpSettings = parseMcpSettings(mcpSetting);
    } catch (error) {
      logger.warn(
        `[Characters/MCPs] Could not parse MCP settings for character ${characterId} during deletion: ${error instanceof Error ? error.message : 'Parse error'}`,
      );
      // Nothing to delete if settings are invalid
      return NextResponse.json({
        success: true,
        message: "Server not found (invalid settings)",
      });
    }

    // Remove the server
    if (mcpSettings.servers && mcpSettings.servers[serverId]) {
      delete mcpSettings.servers[serverId];
    }

    // Build new settings
    const newSettings = {
      ...currentSettings,
      mcp: mcpSettings,
    };

    // Remove plugin-mcp if no servers left
    let newPlugins = character.plugins || [];
    if (Object.keys(mcpSettings.servers || {}).length === 0) {
      newPlugins = newPlugins.filter((p) => p !== "@elizaos/plugin-mcp");
    }

    // Update character
    await charactersService.update(characterId, {
      settings: newSettings,
      plugins: newPlugins,
    });

    logger.info(
      `[Characters/MCPs] Removed MCP server ${serverId} from character ${characterId}`,
    );

    return NextResponse.json({
      success: true,
      characterId,
      removedServerId: serverId,
      mcpSettings,
      enabledServers: Object.keys(mcpSettings.servers || {}),
    });
  } catch (error) {
    logger.error("[Characters/MCPs] Error removing MCP server:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to remove MCP server",
      },
      { status: 500 },
    );
  }
}
