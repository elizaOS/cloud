// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.
/**
 * App Builder ("vibe code an app") — currently disabled.
 *
 * The 3,750-line vercel-coupled codebuilder this page used to render
 * was hidden in 8616f45528 because it couldn't ship cleanly. Until
 * that flow is rebuilt on the container path, this route redirects
 * users back to the apps list, where they can register a simple app
 * via CreateAppDialog (no codebuilder involved) or programmatically
 * via the SDK (cloud.routes.postApiV1Apps from @elizaos/cloud-sdk —
 * the path agents already use).
 *
 * Original implementation preserved in git history at ce75ff971d^.
 */

import type { Metadata } from "next";
import { Navigate } from "react-router-dom";
// TODO(migrate): replace redirect(...) calls with <Navigate to=... replace /> or navigate(...).

export const metadata: Metadata = {
  title: "App Builder",
  robots: { index: false, follow: false },
};

export default function AppBuilderPage() {
  redirect("/dashboard/apps");
}
