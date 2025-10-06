import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { listActiveCreditPacks } from "@/lib/queries/credit-packs";
import { BillingPageClient } from "@/components/billing/billing-page-client";
import { CreditCard, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
            <CreditCard className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Billing & Credits</h1>
            <p className="text-muted-foreground mt-1">
              Purchase credit packs to power your AI generations
            </p>
          </div>
        </div>
      </div>

      {params.canceled && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertTitle>Payment Canceled</AlertTitle>
          <AlertDescription>
            Your payment was canceled. No charges were made.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How Credits Work</AlertTitle>
        <AlertDescription>
          Credits are used to power all AI operations including text
          generation, image creation, and video rendering. Purchase credits in
          bulk to get better rates. Credits never expire and are shared across
          your organization.
        </AlertDescription>
      </Alert>

      <BillingPageClient
        creditPacks={creditPacks}
        currentCredits={user.organization.credit_balance}
      />
    </div>
  );
}
