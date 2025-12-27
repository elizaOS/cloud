/**
 * Credentials MCP SSE Endpoint
 *
 * Exposes secure credential management via Streamable HTTP MCP protocol.
 * Supports text secrets (API keys) and OAuth platform connections.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  platformCredentialsService,
  OAUTH_CONFIGS,
} from "@/lib/services/platform-credentials";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

const AUDIT: AuditContext = {
  actorType: "system",
  actorId: "credentials-mcp",
  source: "mcp",
};

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS = [
  {
    name: "store_secret",
    description:
      "Store a text secret (API key, token, password). Secrets are encrypted at rest.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Secret name (e.g., OPENAI_API_KEY)",
        },
        value: { type: "string", description: "Secret value" },
        description: { type: "string", description: "Optional description" },
      },
      required: ["name", "value"],
    },
  },
  {
    name: "get_secret",
    description: "Retrieve a stored secret by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Secret name" },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_secret",
    description: "Delete a stored secret.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Secret name to delete" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_secrets",
    description: "List all stored secrets (names only, not values).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "request_oauth",
    description:
      "Request OAuth authorization for a platform. Returns a URL to send to the user.",
    inputSchema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: ["discord", "twitter", "google", "gmail", "github", "slack"],
          description: "Platform to connect",
        },
        scopes: {
          type: "array",
          items: { type: "string" },
          description: "Optional OAuth scopes",
        },
      },
      required: ["platform"],
    },
  },
  {
    name: "get_credential",
    description: "Check if a platform is connected and get credential info.",
    inputSchema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: ["discord", "twitter", "google", "gmail", "github", "slack"],
          description: "Platform",
        },
      },
      required: ["platform"],
    },
  },
  {
    name: "get_platform_token",
    description:
      "Get the access token for a connected platform. Auto-refreshes if expired.",
    inputSchema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: ["discord", "twitter", "google", "gmail", "github", "slack"],
          description: "Platform",
        },
      },
      required: ["platform"],
    },
  },
  {
    name: "revoke_credential",
    description: "Disconnect a platform and revoke its credentials.",
    inputSchema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: ["discord", "twitter", "google", "gmail", "github", "slack"],
          description: "Platform",
        },
      },
      required: ["platform"],
    },
  },
  {
    name: "list_credentials",
    description: "List all connected platform credentials.",
    inputSchema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: ["discord", "twitter", "google", "gmail", "github", "slack"],
          description: "Filter by platform",
        },
      },
    },
  },
];

// =============================================================================
// TOOL HANDLERS
// =============================================================================

async function handleTool(
  name: string,
  args: Record<string, unknown>,
  orgId: string,
  userId: string,
) {
  switch (name) {
    case "store_secret": {
      const {
        name: secretName,
        value,
        description,
      } = args as { name: string; value: string; description?: string };
      const secret = await secretsService.create(
        {
          organizationId: orgId,
          name: secretName,
          value,
          description,
          scope: "organization",
          createdBy: userId,
        },
        AUDIT,
      );
      return { success: true, secretId: secret.id, name: secret.name };
    }

    case "get_secret": {
      const { name: secretName } = args as { name: string };
      const value = await secretsService.get(orgId, secretName);
      return value
        ? { found: true, name: secretName, value }
        : { found: false, name: secretName };
    }

    case "delete_secret": {
      const { name: secretName } = args as { name: string };
      const secrets = await secretsService.list(orgId);
      const secret = secrets.find((s) => s.name === secretName);
      if (!secret) return { success: false, error: "Not found" };
      await secretsService.delete(secret.id, orgId, AUDIT);
      return { success: true };
    }

    case "list_secrets": {
      const secrets = await secretsService.list(orgId);
      return {
        secrets: secrets.map((s) => ({
          name: s.name,
          description: s.description,
          createdAt: s.createdAt.toISOString(),
        })),
      };
    }

    case "request_oauth": {
      const { platform, scopes } = args as {
        platform: string;
        scopes?: string[];
      };
      const result = await platformCredentialsService.createLinkSession({
        organizationId: orgId,
        platform: platform as "discord",
        requestingUserId: userId,
        requestedScopes: scopes,
      });
      const cloudUrl =
        process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
      return {
        sessionId: result.sessionId,
        authUrl: result.linkUrl,
        hostedUrl: `${cloudUrl}/auth/platform-link?session=${result.sessionId}`,
        expiresAt: result.expiresAt.toISOString(),
        instructions: `Direct user to: ${cloudUrl}/auth/platform-link?session=${result.sessionId}`,
      };
    }

    case "get_credential": {
      const { platform } = args as { platform: string };
      const creds = await platformCredentialsService.listCredentials(orgId, {
        platform: platform as "discord",
        status: "active",
      });
      const cred = creds[0];
      if (!cred) return { connected: false, platform };
      return {
        connected: true,
        platform: cred.platform,
        platformUserId: cred.platform_user_id,
        platformUsername: cred.platform_username,
        status: cred.status,
        linkedAt: cred.linked_at?.toISOString(),
      };
    }

    case "get_platform_token": {
      const { platform } = args as { platform: string };
      const creds = await platformCredentialsService.listCredentials(orgId, {
        platform: platform as "discord",
        status: "active",
      });
      const cred = creds[0];
      if (!cred) return { error: `${platform} not connected` };

      const result = await platformCredentialsService.getCredentialWithTokens(
        cred.id,
        orgId,
      );
      if (!result) return { error: "Failed to retrieve tokens" };

      if (
        result.credential.token_expires_at &&
        result.credential.token_expires_at < new Date()
      ) {
        const refreshed = await platformCredentialsService.refreshToken(
          cred.id,
          orgId,
        );
        if (!refreshed) return { error: "Token expired and refresh failed" };
        const fresh = await platformCredentialsService.getCredentialWithTokens(
          cred.id,
          orgId,
        );
        if (!fresh) return { error: "Failed to get refreshed token" };
        return {
          platform,
          accessToken: fresh.accessToken,
          refreshToken: fresh.refreshToken,
          refreshed: true,
        };
      }
      return {
        platform,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        refreshed: false,
      };
    }

    case "revoke_credential": {
      const { platform } = args as { platform: string };
      const creds = await platformCredentialsService.listCredentials(orgId, {
        platform: platform as "discord",
        status: "active",
      });
      const cred = creds[0];
      if (!cred) return { success: false, error: `${platform} not connected` };
      await platformCredentialsService.revokeCredential(cred.id, orgId);
      return { success: true };
    }

    case "list_credentials": {
      const { platform } = args as { platform?: string };
      const creds = await platformCredentialsService.listCredentials(orgId, {
        platform: platform as "discord" | undefined,
        status: "active",
      });
      return {
        credentials: creds.map((c) => ({
          platform: c.platform,
          platformUserId: c.platform_user_id,
          platformUsername: c.platform_username,
          status: c.status,
          linkedAt: c.linked_at?.toISOString(),
        })),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// =============================================================================
// HTTP HANDLERS
// =============================================================================

export async function GET(request: NextRequest) {
  return NextResponse.json({
    name: "credentials",
    version: "1.0.0",
    description:
      "Secure credential management. Store secrets and connect OAuth platforms.",
    tools: TOOLS,
    resources: [
      {
        uri: "credentials://secrets",
        name: "Stored Secrets",
        mimeType: "application/json",
      },
      {
        uri: "credentials://platforms",
        name: "Connected Platforms",
        mimeType: "application/json",
      },
      {
        uri: "credentials://platforms/available",
        name: "Available Platforms",
        mimeType: "application/json",
      },
    ],
  });
}

export async function POST(request: NextRequest) {
  const user = await requireAuthOrApiKey(request);
  if (!user.organization_id)
    return NextResponse.json(
      { error: "Organization required" },
      { status: 403 },
    );

  const body = await request.json();
  const { method, params } = body;

  if (method === "initialize") {
    return NextResponse.json({
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
      },
      serverInfo: { name: "credentials", version: "1.0.0" },
    });
  }

  if (method === "tools/list") {
    return NextResponse.json({ tools: TOOLS });
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params;
    logger.info("[Credentials MCP] Tool call", {
      tool: name,
      orgId: user.organization_id,
    });
    const result = await handleTool(
      name,
      args || {},
      user.organization_id,
      user.id,
    );
    return NextResponse.json({
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    });
  }

  if (method === "resources/list") {
    return NextResponse.json({
      resources: [
        {
          uri: "credentials://secrets",
          name: "Stored Secrets",
          mimeType: "application/json",
        },
        {
          uri: "credentials://platforms",
          name: "Connected Platforms",
          mimeType: "application/json",
        },
        {
          uri: "credentials://platforms/available",
          name: "Available Platforms",
          mimeType: "application/json",
        },
      ],
    });
  }

  if (method === "resources/read") {
    const { uri } = params;
    if (uri === "credentials://secrets") {
      const secrets = await secretsService.list(user.organization_id);
      return NextResponse.json({
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({
              secrets: secrets.map((s) => ({
                name: s.name,
                description: s.description,
              })),
            }),
          },
        ],
      });
    }
    if (uri === "credentials://platforms") {
      const creds = await platformCredentialsService.listCredentials(
        user.organization_id,
        { status: "active" },
      );
      return NextResponse.json({
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({
              platforms: creds.map((c) => ({
                platform: c.platform,
                username: c.platform_username,
              })),
            }),
          },
        ],
      });
    }
    if (uri === "credentials://platforms/available") {
      return NextResponse.json({
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({ platforms: Object.keys(OAUTH_CONFIGS) }),
          },
        ],
      });
    }
    return NextResponse.json(
      { error: { code: -32602, message: "Unknown resource" } },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { error: { code: -32601, message: "Method not found" } },
    { status: 400 },
  );
}
