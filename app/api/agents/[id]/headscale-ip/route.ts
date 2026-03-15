import { NextRequest, NextResponse } from "next/server";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getInternalToken(request: NextRequest): string | null {
  const direct = request.headers.get("x-internal-token");
  if (direct) {
    return direct.trim();
  }

  const authorization = request.headers.get("authorization");
  if (authorization && authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return null;
}

/**
 * GET /api/agents/[id]/headscale-ip
 *
 * Internal-only endpoint consumed by the nginx Lua router.
 * Returns { headscale_ip, web_ui_port, status } so nginx can
 * proxy_pass to the correct container.
 *
 * Access is restricted with a shared internal token injected by the
 * trusted reverse proxy. Do not expose this endpoint publicly.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params;

  const expectedToken = process.env.HEADSCALE_INTERNAL_TOKEN?.trim();
  if (!expectedToken) {
    console.error("[headscale-ip] HEADSCALE_INTERNAL_TOKEN is not configured");
    return NextResponse.json({ error: "internal auth not configured" }, { status: 503 });
  }

  if (getInternalToken(request) !== expectedToken) {
    console.warn(`[headscale-ip] blocked unauthorized lookup for ${agentId}`);
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // --- Validate UUID format -----------------------------------------------
  if (!UUID_RE.test(agentId)) {
    return NextResponse.json({ error: "invalid agent ID format" }, { status: 400 });
  }

  try {
    const sandbox = await miladySandboxesRepository.findById(agentId);

    if (!sandbox) {
      return NextResponse.json({ error: "agent not found" }, { status: 404 });
    }

    // Determine the IP to route to.
    // Prefer an explicit headscale_ip if present; otherwise extract from
    // health_url (e.g. "http://37.27.190.196:24950" → "37.27.190.196").
    let ip = sandbox.headscale_ip || null;

    if (!ip && sandbox.health_url) {
      try {
        const parsed = new URL(sandbox.health_url);
        ip = parsed.hostname;
      } catch {
        // health_url not parseable — fall through
      }
    }

    if (!ip) {
      return NextResponse.json({ error: "agent has no routable IP" }, { status: 503 });
    }

    const webUiPort = sandbox.web_ui_port ?? 0;
    if (!webUiPort) {
      return NextResponse.json({ error: "agent has no web UI port" }, { status: 503 });
    }

    return NextResponse.json({
      headscale_ip: ip,
      web_ui_port: webUiPort,
      status: sandbox.status,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[headscale-ip] lookup error:", msg);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
}
