import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * MCPs page - redirects to Services marketplace.
 * MCPs have been refactored into the unified Services concept.
 */
export default function MCPsPage() {
  redirect("/dashboard/services");
}
