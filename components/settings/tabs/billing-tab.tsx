"use client";

import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

interface BillingTabProps {
  user: UserWithOrganization;
}

interface Invoice {
  id: string;
  stripeInvoiceId?: string;
  date: string;
  total: string;
  status: string;
  invoiceUrl?: string;
  invoicePdf?: string;
  type?: string;
  creditsAdded?: number;
}

const AMOUNT_LIMITS = {
  MIN: 5,
  MAX: 1000,
} as const;

export function BillingTab({ user }: BillingTabProps) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);

  const [balance, setBalance] = useState(
    Number(user.organization?.credit_balance || 0),
  );

  useEffect(() => {
    fetchInvoices();
    fetchBalance();
  }, []);

  const fetchBalance = async () => {
    try {
      const response = await fetch("/api/credits/balance");
      if (response.ok) {
        const data = await response.json();
        setBalance(data.balance);
      }
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoadingInvoices(true);
      const response = await fetch("/api/invoices/list");
      if (response.ok) {
        const data = await response.json();
        setInvoices(data.invoices || []);
      } else {
        console.error("Failed to fetch invoices");
        setInvoices([]);
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleBuyCredits = async () => {
    const amount = parseFloat(purchaseAmount);

    if (isNaN(amount) || amount < AMOUNT_LIMITS.MIN) {
      toast.error(`Minimum amount is $${AMOUNT_LIMITS.MIN}`);
      return;
    }

    if (amount > AMOUNT_LIMITS.MAX) {
      toast.error(`Maximum amount is $${AMOUNT_LIMITS.MAX}`);
      return;
    }

    try {
      setIsProcessingCheckout(true);

      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          returnUrl: "settings",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create checkout session");
      }

      const data = await response.json();
      const { url } = data;

      if (!url) {
        throw new Error("No checkout URL returned");
      }

      window.location.href = url;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to initiate checkout. Please try again.",
      );
      setIsProcessingCheckout(false);
    }
  };

  const handleViewInvoice = (invoice: Invoice) => {
    router.push(`/dashboard/invoices/${invoice.id}`);
  };

  const amountValue = parseFloat(purchaseAmount) || 0;
  const isValidAmount =
    amountValue >= AMOUNT_LIMITS.MIN && amountValue <= AMOUNT_LIMITS.MAX;

  return (
    <div className="flex flex-col gap-4 md:gap-6 pb-6 md:pb-8">
      {/* Credit Balance Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
            <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
              Credit Balance
            </h3>
          </div>

          {/* Content Grid */}
          <div className="flex flex-col lg:flex-row gap-6 w-full">
            {/* Balance Display */}
            <div className="w-full lg:w-[400px] flex">
              <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface flex-1 flex items-center justify-center py-6 lg:py-8">
                <div className="flex flex-col items-center justify-center gap-1 px-4">
                  <p className="text-[40px] font-mono text-white tracking-tight">
                    ${balance.toFixed(2)}
                  </p>
                  <p className="text-sm text-white/60 text-center">
                    Remaining balance
                  </p>
                </div>
              </div>
            </div>

            {/* Right Section - Buy Credits */}
            <div className="flex-1 flex flex-col gap-6 lg:justify-center">
              <div className="flex flex-col gap-4">
                <p className="text-base font-mono text-[#e1e1e1]">
                  Add credits to your account
                </p>
                <p className="text-sm text-white/60">
                  Enter the amount you want to add. Min: ${AMOUNT_LIMITS.MIN},
                  Max: ${AMOUNT_LIMITS.MAX}
                </p>

                {/* Amount Input and Buy Button */}
                <div className="flex flex-col sm:flex-row items-stretch gap-4">
                  {/* Amount Input */}
                  <div className="relative flex-1 max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#717171] font-mono">
                      $
                    </span>
                    <Input
                      type="number"
                      step="1"
                      min={AMOUNT_LIMITS.MIN}
                      max={AMOUNT_LIMITS.MAX}
                      value={purchaseAmount}
                      onChange={(e) => setPurchaseAmount(e.target.value)}
                      className="pl-7 backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] text-[#e1e1e1] h-11 font-mono"
                      placeholder="0.00"
                      disabled={isProcessingCheckout}
                    />
                  </div>

                  {/* Buy Credits Button */}
                  <button
                    type="button"
                    onClick={handleBuyCredits}
                    disabled={!isValidAmount || isProcessingCheckout}
                    className="relative bg-[#e1e1e1] px-6 py-2.5 overflow-hidden hover:bg-white transition-colors w-full sm:w-auto flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <div
                      className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                      style={{
                        backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                        backgroundSize:
                          "2.915576934814453px 2.915576934814453px",
                      }}
                    />
                    {isProcessingCheckout ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-black relative z-10" />
                        <span className="relative z-10 text-black font-mono font-medium text-base whitespace-nowrap">
                          Redirecting...
                        </span>
                      </>
                    ) : (
                      <span className="relative z-10 text-black font-mono font-medium text-base whitespace-nowrap">
                        Buy credits
                      </span>
                    )}
                  </button>
                </div>

                {/* Amount validation feedback */}
                {purchaseAmount && !isValidAmount && (
                  <div className="flex items-center gap-2 text-sm text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-mono">
                      {amountValue < AMOUNT_LIMITS.MIN
                        ? `Minimum amount is $${AMOUNT_LIMITS.MIN}`
                        : `Maximum amount is $${AMOUNT_LIMITS.MAX}`}
                    </span>
                  </div>
                )}

                {isValidAmount && purchaseAmount && (
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-mono">
                      ${amountValue.toFixed(2)} will be added to your balance
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </BrandCard>

      {/* Invoices Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
              <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
                Invoices
              </h3>
            </div>
            <p className="text-xs font-mono text-[#858585] tracking-tight">
              View your payment history and download invoices.
            </p>
          </div>

          {/* Table */}
          <div className="w-full overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Table Header */}
              <div className="flex w-full">
                <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface flex-[1.5] p-3 md:p-4">
                  <p className="text-xs md:text-sm font-mono font-bold text-white uppercase">
                    Date & Time
                  </p>
                </div>
                <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t border-r border-b border-brand-surface flex-1 p-3 md:p-4">
                  <p className="text-xs md:text-sm font-mono font-bold text-white uppercase">
                    Total
                  </p>
                </div>
                <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t border-r border-b border-brand-surface flex-1 p-3 md:p-4">
                  <p className="text-xs md:text-sm font-mono font-bold text-white uppercase">
                    Status
                  </p>
                </div>
                <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t border-r border-b border-brand-surface flex-1 p-3 md:p-4">
                  <p className="text-xs md:text-sm font-mono font-bold text-white uppercase">
                    Actions
                  </p>
                </div>
              </div>

              {/* Table Rows */}
              {loadingInvoices ? (
                <div className="flex items-center justify-center p-8 border-l border-r border-b border-brand-surface">
                  <Loader2 className="h-6 w-6 animate-spin text-[#FF5800]" />
                </div>
              ) : invoices.length === 0 ? (
                <div className="flex items-center justify-center p-8 border-l border-r border-b border-brand-surface">
                  <p className="text-xs md:text-sm text-white/60 font-mono">
                    No invoices yet
                  </p>
                </div>
              ) : (
                invoices.map((invoice) => (
                  <div key={invoice.id} className="flex w-full">
                    <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-l border-r border-b border-brand-surface flex-[1.5] p-3 md:p-4">
                      <p className="text-xs md:text-sm font-mono text-white">
                        {invoice.date}
                      </p>
                    </div>
                    <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-r border-b border-brand-surface flex-1 p-3 md:p-4">
                      <p className="text-xs md:text-sm font-mono text-white uppercase">
                        {invoice.total}
                      </p>
                    </div>
                    <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-r border-b border-brand-surface flex-1 p-3 md:p-4">
                      <p className="text-xs md:text-sm font-mono text-white uppercase">
                        {invoice.status}
                      </p>
                    </div>
                    <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-r border-b border-brand-surface flex-1 p-3 md:p-4">
                      <button
                        type="button"
                        onClick={() => handleViewInvoice(invoice)}
                        className="text-xs md:text-sm font-mono text-white underline uppercase hover:text-white/80 transition-colors"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </BrandCard>

      {/* ============================================================
       * COMMENTED OUT: Auto Top-Up and Payment Method Setup
       *
       * The following code has been commented out as per new requirements.
       * The "Buy Credits" functionality now redirects to Stripe Checkout
       * instead of using modals with saved payment methods.
       *
       * To restore this functionality, uncomment the code below and
       * the corresponding imports at the top of the file.
       * ============================================================ */}

      {/*
      // --- COMMENTED OUT STATE VARIABLES ---
      // Add these to the component state if restoring:
      //
      // const [autoTopUp, setAutoTopUp] = useState(false);
      // const [showBuyCreditsModal, setShowBuyCreditsModal] = useState(false);
      // const [showAutoTopUpModal, setShowAutoTopUpModal] = useState(false);
      // const [showUpdatePaymentModal, setShowUpdatePaymentModal] = useState(false);
      // const [autoTopUpAmount, setAutoTopUpAmount] = useState(0);
      // const [autoTopUpThreshold, setAutoTopUpThreshold] = useState(0);
      // const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
      // const [defaultPaymentMethodId, setDefaultPaymentMethodId] = useState<string | null>(null);
      // const [loading, setLoading] = useState(true);
      // const [loadingAutoTopUp, setLoadingAutoTopUp] = useState(false);
      // const [triggeringAutoTopUp, setTriggeringAutoTopUp] = useState(false);
      // const [simulatingUsage, setSimulatingUsage] = useState(false);

      // --- COMMENTED OUT IMPORTS ---
      // import { CreditCard } from "lucide-react";
      // import { Switch } from "@/components/ui/switch";
      // import { BuyCreditsModal, AutoTopUpModal, UpdatePaymentModal } from "../modals";
      // import type { PaymentFormData } from "../modals/update-payment-modal";

      // --- COMMENTED OUT FUNCTIONS ---

      // const getPaymentMethodDisplay = () => {
      //   if (paymentMethods.length === 0) return "No payment method";
      //   const defaultPM = paymentMethods.find(
      //     (pm) => pm.id === defaultPaymentMethodId,
      //   );
      //   if (!defaultPM)
      //     return paymentMethods[0]?.card
      //       ? `${paymentMethods[0].card.brand}···${paymentMethods[0].card.last4}`
      //       : "Card on file";
      //   return defaultPM.card
      //     ? `${defaultPM.card.brand}···${defaultPM.card.last4}`
      //     : "Card on file";
      // };
      //
      // const paymentMethod = getPaymentMethodDisplay();

      // const fetchPaymentMethods = async () => {
      //   try {
      //     const response = await fetch("/api/payment-methods/list");
      //     if (response.ok) {
      //       const data = await response.json();
      //       setPaymentMethods(data.paymentMethods || []);
      //       setDefaultPaymentMethodId(data.defaultPaymentMethodId);
      //     }
      //   } catch (error) {
      //     console.error("Error fetching payment methods:", error);
      //   } finally {
      //     setLoading(false);
      //   }
      // };

      // const fetchAutoTopUpSettings = async () => {
      //   try {
      //     const response = await fetch("/api/auto-top-up/settings");
      //     if (response.ok) {
      //       const data = await response.json();
      //       setAutoTopUp(data.enabled || false);
      //       setAutoTopUpAmount(data.amount || 0);
      //       setAutoTopUpThreshold(data.threshold || 0);
      //     }
      //   } catch (error) {
      //     console.error("Error fetching auto top-up settings:", error);
      //   }
      // };

      // const handleOpenBuyCredits = () => {
      //   if (paymentMethods.length === 0) {
      //     toast.error("Please add a payment method first");
      //     setShowUpdatePaymentModal(true);
      //     return;
      //   }
      //   setShowBuyCreditsModal(true);
      // };

      // const handleBuyCreditsModal = async (amount: number) => {
      //   try {
      //     const response = await fetch("/api/purchases/create", {
      //       method: "POST",
      //       headers: { "Content-Type": "application/json" },
      //       body: JSON.stringify({
      //         amount,
      //         paymentMethodId: defaultPaymentMethodId,
      //         confirmImmediately: true,
      //       }),
      //     });

      //     if (!response.ok) {
      //       const error = await response.json();
      //       throw new Error(error.error || "Failed to create purchase");
      //     }

      //     const data = await response.json();

      //     if (data.status === "succeeded") {
      //       toast.success(
      //         `Successfully purchased $${amount.toFixed(2)} in credits`,
      //       );
      //       await fetchBalance();
      //       await fetchInvoices();
      //       router.refresh();
      //     } else {
      //       toast.info(
      //         `Payment is ${data.status}. Credits will be added when payment completes.`,
      //       );
      //     }
      //   } catch (error) {
      //     console.error("Error buying credits:", error);
      //     toast.error(
      //       error instanceof Error ? error.message : "Failed to purchase credits",
      //     );
      //   }
      // };

      // const handleEditPayment = () => {
      //   setShowUpdatePaymentModal(true);
      // };

      // const handleUpdatePayment = async (paymentData: PaymentFormData) => {
      //   await fetchPaymentMethods();
      // };

      // const handleEditAutoTopUp = () => {
      //   setShowAutoTopUpModal(true);
      // };

      // const handleUpdateAutoTopUp = async (
      //   enabled: boolean,
      //   amount: number,
      //   threshold: number,
      // ) => {
      //   try {
      //     setLoadingAutoTopUp(true);
      //     const response = await fetch("/api/auto-top-up/settings", {
      //       method: "POST",
      //       headers: { "Content-Type": "application/json" },
      //       body: JSON.stringify({ enabled, amount, threshold }),
      //     });

      //     if (!response.ok) {
      //       const error = await response.json();
      //       throw new Error(error.error || "Failed to update settings");
      //     }

      //     const data = await response.json();
      //     setAutoTopUp(data.settings.enabled);
      //     setAutoTopUpAmount(data.settings.amount);
      //     setAutoTopUpThreshold(data.settings.threshold);
      //     toast.success("Auto-top up settings updated successfully");
      //   } catch (error) {
      //     console.error("Error updating auto top-up:", error);
      //     toast.error(
      //       error instanceof Error ? error.message : "Failed to update settings",
      //     );
      //   } finally {
      //     setLoadingAutoTopUp(false);
      //   }
      // };

      // const handleToggleAutoTopUp = async (checked: boolean) => {
      //   try {
      //     setLoadingAutoTopUp(true);
      //     const response = await fetch("/api/auto-top-up/settings", {
      //       method: "POST",
      //       headers: { "Content-Type": "application/json" },
      //       body: JSON.stringify({ enabled: checked }),
      //     });

      //     if (!response.ok) {
      //       const error = await response.json();
      //       throw new Error(error.error || "Failed to toggle auto top-up");
      //     }

      //     setAutoTopUp(checked);
      //     toast.success(`Auto-top up ${checked ? "enabled" : "disabled"}`);
      //   } catch (error) {
      //     console.error("Error toggling auto top-up:", error);
      //     toast.error(
      //       error instanceof Error ? error.message : "Failed to toggle auto top-up",
      //     );
      //     setAutoTopUp(!checked);
      //   } finally {
      //     setLoadingAutoTopUp(false);
      //   }
      // };

      // const handleTriggerAutoTopUp = async () => {
      //   if (!autoTopUp) {
      //     toast.error("Auto top-up is not enabled");
      //     return;
      //   }

      //   try {
      //     setTriggeringAutoTopUp(true);
      //     toast.info("Checking if auto top-up is needed...");
      //     const response = await fetch("/api/auto-top-up/trigger", {
      //       method: "POST",
      //       headers: { "Content-Type": "application/json" },
      //     });

      //     const data = await response.json();

      //     if (response.ok && data.success) {
      //       toast.success(data.message || "Auto top-up triggered successfully");
      //       await fetchBalance();
      //       await fetchInvoices();
      //       router.refresh();
      //     } else {
      //       toast.error(
      //         data.error || data.message || "Failed to trigger auto top-up",
      //       );
      //     }
      //   } catch (error) {
      //     console.error("Error triggering auto top-up:", error);
      //     toast.error(
      //       error instanceof Error
      //         ? error.message
      //         : "Failed to trigger auto top-up",
      //     );
      //   } finally {
      //     setTriggeringAutoTopUp(false);
      //   }
      // };

      // const handleSimulateUsage = async () => {
      //   try {
      //     setSimulatingUsage(true);

      //     const amountToDeduct = Math.max(balance - autoTopUpThreshold + 0.5, 1.0);
      //     toast.info(
      //       `Deducting $${amountToDeduct.toFixed(2)} to trigger auto top-up...`,
      //     );

      //     const response = await fetch("/api/auto-top-up/simulate-usage", {
      //       method: "POST",
      //       headers: { "Content-Type": "application/json" },
      //       body: JSON.stringify({ amount: amountToDeduct }),
      //     });

      //     const data = await response.json();

      //     if (response.ok && data.success) {
      //       toast.success(
      //         `${data.message}. New balance: $${data.newBalance.toFixed(2)}`,
      //       );
      //       if (autoTopUp && data.newBalance < autoTopUpThreshold) {
      //         toast.info(
      //           "Balance below threshold, auto top-up should trigger shortly...",
      //         );
      //       }
      //       await fetchBalance();
      //       await fetchInvoices();
      //       router.refresh();
      //     } else {
      //       toast.error(data.error || data.message || "Failed to simulate usage");
      //     }
      //   } catch (error) {
      //     console.error("Error simulating usage:", error);
      //     toast.error(
      //       error instanceof Error ? error.message : "Failed to simulate usage",
      //     );
      //   } finally {
      //     setSimulatingUsage(false);
      //   }
      // };

      // --- COMMENTED OUT UI: Payment Method Section ---
      // Replace the "Add credits to your account" section with this if restoring:
      //
      // <div className="flex flex-col gap-4">
      //   <p className="text-base font-mono text-[#e1e1e1]">Charged to</p>
      //   <div className="flex flex-col md:flex-row items-stretch gap-4">
      //     <div
      //       className={`border ${paymentMethods.length === 0 ? "border-white/20" : "border-brand-surface"} flex items-center justify-between gap-2 px-3 py-2.5 w-full md:flex-1 md:max-w-xs`}
      //     >
      //       <div className="flex items-center gap-2 min-w-0 flex-1">
      //         <CreditCard
      //           className={`h-4 w-4 flex-shrink-0 ${paymentMethods.length === 0 ? "text-white/40" : "text-[#A2A2A2]"}`}
      //         />
      //         <p
      //           className={`text-sm md:text-base font-mono tracking-tight truncate ${paymentMethods.length === 0 ? "text-white/60" : "text-[#e1e1e1]"}`}
      //         >
      //           {paymentMethod}
      //         </p>
      //       </div>
      //       <button
      //         type="button"
      //         onClick={handleEditPayment}
      //         className="text-sm font-mono text-white underline hover:text-white/80 transition-colors flex-shrink-0"
      //       >
      //         {paymentMethods.length === 0 ? "Add Card" : "Edit"}
      //       </button>
      //     </div>
      //     <button
      //       type="button"
      //       onClick={handleOpenBuyCredits}
      //       className="relative bg-[#e1e1e1] px-4 py-2.5 overflow-hidden hover:bg-white transition-colors w-full md:w-auto flex-shrink-0"
      //     >
      //       <div
      //         className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
      //         style={{
      //           backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
      //           backgroundSize: "2.915576934814453px 2.915576934814453px",
      //         }}
      //       />
      //       <span className="relative z-10 text-black font-mono font-medium text-base whitespace-nowrap">
      //         Buy credits
      //       </span>
      //     </button>
      //   </div>
      // </div>

      // --- COMMENTED OUT UI: Auto Top-Up Section ---
      // Add this after the payment method section if restoring:
      //
      // <div className="flex flex-col gap-4">
      //   <div className="flex items-start justify-between gap-4">
      //     <div className="flex-1 flex flex-col gap-2">
      //       <p className="text-base font-mono text-[#e1e1e1]">
      //         Auto-top up
      //       </p>
      //       <p className="text-sm text-white/60">
      //         Automatically recharge your balance when it drops below
      //         threshold - no manual action needed
      //       </p>
      //     </div>
      //     <Switch
      //       checked={autoTopUp}
      //       onCheckedChange={handleToggleAutoTopUp}
      //       disabled={loadingAutoTopUp || paymentMethods.length === 0}
      //       className="data-[state=checked]:bg-[#FF5800] flex-shrink-0"
      //     />
      //   </div>
      //   <div className="flex flex-col sm:flex-row items-start gap-4 flex-wrap">
      //     <button
      //       type="button"
      //       onClick={handleSimulateUsage}
      //       disabled={simulatingUsage}
      //       className="text-xs font-mono text-white/60 underline hover:text-white/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
      //     >
      //       {simulatingUsage ? "Simulating..." : "Simulate usage"}
      //     </button>
      //     <button
      //       type="button"
      //       onClick={handleTriggerAutoTopUp}
      //       disabled={!autoTopUp || triggeringAutoTopUp}
      //       className="text-xs font-mono text-white/60 underline hover:text-white/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
      //     >
      //       {triggeringAutoTopUp ? "Testing..." : "Test now"}
      //     </button>
      //     <button
      //       type="button"
      //       onClick={handleEditAutoTopUp}
      //       className="text-xs font-mono text-white/60 underline hover:text-white/80 transition-colors whitespace-nowrap"
      //     >
      //       Edit auto-top up
      //     </button>
      //   </div>
      // </div>

      // --- COMMENTED OUT: Modal Components ---
      // Add these at the end of the return statement if restoring:
      //
      // <BuyCreditsModal
      //   open={showBuyCreditsModal}
      //   onOpenChange={setShowBuyCreditsModal}
      //   currentBalance={balance}
      //   paymentMethod={paymentMethod}
      //   onBuyCredits={handleBuyCreditsModal}
      // />
      // <AutoTopUpModal
      //   open={showAutoTopUpModal}
      //   onOpenChange={setShowAutoTopUpModal}
      //   currentAutoTopUp={autoTopUp}
      //   currentAmount={autoTopUpAmount}
      //   currentThreshold={autoTopUpThreshold}
      //   onUpdate={handleUpdateAutoTopUp}
      // />
      // <UpdatePaymentModal
      //   open={showUpdatePaymentModal}
      //   onOpenChange={setShowUpdatePaymentModal}
      //   currentPaymentMethod={paymentMethod}
      //   userEmail={user.email}
      //   onUpdate={handleUpdatePayment}
      // />
      */}
    </div>
  );
}
