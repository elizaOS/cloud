/**
 * Billing page wrapper component setting page header and displaying payment cancellation alerts.
 *
 * @param props - Billing page wrapper configuration
 * @param props.currentCredits - Current credit balance
 * @param props.canceled - Optional cancellation message from Stripe
 */

"use client";

import { Alert, AlertDescription, AlertTitle, useSetPageHeader } from "@elizaos/cloud-ui";
import { Info } from "lucide-react";
import { BillingPageClient } from "./billing-page-client";
import { MiladyPricingInfo } from "./milady-pricing-info";

interface BillingPageWrapperProps {
  currentCredits: number;
  canceled?: string;
  runningAgents?: number;
  idleAgents?: number;
}

export function BillingPageWrapper({
  currentCredits,
  canceled,
  runningAgents = 0,
  idleAgents = 0,
}: BillingPageWrapperProps) {
  useSetPageHeader({
    title: "Billing & Balance",
    description: "Add funds to power your AI generations",
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {canceled && (
        <Alert variant="destructive" className="rounded-none border-rose-500/40 bg-rose-500/10">
          <Info className="h-4 w-4 text-rose-400" />
          <AlertTitle className="text-rose-400">Payment Canceled</AlertTitle>
          <AlertDescription className="text-rose-400">
            Your payment was canceled. No charges were made.
          </AlertDescription>
        </Alert>
      )}

      <MiladyPricingInfo
        currentCredits={currentCredits}
        runningAgents={runningAgents}
        idleAgents={idleAgents}
      />

      <BillingPageClient currentCredits={currentCredits} />
    </div>
  );
}
