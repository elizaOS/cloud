import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

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
 * GET /api/characters/[characterId]/mcps
 * Get current MCP configuration for a character
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ characterId: string }> }
) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    const { characterId } = await ctx.params;

    // Get character
    const character = await charactersService.getById(characterId);

    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    // Check ownership
    if (character.user_id !== user.id && character.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Extract MCP settings from character settings
    const settings = character.settings || {};
    const mcpSetting = settings.mcp;

    let mcpSettings: McpSettings = { servers: {} };
    
    if (typeof mcpSetting === "string") {
      try {
        mcpSettings = JSON.parse(mcpSetting);
      } catch {
        logger.warn(`[Characters/MCPs] Invalid MCP settings JSON for character ${characterId}`);
      }
    } else if (typeof mcpSetting === "object" && mcpSetting !== null) {
      mcpSettings = mcpSetting as unknown as McpSettings;
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
      { error: error instanceof Error ? error.message : "Failed to get MCP configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/characters/[characterId]/mcps
 * Update MCP configuration for a character
 */
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ characterId: string }> }
) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    const { characterId } = await ctx.params;
    const body = await request.json();

    // Validate request body
    const { mcpSettings, enablePlugin = true } = body as {
      mcpSettings: McpSettings;
      enablePlugin?: boolean;
    };

    if (!mcpSettings || typeof mcpSettings !== "object") {
      return NextResponse.json(
        { error: "Invalid mcpSettings" },
        { status: 400 }
      );
    }

    // Get character
    const character = await charactersService.getById(characterId);

    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    // Check ownership
    if (character.user_id !== user.id && character.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
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
      `[Characters/MCPs] Updated MCP config for character ${characterId}: ${Object.keys(mcpSettings.servers || {}).length} servers`
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
      { error: error instanceof Error ? error.message : "Failed to update MCP configuration" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/characters/[characterId]/mcps
 * Add a single MCP server to character configuration
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ characterId: string }> }
) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    const { characterId } = await ctx.params;
    const body = await request.json();

    // Validate request body
    const { serverId, serverConfig } = body as {
      serverId: string;
      serverConfig: McpServerConfig;
    };

    if (!serverId || !serverConfig) {
      return NextResponse.json(
        { error: "Missing serverId or serverConfig" },
        { status: 400 }
      );
    }

    if (!serverConfig.type || !serverConfig.url) {
      return NextResponse.json(
        { error: "Server config must have type and url" },
        { status: 400 }
      );
    }

    // Get character
    const character = await charactersService.getById(characterId);

    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    // Check ownership
    if (character.user_id !== user.id && character.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Get current MCP settings
    const currentSettings = character.settings || {};
    const mcpSetting = currentSettings.mcp;

    let mcpSettings: McpSettings = { servers: {} };
    
    if (typeof mcpSetting === "string") {
      try {
        mcpSettings = JSON.parse(mcpSetting);
      } catch {
        // Start fresh
      }
    } else if (typeof mcpSetting === "object" && mcpSetting !== null) {
      mcpSettings = mcpSetting as unknown as McpSettings;
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
      `[Characters/MCPs] Added MCP server ${serverId} to character ${characterId}`
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
      { error: error instanceof Error ? error.message : "Failed to add MCP server" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/characters/[characterId]/mcps
 * Remove a MCP server from character configuration
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ characterId: string }> }
) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    const { characterId } = await ctx.params;
    
    // Get serverId from query params
    const serverId = request.nextUrl.searchParams.get("serverId");

    if (!serverId) {
      return NextResponse.json(
        { error: "Missing serverId query parameter" },
        { status: 400 }
      );
    }

    // Get character
    const character = await charactersService.getById(characterId);

    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    // Check ownership
    if (character.user_id !== user.id && character.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Get current MCP settings
    const currentSettings = character.settings || {};
    const mcpSetting = currentSettings.mcp;

    let mcpSettings: McpSettings = { servers: {} };
    
    if (typeof mcpSetting === "string") {
      try {
        mcpSettings = JSON.parse(mcpSetting);
      } catch {
        // Nothing to delete
        return NextResponse.json({
          success: true,
          message: "Server not found",
        });
      }
    } else if (typeof mcpSetting === "object" && mcpSetting !== null) {
      mcpSettings = mcpSetting as unknown as McpSettings;
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
      `[Characters/MCPs] Removed MCP server ${serverId} from character ${characterId}`
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
      { error: error instanceof Error ? error.message : "Failed to remove MCP server" },
      { status: 500 }
    );
  }
}

