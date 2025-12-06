import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { nanoid } from "nanoid";
import { db } from "@/db/client";
import { users } from "@/db/schemas";
import { anonymousSessionsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

const ANON_SESSION_COOKIE = "eliza-anon-session";
const ANON_SESSION_EXPIRY_DAYS = Number.parseInt(
  process.env.ANON_SESSION_EXPIRY_DAYS || "7",
  10,
);
const ANON_MESSAGE_LIMIT = Number.parseInt(
  process.env.ANON_MESSAGE_LIMIT || "5",
  10,
);

async function getClientIp(): Promise<string | undefined> {
  const headersList = await headers();
  const realIp = headersList.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  const forwardedFor = headersList
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwardedFor || undefined;
}

async function getUserAgent(): Promise<string | undefined> {
  const headersList = await headers();
  return headersList.get("user-agent") || undefined;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const returnUrl = searchParams.get("returnUrl") || "/";

    const newSessionToken = nanoid(32);
    const expiresAt = new Date(
      Date.now() + ANON_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );
    const ipAddress = await getClientIp();
    const userAgent = await getUserAgent();

    if (process.env.NODE_ENV === "production") {
      if (!ipAddress) {
        logger.warn(
          "[create-anonymous-session] Missing IP address in production - abuse detection bypassed",
        );
      } else {
        const isAbuse = await anonymousSessionsService.checkIpAbuse(ipAddress);
        if (isAbuse) {
          logger.warn("[create-anonymous-session] IP abuse detected", {
            ipAddress: ipAddress.slice(0, 8) + "...",
          });
          return NextResponse.redirect(
            new URL("/login?error=rate_limit", request.url),
          );
        }
      }
    }

    const [newUser] = await db
      .insert(users)
      .values({
        is_anonymous: true,
        anonymous_session_id: newSessionToken,
        organization_id: null,
        is_active: true,
        expires_at: expiresAt,
        role: "member",
      })
      .returning();

    const newSession = await anonymousSessionsService.create({
      session_token: newSessionToken,
      user_id: newUser.id,
      expires_at: expiresAt,
      ip_address: ipAddress,
      user_agent: userAgent,
      messages_limit: ANON_MESSAGE_LIMIT,
    });

    const cookieStore = await cookies();
    cookieStore.set(ANON_SESSION_COOKIE, newSessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: expiresAt,
    });

    logger.info("[create-anonymous-session] Created new anonymous session", {
      userId: newUser.id,
      sessionId: newSession.id,
      expiresAt,
    });

    return NextResponse.redirect(new URL(returnUrl, request.url));
  } catch (error) {
    logger.error("[create-anonymous-session] Error creating session:", error);
    return NextResponse.redirect(new URL("/login?error=session_error", request.url));
  }
}
