import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Authentication Error",
  description:
    "An error occurred during authentication. Please try again or contact support if the issue persists.",
};

/**
 * Authentication error page displayed when Privy authentication succeeds
 * but account sync to database fails.
 */
export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Authentication Error</h1>
            <p className="text-muted-foreground">
              We encountered an issue while trying to sign you in.
            </p>
          </div>

          <div className="w-full rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-left">
            <p className="text-sm font-medium text-destructive">
              Error Details:
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your authentication with Privy was successful, but we
              couldn&apos;t sync your account to our database. This is likely a
              temporary issue.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3">
            <Button asChild className="w-full">
              <Link href="/">Try Again</Link>
            </Button>

            <Button asChild variant="outline" className="w-full">
              <Link href="/">Return Home</Link>
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            <p>If this problem persists, please contact support.</p>
            <p className="mt-1">
              Check the browser console and server logs for more details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
