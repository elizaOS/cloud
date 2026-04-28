/**
 * Health Check
 *
 * Lightweight health check endpoint for load balancers and uptime checks.
 * Used by load balancers, monitoring tools, and uptime checks.
 */

export async function GET() {
  return Response.json(
    {
      status: "ok",
      timestamp: Date.now(),
      region: process.env.VERCEL_REGION || "unknown",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
