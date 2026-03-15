import { NextRequest, NextResponse } from "next/server";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/agents/[id]/headscale-ip
 *
 * Internal-only endpoint consumed by the nginx Lua router.
 * Returns { headscale_ip, web_ui_port, status } so nginx can
 * proxy_pass to the correct container.
 *
 * Access is restricted to loopback callers (nginx on the same host).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: agentId } = await params;

  // --- Loopback guard ---------------------------------------------------
  const xff = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const callerIp = xff?.split(",")[0]?.trim() || realIp || "";

  const isLoopback =
    callerIp === "127.0.0.1" ||
    callerIp === "::1" ||
    callerIp === "::ffff:127.0.0.1" ||
    callerIp === "";

  if (!isLoopback) {
    console.warn(
      `[headscale-ip] blocked non-local lookup for ${agentId} from ${callerIp}`,
    );
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // --- Validate UUID format -----------------------------------------------
  if (!UUID_RE.test(agentId)) {
    return NextResponse.json(
      { error: "invalid agent ID format" },
      { status: 400 },
    );
  }

  try {
    const sandbox = await miladySandboxesRepository.findById(agentId);

    if (!sandbox) {
      return NextResponse.json(
        { error: "agent not found" },
        { status: 404 },
      );
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
      return NextResponse.json(
        { error: "agent has no routable IP" },
        { status: 503 },
      );
    }

    const webUiPort = sandbox.web_ui_port ?? 0;
    if (!webUiPort) {
      return NextResponse.json(
        { error: "agent has no web UI port" },
        { status: 503 },
      );
    }

    return NextResponse.json({
      headscale_ip: ip,
      web_ui_port: webUiPort,
      status: sandbox.status,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[headscale-ip] lookup error:", msg);
    return NextResponse.json(
      { error: msg || "lookup failed" },
      { status: 500 },
    );
  }
}
