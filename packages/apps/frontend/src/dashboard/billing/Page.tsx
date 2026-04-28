import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { useCurrentUser } from "@/lib/auth-hooks";
import { BillingPageWrapper } from "@/packages/ui/src/components/billing/billing-page-wrapper";
import { DashboardEndpointPending, DashboardLoadingState } from "../_shared";

/** /dashboard/billing */
export default function BillingPage() {
  const { user, isLoading, isReady, isAuthenticated } = useCurrentUser();
  const [params] = useSearchParams();
  const canceled = params.get("canceled") ?? undefined;

  return (
    <>
      <Helmet>
        <title>Billing</title>
        <meta name="description" content="Add funds and manage your billing" />
      </Helmet>
      {!isReady || (isAuthenticated && isLoading) ? (
        <DashboardLoadingState label="Loading billing" />
      ) : !user ? (
        <DashboardEndpointPending endpoint="GET /api/users/me" what="Billing" />
      ) : (
        <BillingPageWrapper user={user as never} canceled={canceled} />
      )}
    </>
  );
}
