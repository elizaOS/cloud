import { Suspense } from "react";

import { AuthorizeContent } from "./authorize-content";

export const dynamic = "force-dynamic";

export default function AppAuthAuthorizePage() {
  return (
    <Suspense fallback={null}>
      <AuthorizeContent />
    </Suspense>
  );
}
