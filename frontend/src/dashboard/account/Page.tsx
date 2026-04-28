import { Helmet } from "react-helmet-async";
import { useCurrentUser } from "@/lib/auth-hooks";
import { AccountPageClient } from "@/packages/ui/src/components/account/account-page-client";
import { DashboardEndpointPending, DashboardLoadingState } from "../_shared";

/** /dashboard/account — wraps the existing AccountPageClient. */
export default function AccountPage() {
  const { user, isLoading, isReady, isAuthenticated } = useCurrentUser();

  return (
    <>
      <Helmet>
        <title>Account Settings</title>
        <meta
          name="description"
          content="Manage your account preferences, profile, and security settings"
        />
      </Helmet>
      {!isReady || (isAuthenticated && isLoading) ? (
        <DashboardLoadingState label="Loading account" />
      ) : !user ? (
        <DashboardEndpointPending endpoint="GET /api/users/me" what="Account" />
      ) : (
        <AccountPageClient user={user as never} />
      )}
    </>
  );
}
