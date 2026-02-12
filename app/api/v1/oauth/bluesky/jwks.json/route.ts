/**
 * Bluesky AT Protocol JWKS Endpoint
 *
 * GET /api/v1/oauth/bluesky/jwks.json
 *
 * Serves the public JSON Web Key Set for private_key_jwt client authentication.
 * Only the public portion of the key is exposed (no `d` parameter).
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let _jwks: object | null = null;

async function getJwks(): Promise<object> {
  if (_jwks) return _jwks;

  const { JoseKey } = await import("@atproto/jwk-jose");

  const privateKeyPem = process.env.BLUESKY_PRIVATE_KEY;
  const keyId = process.env.BLUESKY_KEY_ID || "bluesky-key-1";
  if (!privateKeyPem) {
    throw new Error("BLUESKY_PRIVATE_KEY not configured");
  }

  const key = await JoseKey.fromImportable(privateKeyPem, keyId);
  _jwks = { keys: [key.publicJwk] };

  return _jwks;
}

export async function GET(): Promise<NextResponse> {
  try {
    const jwks = await getJwks();
    return NextResponse.json(jwks, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "JWKS not available" },
      { status: 503 },
    );
  }
}
