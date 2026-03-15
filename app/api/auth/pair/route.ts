import { NextRequest, NextResponse } from "next/server";
import { getPairingTokenService } from "@/lib/services/pairing-token";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/pair
 *
 * Validates a one-time pairing token and returns the agent's API key
 * (or a generated session key) so pair.html can bootstrap the web UI.
 *
 * The nginx config proxies /api/auth/pair to port 3000 first. If that
 * backend returns a failure for v2 agents, pair.html can also call this
 * endpoint directly at /api/auth/pair (when nginx is configured to
 * fall through to port 3334).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const token = body?.token;

    if (!token) {
      return NextResponse.json(
        { error: "Pairing code required" },
        { status: 400 },
      );
    }

    const origin = request.headers.get("origin") ?? null;
    if (!origin) {
      return NextResponse.json(
        { error: "Origin header required" },
        { status: 400 },
      );
    }

    const tokenService = getPairingTokenService();
    const pairingToken = await tokenService.validateToken(token, origin);

    if (!pairingToken) {
      return NextResponse.json(
        { error: "Invalid or expired pairing code" },
        { status: 401 },
      );
    }

    // Look up the sandbox to get container details
    const sandbox = await miladySandboxesRepository.findById(
      pairingToken.agentId,
    );

    if (!sandbox) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 },
      );
    }

    // Return the container's explicit API token so pair.html can
    // bootstrap the web UI session.  Never expose JWT_SECRET or
    // generic API_KEY (which could be an OpenAI key etc.).
    const envVars = (sandbox.environment_vars ?? {}) as Record<string, string>;
    const apiKey = envVars.MILADY_API_TOKEN || null;

    // If no API key configured, still allow pairing — the web UI may
    // work without auth or use a different mechanism.
    const response = NextResponse.json({
      message: "Paired successfully",
      apiKey: apiKey ?? null,
      agentName: sandbox.agent_name ?? "Agent",
    });

    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate",
    );

    return response;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth/pair] error:", msg);
    return NextResponse.json(
      { error: "Pairing failed" },
      { status: 500 },
    );
  }
}
