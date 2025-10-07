import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { listActiveCreditPacks } from "@/lib/queries/credit-packs";
import { BillingPageWrapper } from "@/components/billing/billing-page-wrapper";

export const metadata: Metadata = {
  title: "Billing",
  description: "Purchase credits and manage your billing",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const user = await requireAuth();
  const creditPacks = await listActiveCreditPacks();
  const params = await searchParams;

  return (
    <BillingPageWrapper
      creditPacks={creditPacks}
      currentCredits={user.organization.credit_balance}
      canceled={params.canceled}
    />
  );
}
