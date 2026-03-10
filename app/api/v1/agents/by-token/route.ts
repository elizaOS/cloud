import { NextRequest, NextResponse } from "next/server";
import { userCharactersRepository } from "@/db/repositories/characters";
import { normalizeTokenAddress } from "@/lib/utils/token-address";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/agents/by-token?address=<token>&chain=<chain>
 *
 * Public lookup: resolves a token address (+ optional chain) to the canonical
 * agent linked to it.  Thin clients call this instead of maintaining their own
 * token→agent mapping.
 *
 * Query params:
 *   address (required) — on-chain token contract / mint address
 *   chain   (optional) — chain identifier (e.g. "solana", "base")
 *
 * Returns 200 with agent summary or 404 if no agent is linked.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const chain = searchParams.get("chain") ?? undefined;

  if (!address) {
    return NextResponse.json(
      { success: false, error: "Missing required query parameter: address" },
      { status: 400 },
    );
  }

  const character = await userCharactersRepository.findByTokenAddress(
    normalizeTokenAddress(address, chain),
    chain,
  );

  if (!character) {
    return NextResponse.json(
      { success: false, error: "No agent linked to this token" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: character.id,
      name: character.name,
      username: character.username ?? null,
      avatar_url: character.avatar_url ?? null,
      bio: character.bio,
      is_public: character.is_public,
      token_address: character.token_address,
      token_chain: character.token_chain,
      token_name: character.token_name,
      token_ticker: character.token_ticker,
      created_at: character.created_at,
    },
  });
}
