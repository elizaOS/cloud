/**
 * Connection Success Page
 *
 * Simple HTML page shown after a user completes an OAuth data integration
 * connection (Google, Microsoft, or X/Twitter) from a messaging platform.
 * Tells the user to return to their messaging platform and send a message.
 *
 * GET /api/eliza-app/auth/connection-success?platform={discord|telegram|imessage|web}
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PLATFORM_MESSAGES: Record<string, { label: string; instruction: string }> = {
  discord: {
    label: "Discord",
    instruction: "head back to Discord and send me a message.",
  },
  telegram: {
    label: "Telegram",
    instruction: "head back to Telegram and send me a message.",
  },
  imessage: {
    label: "iMessage",
    instruction: "head back to iMessage and send me a message.",
  },
  web: {
    label: "web chat",
    instruction: "close this tab — your chat is ready.",
  },
};

function buildHtml(platform: string): string {
  const info = PLATFORM_MESSAGES[platform] || PLATFORM_MESSAGES.web;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>connected — eliza</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .card {
      max-width: 420px;
      text-align: center;
    }
    .check {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #FF580020;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
    }
    .check svg { width: 32px; height: 32px; color: #FF5800; }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: #fff;
    }
    p {
      font-size: 1rem;
      line-height: 1.6;
      color: #a3a3a3;
    }
    .platform { color: #FF5800; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </div>
    <h1>you're connected.</h1>
    <p>${info.instruction}</p>
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get("platform") || "web";

  if (platform === "web") {
    return NextResponse.redirect(new URL("/dashboard/chat", request.url));
  }

  return new NextResponse(buildHtml(platform), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
