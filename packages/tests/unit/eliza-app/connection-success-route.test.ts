import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import { GET as connectionSuccessGet } from "@/app/api/eliza-app/auth/connection-success/route";

describe("connection success route", () => {
  test("redirects web connections back to dashboard chat", async () => {
    const response = await connectionSuccessGet(
      new NextRequest("https://elizacloud.ai/api/eliza-app/auth/connection-success?platform=web"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://elizacloud.ai/dashboard/chat");
  });

  test("renders a platform-specific success page for messaging channels", async () => {
    const response = await connectionSuccessGet(
      new NextRequest(
        "https://elizacloud.ai/api/eliza-app/auth/connection-success?platform=telegram",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const body = await response.text();
    expect(body).toContain("you're connected.");
    expect(body).toContain("head back to Telegram and send me a message.");
  });

  test("renders popup-safe success page for Eliza App OAuth completions", async () => {
    const response = await connectionSuccessGet(
      new NextRequest(
        "https://elizacloud.ai/api/eliza-app/auth/connection-success?source=eliza-app&platform=google&connection_id=conn-123",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const body = await response.text();
    expect(body).toContain("Google connected.");
    expect(body).toContain("eliza-app-oauth-complete");
    expect(body).toContain("conn-123");
  });
});
