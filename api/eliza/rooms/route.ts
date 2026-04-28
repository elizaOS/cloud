/**
 * /api/eliza/rooms
 *
 * GET: lists rooms for the authed or anonymous user (sorted by most recent).
 * POST: creates a minimal room record. Full setup (worldId, serverId,
 * entities, participants) happens lazily when the first message is sent.
 *
 * Anonymous users are resolved from the `eliza-anon-session` cookie (or the
 * `X-Anonymous-Session` header / body field on POST). For POST, if neither is
 * present a new anonymous user + session pair is minted. We do NOT mint a
 * session on GET — empty rooms list is the expected response.
 */

import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { v4 as uuidv4 } from "uuid";

import { agentsService } from "@/lib/services/agents/agents";
import { roomsService } from "@/lib/services/agents/rooms";
import { createAnonymousUserAndSession } from "@/lib/services/anonymous-session-creator";
import { anonymousSessionsService } from "@/lib/services/anonymous-sessions";
import { charactersService } from "@/lib/services/characters/characters";
import { usersService } from "@/lib/services/users";
import { logger } from "@/lib/utils/logger";
import { requireUserOrApiKey } from "@/api-lib/auth";
import type { AppContext, AppEnv } from "@/api-lib/context";

const DEFAULT_AGENT_ID = "b850bc30-45f8-0041-a00a-83df46d8555d";
const ANON_SESSION_COOKIE = "eliza-anon-session";

async function resolveAnonymousUserId(
  c: AppContext,
  providedToken?: string,
): Promise<string | null> {
  const tokenFromCookie = getCookie(c, ANON_SESSION_COOKIE);
  const token = providedToken || tokenFromCookie;
  if (!token) return null;
  const session = await anonymousSessionsService.getByToken(token);
  if (!session) return null;
  const user = await usersService.getById(session.user_id);
  if (!user || !user.is_anonymous) return null;
  return user.id;
}

async function createAnonymousSession(c: AppContext): Promise<string> {
  const expiryDays = Number.parseInt(c.env.ANON_SESSION_EXPIRY_DAYS || "7", 10);
  const messagesLimit = Number.parseInt(c.env.ANON_MESSAGE_LIMIT || "5", 10);
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  const sessionToken = uuidv4().replace(/-/g, "");

  const ipAddress =
    c.req.header("x-real-ip")?.trim() ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined;
  const userAgent = c.req.header("user-agent") || undefined;

  const { newUser } = await createAnonymousUserAndSession({
    sessionToken,
    expiresAt,
    ipAddress,
    userAgent,
    messagesLimit,
  });

  setCookie(c, ANON_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: c.env.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
    expires: expiresAt,
  });

  return newUser.id;
}

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  let userId: string;
  try {
    const user = await requireUserOrApiKey(c);
    userId = user.id;
    logger.debug("[Eliza Rooms API GET] Authenticated user:", userId);
  } catch {
    const anonUserId = await resolveAnonymousUserId(c);
    if (!anonUserId) {
      return c.json({ success: true, rooms: [] });
    }
    userId = anonUserId;
    logger.debug("[Eliza Rooms API GET] Anonymous user:", userId);
  }

  const includeBuildRooms = c.req.query("includeBuildRooms") === "true";
  const rooms = await roomsService.getRoomsForEntity(userId, { includeBuildRooms });
  return c.json({ success: true, rooms });
});

app.post("/", async (c) => {
  let body: { characterId?: string; sessionToken?: string; name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const { characterId, sessionToken: bodySessionToken, name: roomName } = body;

  const headerSessionToken = c.req.header("X-Anonymous-Session") || undefined;
  const providedSessionToken = headerSessionToken || bodySessionToken;

  let userId: string | undefined;
  try {
    const user = await requireUserOrApiKey(c);
    userId = user.id;
    logger.info("[Eliza Rooms API POST] Authenticated user:", userId);
  } catch (authError) {
    logger.info(
      "[Eliza Rooms API POST] Auth failed, trying anonymous...",
      authError instanceof Error ? authError.message : "Unknown error",
    );

    userId = (await resolveAnonymousUserId(c, providedSessionToken)) ?? undefined;
    if (!userId) {
      try {
        userId = await createAnonymousSession(c);
        logger.info("[Eliza Rooms API POST] Created new anonymous session:", userId);
      } catch (error) {
        logger.warn("[Eliza Rooms API POST] Anonymous fallback unavailable", {
          error: error instanceof Error ? error.message : String(error),
        });
        return c.json({ error: "Authentication required" }, 401);
      }
    }
  }

  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  logger.info(
    "[Eliza Rooms API POST] Creating room for user:",
    userId,
    "| characterId:",
    characterId || "default",
  );

  if (characterId && typeof characterId !== "string") {
    return c.json({ error: "characterId must be a string" }, 400);
  }

  if (characterId && characterId !== DEFAULT_AGENT_ID) {
    const character = await charactersService.getById(characterId);
    if (!character) {
      logger.warn("[Eliza Rooms API POST] Character not found:", characterId);
      return c.json({ error: "Character not found" }, 404);
    }

    const isOwner = character.user_id === userId;
    const isPublic = character.is_public === true;
    const claimCheck = await charactersService.isClaimableAffiliateCharacter(characterId);
    const isClaimableAffiliate = claimCheck.claimable;

    if (!isPublic && !isOwner && !isClaimableAffiliate) {
      logger.warn("[Eliza Rooms API POST] Access denied to private character:", {
        characterId,
        userId,
        characterOwnerId: character.user_id,
        isPublic: character.is_public,
      });
      return c.json({ error: "Access denied - this character is private" }, 403);
    }

    logger.info("[Eliza Rooms API POST] Access granted to character:", characterId, {
      isPublic,
      isOwner,
      isClaimableAffiliate,
    });
  }

  const agentId = characterId || DEFAULT_AGENT_ID;
  if (!characterId || characterId === DEFAULT_AGENT_ID) {
    await agentsService.ensureDefaultAgentExists();
  } else {
    await agentsService.ensureAgentExists(agentId);
  }

  const roomId = uuidv4();
  const createdAt = Date.now();

  await roomsService.createRoom({
    id: roomId,
    agentId,
    entityId: userId,
    source: "web",
    type: "DM",
    name: roomName || "New Chat",
    metadata: { createdAt, creatorUserId: userId },
  });

  logger.info(
    "[Eliza Rooms API POST] Room created:",
    roomId,
    "| agentId:",
    agentId,
    "| user:",
    userId,
  );

  return c.json({
    success: true,
    roomId,
    characterId: characterId || null,
    createdAt,
  });
});

export default app;
