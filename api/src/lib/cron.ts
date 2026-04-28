/**
 * Cron dispatcher for the scheduled() handler.
 *
 * Cloudflare Workers cron triggers fire by schedule string (e.g. "0 * * * *").
 * Each trigger runs `scheduled(event, env, ctx)` with `event.cron` matching
 * the schedule. We map each schedule back to the converted cron route
 * handler so the same code paths run from both web (manual hit) and cron.
 *
 * Schedules pulled from `cloud/vercel.json`. When adding a new cron route,
 * add an entry here AND ask Agent C to register it in wrangler.toml.
 */

import type { Bindings } from "./context";

/**
 * Map cron schedule -> dispatch URL path. The path is invoked through the
 * Hono fetch entrypoint so middleware (cron secret check, error handling)
 * runs identically to a web hit.
 */
export const CRON_ROUTES: Record<string, string> = {
  "0 0 * * *": "/api/cron/container-billing",
  "0 * * * *": "/api/cron/milady-billing",
  "*/5 * * * *": "/api/cron/social-automation",
  "*/15 * * * *": "/api/cron/auto-top-up",
  "* * * * *": "/api/v1/cron/deployment-monitor",
  // Note: multiple jobs share schedules; if you need per-job dispatch, switch
  // to a list of (schedule, path) pairs and iterate. For now the dispatcher
  // calls EVERY route registered for a given cron tick.
};

/**
 * Multi-route variant: each schedule may map to multiple paths. The
 * scheduled() handler iterates and fans out.
 */
export const CRON_FANOUT: Record<string, string[]> = {
  "0 0 * * *": ["/api/cron/container-billing", "/api/cron/release-pending-earnings"],
  "0 1 * * *": ["/api/cron/compute-metrics"],
  "0 2 * * *": ["/api/cron/cleanup-webhook-events"],
  "0 * * * *": ["/api/cron/milady-billing"],
  "*/5 * * * *": [
    "/api/cron/social-automation",
    "/api/cron/sample-eliza-price",
    "/api/cron/process-redemptions",
    "/api/cron/cleanup-stuck-provisioning",
  ],
  "*/10 * * * *": ["/api/cron/cleanup-expired-crypto-payments"],
  "*/15 * * * *": [
    "/api/cron/auto-top-up",
    "/api/cron/agent-budgets",
    "/api/v1/cron/refresh-model-catalog",
  ],
  "* * * * *": ["/api/v1/cron/deployment-monitor", "/api/v1/cron/health-check"],
  "0 */6 * * *": ["/api/cron/cleanup-anonymous-sessions"],
};

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Build the scheduled() handler bound to the same Hono app `fetch`.
 * The Worker entry passes its own `app.fetch` here.
 */
export function makeCronHandler(
  appFetch: (req: Request, env: Bindings, ctx: ExecutionContext) => Promise<Response>,
) {
  return async function scheduled(
    event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    const paths = CRON_FANOUT[event.cron] ?? [];
    if (paths.length === 0) {
      console.warn(`[cron] no routes registered for schedule "${event.cron}"`);
      return;
    }
    const secret = env.CRON_SECRET ?? "";
    const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "http://internal";

    const work = paths.map(async (path) => {
      try {
        const req = new Request(`${baseUrl}${path}`, {
          method: "POST",
          headers: { "x-cron-secret": secret, "user-agent": "cf-cron/1.0" },
        });
        const res = await appFetch(req, env, ctx);
        if (!res.ok) {
          console.warn(`[cron] ${path} -> ${res.status}`);
        }
      } catch (err) {
        console.error(`[cron] ${path} threw:`, err);
      }
    });
    ctx.waitUntil(Promise.all(work).then(() => undefined));
  };
}
