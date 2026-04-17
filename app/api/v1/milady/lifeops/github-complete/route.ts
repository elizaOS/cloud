import { NextRequest, NextResponse } from "next/server";
import { createLifeOpsGithubReturnResponse } from "@/lib/services/milady-github-return";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://www.elizacloud.ai";
  const githubConnected = request.nextUrl.searchParams.get("github_connected");
  const githubError = request.nextUrl.searchParams.get("github_error");
  const connectionId = request.nextUrl.searchParams.get("connection_id");
  const rawTarget = request.nextUrl.searchParams.get("target");
  const agentId = request.nextUrl.searchParams.get("agent_id");
  const postMessage = request.nextUrl.searchParams.get("post_message") === "1";
  const returnUrl = request.nextUrl.searchParams.get("return_url");
  const target = rawTarget === "agent" && agentId ? "agent" : "owner";
  const dashboardUrl = `${baseUrl}/dashboard/settings?tab=${target === "agent" ? "agents" : "connections"}`;

  if (githubError) {
    if (postMessage || returnUrl) {
      return createLifeOpsGithubReturnResponse({
        title:
          target === "agent"
            ? "Agent GitHub setup did not complete"
            : "LifeOps GitHub setup did not complete",
        message: githubError,
        detail: {
          target,
          status: "error",
          connectionId,
          agentId,
          message: githubError,
        },
        postMessage,
        returnUrl,
      });
    }
    return NextResponse.redirect(
      `${dashboardUrl}&github_error=${encodeURIComponent(githubError)}`,
    );
  }

  if (githubConnected !== "true" || !connectionId) {
    const message = "GitHub setup did not complete.";
    if (postMessage || returnUrl) {
      return createLifeOpsGithubReturnResponse({
        title:
          target === "agent"
            ? "Agent GitHub setup did not complete"
            : "LifeOps GitHub setup did not complete",
        message,
        detail: {
          target,
          status: "error",
          connectionId,
          agentId,
          message,
        },
        postMessage,
        returnUrl,
      });
    }
    return NextResponse.redirect(
      `${dashboardUrl}&github_error=${encodeURIComponent(message)}`,
    );
  }

  if (postMessage || returnUrl) {
    return createLifeOpsGithubReturnResponse({
      title:
        target === "agent"
          ? "Agent GitHub connected"
          : "LifeOps GitHub connected",
      message:
        target === "agent"
          ? "GitHub is connected and ready to link to this agent."
          : "GitHub is connected for LifeOps.",
      detail: {
        target,
        status: "connected",
        connectionId,
        agentId,
      },
      postMessage,
      returnUrl,
    });
  }

  return NextResponse.redirect(
    `${dashboardUrl}&github_connected=true&platform=github&connection_id=${encodeURIComponent(
      connectionId,
    )}`,
  );
}
