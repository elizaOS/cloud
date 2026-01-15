import { Suspense } from "react";
import { AuthorizeContent, AuthorizeFallback } from "./authorize-content";

/**
 * App Authorization Page
 *
 * OAuth-style authorization flow for third-party apps.
 * Users sign in with their Eliza Cloud account and authorize the app.
 */
export default function AppAuthorizePage() {
  return (
    <Suspense fallback={<AuthorizeFallback />}>
      <AuthorizeContent />
    </Suspense>
  );
}
