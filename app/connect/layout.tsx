"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function ConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (ready && !authenticated) {
      // Build the full return URL including all current params
      const currentUrl = `/connect?${searchParams.toString()}`;
      const encodedReturnTo = encodeURIComponent(currentUrl);
      router.replace(`/login?returnTo=${encodedReturnTo}`);
    }
  }, [ready, authenticated, router, searchParams]);

  // Show loading while checking auth
  if (!ready || !authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            {!ready ? "Loading..." : "Redirecting to login..."}
          </p>
        </div>
      </div>
    );
  }

  // Minimal layout - just the children, no dashboard chrome
  return <div className="min-h-screen bg-background">{children}</div>;
}
