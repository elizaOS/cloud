/**
 * GET /api/characters/:characterId/public
 *
 * Public character info for shared chat links. Returns display-safe fields
 * (name, avatar, bio, category, tags, public stats). Never exposes secrets,
 * settings, or full knowledge.
 *
 * Access:
 *   - public characters → anyone
 *   - private characters → owner only
 *   - claimable affiliate characters → anyone
 */

import { Hono } from "hono";

import { charactersService } from "@/lib/services/characters/characters";
import { logger } from "@/lib/utils/logger";
import { getCurrentUser } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const characterId = c.req.param("characterId") ?? "";
  try {
    const character = await charactersService.getById(characterId);
    if (!character) {
      logger.warn(`[Public Character API] Character not found: ${characterId}`);
      return c.json({ success: false, error: "Character not found" }, 404);
    }
    if (character.source !== "cloud") {
      return c.json({ success: false, error: "Character not available" }, 404);
    }

    const user = await getCurrentUser(c);
    const isOwner = !!(user && character.user_id === user.id);
    const isPublic = character.is_public === true;

    const claimCheck = await charactersService.isClaimableAffiliateCharacter(characterId);
    const isClaimableAffiliate = claimCheck.claimable;

    if (!isPublic && !isOwner && !isClaimableAffiliate) {
      logger.warn(`[Public Character API] Access denied to private character: ${characterId}`, {
        userId: user?.id,
        characterOwnerId: character.user_id,
        isPublic: character.is_public,
      });
      return c.json({ success: false, error: "Character not available" }, 404);
    }

    const publicInfo = {
      id: character.id,
      name: character.name,
      username: character.username,
      avatarUrl: character.avatar_url,
      bio: Array.isArray(character.bio) ? character.bio[0] : character.bio,
      category: character.category,
      tags: character.tags,
      viewCount: character.view_count,
      interactionCount: character.interaction_count,
      monetizationEnabled: character.monetization_enabled,
    };

    logger.debug(`[Public Character API] Returning public info for: ${characterId}`, {
      isPublic,
      isOwner,
      isClaimableAffiliate,
    });

    return c.json({ success: true, data: publicInfo });
  } catch (error) {
    logger.error(`[Public Character API] Error fetching character:`, error);
    return failureResponse(c, error);
  }
});

export default app;
