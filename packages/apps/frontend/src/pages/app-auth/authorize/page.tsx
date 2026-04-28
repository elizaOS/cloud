import { Suspense } from "react";

import { StewardAuthProvider } from "@/lib/providers/StewardProvider";
import { AuthorizeContent } from "@/packages/ui/src/components/auth/authorize-content";

export default function AppAuthAuthorizePage() {
  return (
    <StewardAuthProvider>
      <Suspense fallback={null}>
        <AuthorizeContent />
      </Suspense>
    </StewardAuthProvider>
  );
}
