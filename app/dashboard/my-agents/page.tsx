import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth";
import { MyAgentsClient } from "./my-agents";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";
import { logger } from "@/lib/utils/logger";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.myAgents,
  path: "/dashboard/my-agents",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function MyAgentsPage() {
  const user = await requireAuth();

  // Server-side migration check: if user has an anonymous session cookie, migrate it
  try {
    const cookieStore = await cookies();
    const anonSessionCookie = cookieStore.get("eliza-anon-session");

    if (anonSessionCookie?.value && user.privy_user_id) {
      const { anonymousSessionsService } = await import("@/lib/services");
      const anonSession = await anonymousSessionsService.getByToken(anonSessionCookie.value);

      if (anonSession && !anonSession.converted_at) {
        logger.info("[MyAgents] Found unconverted anonymous session, migrating...", {
          userId: user.id,
          sessionId: anonSession.id,
          anonymousUserId: anonSession.user_id,
        });

        const { convertAnonymousToReal } = await import("@/lib/auth-anonymous");
        await convertAnonymousToReal(anonSession.user_id, user.privy_user_id);

        logger.info("[MyAgents] Migration completed successfully");
      }

      // Always delete the cookie after checking - either migration completed or session already converted/invalid
      cookieStore.delete("eliza-anon-session");
    }
  } catch (error) {
    logger.error("[MyAgents] Migration check failed:", error);
  }

  return <MyAgentsClient />;
}
