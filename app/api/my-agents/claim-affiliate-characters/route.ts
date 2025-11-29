import { NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { elizaRoomCharactersRepository } from "@/db/repositories";
import { charactersService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/my-agents/claim-affiliate-characters
 * 
 * Claims all affiliate characters that the authenticated user has interacted with
 * (via chat rooms) but doesn't own yet.
 * 
 * This handles the case where an already-authenticated user visited an affiliate link
 * and chatted with the character before visiting the My Agents page.
 */
export async function POST() {
  try {
    const user = await requireAuthWithOrg();

    logger.info(`[Claim Affiliate Chars] Starting claim process for user ${user.id}`);

    // Find affiliate characters user has interacted with
    const claimableCharacters = await elizaRoomCharactersRepository.findClaimableAffiliateCharacters(user.id);

    if (claimableCharacters.length === 0) {
      logger.info(`[Claim Affiliate Chars] No claimable characters found for user ${user.id}`);
      return NextResponse.json({
        success: true,
        claimed: [],
        message: "No affiliate characters to claim",
      });
    }

    logger.info(`[Claim Affiliate Chars] Found ${claimableCharacters.length} claimable characters`, {
      characters: claimableCharacters.map(c => ({ id: c.characterId, name: c.characterName })),
    });

    // Claim each character
    const claimedCharacters: Array<{ id: string; name: string }> = [];
    const failedClaims: Array<{ id: string; reason: string }> = [];

    for (const char of claimableCharacters) {
      const result = await charactersService.claimAffiliateCharacter(
        char.characterId,
        user.id,
        user.organization_id!
      );

      if (result.success) {
        claimedCharacters.push({ id: char.characterId, name: char.characterName });
        logger.info(`[Claim Affiliate Chars] ✅ Claimed character: ${char.characterName}`);
      } else {
        failedClaims.push({ id: char.characterId, reason: result.message });
        logger.warn(`[Claim Affiliate Chars] ❌ Failed to claim ${char.characterName}: ${result.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      claimed: claimedCharacters,
      failed: failedClaims,
      message: claimedCharacters.length > 0 
        ? `Successfully claimed ${claimedCharacters.length} character(s)`
        : "No characters were claimed",
    });

  } catch (error) {
    logger.error("[Claim Affiliate Chars] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to claim characters",
      },
      { status: 500 }
    );
  }
}

