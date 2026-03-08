import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PLATFORM_MESSAGES: Record<string, string> = {
  discord: "head back to Discord and send me a message.",
  telegram: "head back to Telegram and send me a message.",
  imessage: "head back to iMessage and send me a message.",
  web: "close this tab. your chat is ready.",
};

function buildHtml(platform: string): string {
  const instruction = PLATFORM_MESSAGES[platform] ?? PLATFORM_MESSAGES.web;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>connected</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #0d0d0d;
      color: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card {
      width: min(420px, 100%);
      text-align: center;
    }
    .check {
      width: 64px;
      height: 64px;
      border-radius: 999px;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 88, 0, 0.15);
      color: #ff5800;
      font-size: 32px;
      line-height: 1;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 28px;
      font-weight: 600;
    }
    p {
      margin: 0;
      color: #b5b5b5;
      line-height: 1.6;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>you're connected.</h1>
    <p>${instruction}</p>
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
