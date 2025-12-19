import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle, XCircle, ArrowRight } from "lucide-react";
import { requireStripe } from "@/lib/stripe";
import { creditsService } from "@/lib/services/credits";
import { invoicesService } from "@/lib/services/invoices";
import { logger } from "@/lib/utils/logger";

// Maximum allowed credit amount for validation
const MAX_CREDITS = 10000;

/**
 * Safely parse and validate a credit amount from string
 */
function parseAndValidateCredits(creditsStr: string): number | null {
  const credits = Number.parseFloat(creditsStr);
  if (!Number.isFinite(credits) || credits <= 0 || credits > MAX_CREDITS) {
    return null;
  }
  return Math.round(credits * 100) / 100;
}

export const metadata: Metadata = {
  title: "Purchase Successful",
  description: "Your credit purchase was successful",
};

interface BillingSuccessPageProps {
  searchParams: Promise<{ from?: string; session_id?: string }>;
}

/**
 * Verifies and processes a Stripe checkout session.
 * Acts as a fallback if webhook doesn't fire (e.g., local development).
 * Uses idempotency checks to prevent duplicate credit additions.
 *
 * @param sessionId - The Stripe checkout session ID to verify.
 * @returns Processing result with success status, credits amount, and error details.
 */
async function verifyAndProcessSession(sessionId: string): Promise<{
  success: boolean;
  error?: string;
  credits?: number;
  alreadyProcessed?: boolean;
}> {
  logger.debug(`[BillingSuccess] Verifying session: ${sessionId}`);

  // Fetch the session from Stripe
  const session = await requireStripe().checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    logger.warn(
      `[BillingSuccess] Session ${sessionId} not paid: ${session.payment_status}`,
    );
    return {
      success: false,
      error: `Payment not completed. Status: ${session.payment_status}`,
    };
  }

  const organizationId = session.metadata?.organization_id;
  const userId = session.metadata?.user_id;
  const creditsStr = session.metadata?.credits || "0";
  const credits = parseAndValidateCredits(creditsStr);
  const purchaseType = session.metadata?.type || "checkout";
  const paymentIntentId = session.payment_intent as string;

  if (!organizationId || !credits) {
    logger.warn("[BillingSuccess] Invalid metadata", {
      hasOrgId: !!organizationId,
      hasValidCredits: !!credits,
    });
    return {
      success: false,
      error: "Invalid session metadata",
    };
  }

  if (!paymentIntentId) {
    logger.warn("[BillingSuccess] No payment intent ID in session");
    return {
      success: false,
      error: "No payment intent found",
    };
  }

  // Check if already processed (idempotency check)
  const existingTransaction =
    await creditsService.getTransactionByStripePaymentIntent(paymentIntentId);

  if (existingTransaction) {
    logger.debug("[BillingSuccess] Session already processed via webhook");
    return {
      success: true,
      credits,
      alreadyProcessed: true,
    };
  }

  // Add credits (with built-in idempotency)
  logger.debug(
    `[BillingSuccess] Adding ${credits} credits to org ${organizationId}`,
  );

  await creditsService.addCredits({
    organizationId,
    amount: credits,
    description: `Balance top-up - $${credits.toFixed(2)}`,
    metadata: {
      user_id: userId,
      payment_intent_id: paymentIntentId,
      session_id: sessionId,
      type: purchaseType,
      source: "success_page_fallback",
    },
    stripePaymentIntentId: paymentIntentId,
  });

  logger.info(
    `[BillingSuccess] Credits added for session ${sessionId} (fallback)`,
  );

  // Create invoice record
  const existingInvoice = await invoicesService.getByStripeInvoiceId(
    `cs_${sessionId}`,
  );

  if (!existingInvoice) {
    const amountTotal = session.amount_total
      ? (session.amount_total / 100).toString()
      : credits.toString();

    await invoicesService.create({
      organization_id: organizationId,
      stripe_invoice_id: `cs_${sessionId}`,
      stripe_customer_id: session.customer as string,
      stripe_payment_intent_id: paymentIntentId,
      amount_due: amountTotal,
      amount_paid: amountTotal,
      currency: session.currency || "usd",
      status: "paid",
      invoice_type: purchaseType,
      invoice_number: undefined,
      invoice_pdf: undefined,
      hosted_invoice_url: undefined,
      credits_added: credits.toString(),
      metadata: {
        type: purchaseType,
        session_id: sessionId,
        source: "success_page_fallback",
      },
      paid_at: new Date(),
    });

    logger.debug(`[BillingSuccess] Invoice created for session ${sessionId}`);
  }

  return {
    success: true,
    credits,
    alreadyProcessed: false,
  };
}

/**
 * Billing success page displayed after successful Stripe checkout.
 * Verifies and processes the payment session, then displays success message.
 *
 * @param searchParams - Query parameters containing session_id and optional from parameter.
 * @returns Success or error page based on payment verification result.
 */
export default async function BillingSuccessPage({
  searchParams,
}: BillingSuccessPageProps) {
  const params = await searchParams;
  const fromSettings = params.from === "settings";
  const sessionId = params.session_id;

  // Verify and process the session if session_id is provided
  let verificationResult:
    | {
        success: boolean;
        error?: string;
        credits?: number;
        alreadyProcessed?: boolean;
      }
    | undefined = undefined;

  if (sessionId) {
    const result = await verifyAndProcessSession(sessionId);
    verificationResult = result;
  }

  // Show error state if verification failed
  if (verificationResult && !verificationResult.success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
              <XCircle className="h-10 w-10 text-red-500" />
            </div>
            <CardTitle className="text-2xl">Payment Issue</CardTitle>
            <CardDescription>
              {verificationResult.error || "Unable to verify payment"}
            </CardDescription>
          </CardHeader>

          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              If you believe this is an error, please contact support with your
              session ID.
            </p>
            {sessionId && (
              <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                Session: {sessionId.substring(0, 20)}...
              </p>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-2">
            <Button asChild variant="outline" className="w-full">
              <Link
                href={
                  fromSettings
                    ? "/dashboard/settings?tab=billing"
                    : "/dashboard/billing"
                }
              >
                Back to Billing
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="max-w-md w-full mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          <CardTitle className="text-2xl">Purchase Successful!</CardTitle>
          <CardDescription>
            {verificationResult?.credits
              ? `$${verificationResult.credits.toFixed(2)} has been added to your account`
              : "Your credits have been added to your account"}
          </CardDescription>
        </CardHeader>

        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            You can now use your credits for text generation, image creation,
            and video rendering.
          </p>
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          {fromSettings ? (
            <>
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/settings?tab=billing">
                  Back to Billing Settings
                </Link>
              </Button>
              <Button asChild className="w-full">
                <Link href="/dashboard">
                  Go to Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/billing">View Billing</Link>
              </Button>
              <Button asChild className="w-full">
                <Link href="/dashboard">
                  Go to Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
