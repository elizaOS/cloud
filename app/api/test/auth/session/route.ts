import { NextRequest, NextResponse } from "next/server";
import {
  createPlaywrightTestSessionToken,
  PLAYWRIGHT_TEST_SESSION_COOKIE_NAME,
} from "@/lib/auth/playwright-test-session";
import { apiKeysService } from "@/lib/services/api-keys";
import { usersService } from "@/lib/services/users";

function isEnabled(): boolean {
  return process.env.PLAYWRIGHT_TEST_AUTH === "true";
}

function getApiKeyFromRequest(request: NextRequest): string | null {
  const apiKeyHeader = request.headers.get("x-api-key")?.trim();
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  const authHeader = request.headers.get("authorization")?.trim();
  if (authHeader?.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    return bearerToken || null;
  }

  return null;
}

export async function POST(request: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const apiKeyValue = getApiKeyFromRequest(request);
  if (!apiKeyValue) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }

  const apiKey = await apiKeysService.validateApiKey(apiKeyValue);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  if (!apiKey.is_active) {
    return NextResponse.json({ error: "API key is inactive" }, { status: 403 });
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return NextResponse.json({ error: "API key has expired" }, { status: 401 });
  }

  const user = await usersService.getWithOrganization(apiKey.user_id);
  if (!user || !user.organization_id || !user.organization) {
    return NextResponse.json(
      { error: "User organization not found" },
      { status: 403 },
    );
  }

  if (!user.is_active || !user.organization.is_active) {
    return NextResponse.json(
      { error: "User or organization is inactive" },
      { status: 403 },
    );
  }

  const token = createPlaywrightTestSessionToken(user.id, user.organization_id);
  const response = NextResponse.json(
    {
      token,
      cookieName: PLAYWRIGHT_TEST_SESSION_COOKIE_NAME,
      user: {
        id: user.id,
        organizationId: user.organization_id,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );

  response.cookies.set({
    name: PLAYWRIGHT_TEST_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60,
  });

  return response;
}
