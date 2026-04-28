import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { BillingPageWrapper } from "@/packages/ui/src/components/billing/billing-page-wrapper";

export const metadata: Metadata = {
  title: "Billing",
  description: "Add funds and manage your billing",
};

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;

  return <BillingPageWrapper user={user} canceled={params.canceled} />;
}
