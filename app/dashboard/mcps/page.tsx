import { redirect } from "next/navigation";

// Auth check requires cookies which makes this dynamic
// MCP server list is hardcoded but auth is dynamic
export const dynamic = "force-dynamic";

/**
 * MCPs page - redirects to Services marketplace.
 * MCPs have been refactored into the unified Services concept.
 */
export default function MCPsPage() {
  redirect("/dashboard/services");
}
