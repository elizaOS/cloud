import { Helmet } from "react-helmet-async";
import { useCurrentUser } from "@/lib/auth-hooks";
import { SettingsPageClient } from "@/packages/ui/src/components/settings/settings-page-client";
import { DashboardEndpointPending, DashboardLoadingState } from "../_shared";

/** /dashboard/settings */
export default function SettingsPage() {
  const { user, isLoading, isReady, isAuthenticated } = useCurrentUser();

  return (
    <>
      <Helmet>
        <title>Settings</title>
        <meta
          name="description"
          content="Manage your account preferences, profile, and settings"
        />
      </Helmet>
      {!isReady || (isAuthenticated && isLoading) ? (
        <DashboardLoadingState label="Loading settings" />
      ) : !user ? (
        <DashboardEndpointPending endpoint="GET /api/users/me" what="Settings" />
      ) : (
        <SettingsPageClient user={user as never} />
      )}
    </>
  );
}
