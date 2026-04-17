/**
 * POST /api/v1/remote/pair
 *
 * T9a — Remote-control control plane.
 *
 * Authenticated user requests a pairing token for one of their agents. The
 * returned token is a 6-digit pairing code intended for out-of-band entry
 * into the agent (e.g. the companion app enters it to authorize a session).
 *
 * Body: { agentId: string }
 * Returns: { code, expiresAt, sessionId, status }
 *
 * This endpoint reserves a `pending` remote_sessions row. The session is
 * promoted to `active` when the agent consumes the code via
 * START_REMOTE_SESSION, or expires if the code is never consumed.
 */

import { createHash, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { remoteSessionsRepository } from "@/db/repositories/remote-sessions";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "POST, OPTIONS";
const PAIRING_CODE_TTL_SECONDS = 5 * 60;

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

function generatePairingCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

interface PairRequestBody {
  agentId?: unknown;
  requesterIdentity?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = (await request.json().catch(() => ({}))) as PairRequestBody;
    const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
    if (!agentId) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "agentId is required" },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }

    const requesterIdentity =
      typeof body.requesterIdentity === "string" &&
      body.requesterIdentity.trim().length > 0
        ? body.requesterIdentity.trim()
        : user.id;

    const sandbox = await miladySandboxesRepository.findByIdAndOrg(
      agentId,
      user.organization_id,
    );
    if (!sandbox) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Agent not found" },
          { status: 404 },
        ),
        CORS_METHODS,
      );
    }

    const code = generatePairingCode();
    const tokenHash = hashCode(code);
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_SECONDS * 1000);

    const session = await remoteSessionsRepository.create({
      organization_id: user.organization_id,
      user_id: user.id,
      agent_id: agentId,
      status: "pending",
      requester_identity: requesterIdentity,
      pairing_token_hash: tokenHash,
    });

    const response = applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          sessionId: session.id,
          code,
          expiresAt: expiresAt.toISOString(),
          ttlSeconds: PAIRING_CODE_TTL_SECONDS,
          status: session.status,
        },
      }),
      CORS_METHODS,
    );
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
