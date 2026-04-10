import { NextRequest, NextResponse } from "next/server";
import { createLifeOpsGithubReturnResponse } from "@/lib/services/milady-github-return";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.elizacloud.ai";
  const dashboardUrl = `${baseUrl}/dashboard/settings?tab=connections`;
  const githubConnected = request.nextUrl.searchParams.get("github_connected");
  const githubError = request.nextUrl.searchParams.get("github_error");
  const connectionId = request.nextUrl.searchParams.get("connection_id");
  const postMessage = request.nextUrl.searchParams.get("post_message") === "1";
  const returnUrl = request.nextUrl.searchParams.get("return_url");

  if (githubError) {
    if (postMessage || returnUrl) {
      return createLifeOpsGithubReturnResponse({
        title: "LifeOps GitHub setup did not complete",
        message: githubError,
        detail: {
          target: "owner",
          status: "error",
          connectionId,
          message: githubError,
        },
        postMessage,
        returnUrl,
      });
    }
    return NextResponse.redirect(`${dashboardUrl}&github_error=${encodeURIComponent(githubError)}`);
  }

  if (githubConnected !== "true" || !connectionId) {
    const message = "GitHub setup did not complete.";
    if (postMessage || returnUrl) {
      return createLifeOpsGithubReturnResponse({
        title: "LifeOps GitHub setup did not complete",
        message,
        detail: {
          target: "owner",
          status: "error",
          connectionId,
          message,
        },
        postMessage,
        returnUrl,
      });
    }
    return NextResponse.redirect(`${dashboardUrl}&github_error=${encodeURIComponent(message)}`);
  }

  if (postMessage || returnUrl) {
    return createLifeOpsGithubReturnResponse({
      title: "LifeOps GitHub connected",
      message: "GitHub is connected for LifeOps.",
      detail: {
        target: "owner",
        status: "connected",
        connectionId,
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
