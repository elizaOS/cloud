import { NextRequest, NextResponse } from "next/server";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { readManagedMiladyGithubBinding } from "@/lib/services/milady-agent-config";
import { createLifeOpsGithubReturnResponse } from "@/lib/services/milady-github-return";
import { managedMiladyGithubService } from "@/lib/services/milady-managed-github";
import { oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * GitHub OAuth completion endpoint for managed agent flows.
 *
 * The generic OAuth callback redirects here after storing the GitHub
 * credential. This endpoint reads context from query params (set during
 * initiation), links the connection to the agent, then redirects to
 * the dashboard.
 *
 * Security: This endpoint runs as a browser redirect, not an API call,
 * so it cannot use requireAuthOrApiKeyWithOrg. Security is provided by:
 * 1. The connection_id was created by the generic callback after
 *    validating a cryptographically random, time-limited state token
 * 2. The org_id and user_id were embedded in the redirect URL by the
 *    authenticated initiation endpoint
 * 3. The agent is validated against the org_id before linking
 * 4. The connection is validated against the org_id before reading
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.elizacloud.ai";
  const dashboardUrl = `${baseUrl}/dashboard/settings?tab=agents`;

  const agentId = request.nextUrl.searchParams.get("agent_id");
  const organizationId = request.nextUrl.searchParams.get("org_id");
  const userId = request.nextUrl.searchParams.get("user_id");
  const connectionId = request.nextUrl.searchParams.get("connection_id");
  const githubConnected = request.nextUrl.searchParams.get("github_connected");
  const githubError = request.nextUrl.searchParams.get("github_error");
  const postMessage = request.nextUrl.searchParams.get("post_message") === "1";
  const returnUrl = request.nextUrl.searchParams.get("return_url");

  const respond = (args: {
    status: "connected" | "error";
    githubUsername?: string | null;
    message?: string | null;
    restarted?: boolean;
    bindingMode?: "cloud-managed" | "shared-owner" | null;
  }): NextResponse => {
    if (postMessage || returnUrl) {
      return createLifeOpsGithubReturnResponse({
        title:
          args.status === "connected"
            ? "Agent GitHub connected"
            : "Agent GitHub setup did not complete",
        message:
          args.status === "connected"
            ? args.restarted
              ? "GitHub is linked to this agent and the cloud runtime is restarting."
              : "GitHub is linked to this agent."
            : args.message || "GitHub setup did not complete.",
        detail: {
          target: "agent",
          status: args.status,
          agentId,
          connectionId,
          githubUsername: args.githubUsername ?? null,
          bindingMode: args.bindingMode ?? null,
          message: args.message ?? null,
          restarted: args.restarted === true,
        },
        postMessage,
        returnUrl,
      });
    }
    if (args.status === "connected") {
      const successParams = [
        "github=connected",
        "managed=1",
        `agentId=${encodeURIComponent(agentId ?? "")}`,
        `githubUsername=${encodeURIComponent(args.githubUsername || "")}`,
        `restarted=${args.restarted ? "1" : "0"}`,
      ].join("&");
      return NextResponse.redirect(`${dashboardUrl}&${successParams}`);
    }
    return NextResponse.redirect(
      `${dashboardUrl}&github_error=${encodeURIComponent(
        args.message || "GitHub setup did not complete.",
      )}`,
    );
  };

  // Handle OAuth errors from the generic callback
  if (githubError) {
    logger.warn("[managed-github] OAuth callback returned error", {
      error: githubError,
      agentId,
    });
    return respond({
      status: "error",
      message: githubError,
    });
  }

  if (!agentId || !organizationId || !userId || !connectionId || githubConnected !== "true") {
    logger.warn("[managed-github] OAuth completion missing required params", {
      hasAgentId: !!agentId,
      hasOrgId: !!organizationId,
      hasUserId: !!userId,
      hasConnectionId: !!connectionId,
      githubConnected,
    });
    return respond({
      status: "error",
      message: "Missing parameters for GitHub linking",
    });
  }

  try {
    // Validate agent belongs to the org that initiated the OAuth flow
    const sandbox = await miladySandboxesRepository.findByIdAndOrg(agentId, organizationId);
    if (!sandbox) {
      logger.error("[managed-github] Agent not found or org mismatch", {
        agentId,
        organizationId,
      });
      return respond({
        status: "error",
        message: "Agent not found",
      });
    }

    // Idempotency: if agent already has this connection linked, skip re-linking
    const existingBinding = readManagedMiladyGithubBinding(
      (sandbox.agent_config as Record<string, unknown> | null) ?? {},
    );
    if (existingBinding?.connectionId === connectionId) {
      logger.info("[managed-github] Connection already linked, skipping", {
        agentId,
        connectionId,
      });
      return respond({
        status: "connected",
        githubUsername: existingBinding.githubUsername || null,
        bindingMode: existingBinding.mode,
        restarted: false,
      });
    }

    // Look up the OAuth connection to get GitHub user info
    const connection = await oauthService.getConnection({
      organizationId,
      connectionId,
    });

    if (!connection) {
      logger.error("[managed-github] Connection not found after OAuth", {
        connectionId,
        agentId,
        organizationId,
      });
      return respond({
        status: "error",
        message: "GitHub connection not found",
      });
    }

    // Link the connection to the agent
    const result = await managedMiladyGithubService.connectAgent({
      agentId,
      organizationId,
      binding: {
        mode: "cloud-managed",
        connectionId,
        connectionRole: "agent",
        source: connection.source,
        githubUserId: connection.platformUserId || "",
        githubUsername: connection.username || "",
        githubDisplayName: connection.displayName || undefined,
        githubAvatarUrl: connection.avatarUrl || undefined,
        githubEmail: connection.email || undefined,
        scopes: connection.scopes || [],
        adminElizaUserId: userId,
        connectedAt: new Date().toISOString(),
      },
    });

    logger.info("[managed-github] Auto-linked GitHub to agent after OAuth", {
      agentId,
      connectionId,
      githubUsername: connection.username,
      restarted: result.restarted,
    });

    return respond({
      status: "connected",
      githubUsername: connection.username || null,
      bindingMode: "cloud-managed",
      restarted: result.restarted,
    });
  } catch (error) {
    logger.error("[managed-github] Failed to auto-link GitHub after OAuth", {
      agentId,
      connectionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return respond({
      status: "error",
      message:
        error instanceof Error ? error.message : "Failed to link GitHub to agent",
    });
  }
}
