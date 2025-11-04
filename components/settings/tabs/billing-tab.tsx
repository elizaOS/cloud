"use client";

import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { CreditCard, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import {
  BuyCreditsModal,
  AutoTopUpModal,
  UpdatePaymentModal,
} from "../modals";
import type { PaymentFormData } from "../modals/update-payment-modal";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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

export function BillingTab({ user }: BillingTabProps) {
  const router = useRouter();
  const [autoTopUp, setAutoTopUp] = useState(false);
  const [showBuyCreditsModal, setShowBuyCreditsModal] = useState(false);
  const [showAutoTopUpModal, setShowAutoTopUpModal] = useState(false);
  const [showUpdatePaymentModal, setShowUpdatePaymentModal] = useState(false);
  const [autoTopUpAmount, setAutoTopUpAmount] = useState(0);
  const [autoTopUpThreshold, setAutoTopUpThreshold] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAutoTopUp, setLoadingAutoTopUp] = useState(false);
  const [triggeringAutoTopUp, setTriggeringAutoTopUp] = useState(false);
  const [simulatingUsage, setSimulatingUsage] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);

  const balance = Number(user.organization?.credit_balance || 0);

  // Get display string for payment method
  const getPaymentMethodDisplay = () => {
    if (paymentMethods.length === 0) return "No payment method";
    const defaultPM = paymentMethods.find(pm => pm.id === defaultPaymentMethodId);
    if (!defaultPM) return paymentMethods[0]?.card ? `${paymentMethods[0].card.brand}···${paymentMethods[0].card.last4}` : "Card on file";
    return defaultPM.card ? `${defaultPM.card.brand}···${defaultPM.card.last4}` : "Card on file";
  };

  const paymentMethod = getPaymentMethodDisplay();

  useEffect(() => {
    fetchPaymentMethods();
    fetchAutoTopUpSettings();
    fetchInvoices();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch('/api/payment-methods/list');
      if (response.ok) {
        const data = await response.json();
        setPaymentMethods(data.paymentMethods || []);
        setDefaultPaymentMethodId(data.defaultPaymentMethodId);
      }
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAutoTopUpSettings = async () => {
    try {
      const response = await fetch('/api/auto-top-up/settings');
      if (response.ok) {
        const data = await response.json();
        setAutoTopUp(data.enabled || false);
        setAutoTopUpAmount(data.amount || 0);
        setAutoTopUpThreshold(data.threshold || 0);
      }
    } catch (error) {
      console.error('Error fetching auto top-up settings:', error);
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoadingInvoices(true);
      const response = await fetch('/api/invoices/list');
      if (response.ok) {
        const data = await response.json();
        setInvoices(data.invoices || []);
      } else {
        console.error('Failed to fetch invoices');
        setInvoices([]);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleOpenBuyCredits = () => {
    if (paymentMethods.length === 0) {
      toast.error("Please add a payment method first");
      setShowUpdatePaymentModal(true);
      return;
    }
    setShowBuyCreditsModal(true);
  };

  const handleBuyCredits = async (amount: number) => {
    try {
      // Create payment intent
      const response = await fetch('/api/purchases/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentMethodId: defaultPaymentMethodId,
          confirmImmediately: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create purchase');
      }

      const data = await response.json();

      if (data.status === 'succeeded') {
        toast.success(`Successfully purchased $${amount.toFixed(2)} in credits`);
        // Refresh invoices list
        await fetchInvoices();
        // Trigger server-side refresh to get updated balance
        router.refresh();
      } else {
        toast.info(`Payment is ${data.status}. Credits will be added when payment completes.`);
      }
    } catch (error) {
      console.error('Error buying credits:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to purchase credits');
    }
  };

  const handleEditPayment = () => {
    setShowUpdatePaymentModal(true);
  };

  const handleUpdatePayment = async (paymentData: PaymentFormData) => {
    await fetchPaymentMethods();
  };

  const handleEditAutoTopUp = () => {
    setShowAutoTopUpModal(true);
  };

  const handleUpdateAutoTopUp = async (
    enabled: boolean,
    amount: number,
    threshold: number
  ) => {
    try {
      setLoadingAutoTopUp(true);
      const response = await fetch('/api/auto-top-up/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, amount, threshold }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update settings');
      }

      const data = await response.json();
      setAutoTopUp(data.settings.enabled);
      setAutoTopUpAmount(data.settings.amount);
      setAutoTopUpThreshold(data.settings.threshold);
      toast.success("Auto-top up settings updated successfully");
    } catch (error) {
      console.error('Error updating auto top-up:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update settings');
    } finally {
      setLoadingAutoTopUp(false);
    }
  };

  const handleToggleAutoTopUp = async (checked: boolean) => {
    try {
      setLoadingAutoTopUp(true);
      const response = await fetch('/api/auto-top-up/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: checked }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to toggle auto top-up');
      }

      setAutoTopUp(checked);
      toast.success(`Auto-top up ${checked ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error toggling auto top-up:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to toggle auto top-up');
      setAutoTopUp(!checked); // Revert on error
    } finally {
      setLoadingAutoTopUp(false);
    }
  };

  const handleViewInvoice = (invoice: Invoice) => {
    if (invoice.invoiceUrl) {
      window.open(invoice.invoiceUrl, '_blank');
    } else {
      toast.info("Invoice URL not available");
    }
  };

  const handleTriggerAutoTopUp = async () => {
    if (!autoTopUp) {
      toast.error("Auto top-up is not enabled");
      return;
    }

    try {
      setTriggeringAutoTopUp(true);
      toast.info("Checking if auto top-up is needed...");
      const response = await fetch('/api/auto-top-up/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(data.message || 'Auto top-up triggered successfully');
        await fetchInvoices();
        router.refresh();
      } else {
        toast.error(data.error || data.message || 'Failed to trigger auto top-up');
      }
    } catch (error) {
      console.error('Error triggering auto top-up:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to trigger auto top-up');
    } finally {
      setTriggeringAutoTopUp(false);
    }
  };

  const handleSimulateUsage = async () => {
    try {
      setSimulatingUsage(true);
      toast.info("Deducting $2.00 to simulate usage...");

      const response = await fetch('/api/auto-top-up/simulate-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 2.0 }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(`${data.message}. New balance: $${data.newBalance.toFixed(2)}`);
        if (autoTopUp && data.newBalance < autoTopUpThreshold) {
          toast.info("Balance below threshold, auto top-up should trigger shortly...");
        }
        await fetchInvoices();
        router.refresh();
      } else {
        toast.error(data.error || data.message || 'Failed to simulate usage');
      }
    } catch (error) {
      console.error('Error simulating usage:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to simulate usage');
    } finally {
      setSimulatingUsage(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
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
          <div className="flex gap-6 w-full">
            {/* Balance Display */}
            <div className="w-[400px] space-y-6">
              <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface py-6">
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

            {/* Right Section */}
            <div className="flex-1 flex flex-col justify-between">
              {/* Top Section - Payment Method & Buy Credits */}
              <div className="flex items-start justify-between">
                {/* Payment Method */}
                <div className="flex flex-col gap-2">
                  <p className="text-base font-mono text-[#e1e1e1]">
                    Charged to
                  </p>
                  <div className="border border-brand-surface flex items-center gap-4 px-2 py-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-[#A2A2A2]" />
                      <p className="text-base font-mono text-[#e1e1e1] tracking-tight">
                        {paymentMethod}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleEditPayment}
                      className="text-base font-mono text-white underline hover:text-white/80 transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {/* Buy Credits Button */}
                <button
                  type="button"
                  onClick={handleOpenBuyCredits}
                  className="relative bg-[#e1e1e1] px-3 py-2 overflow-hidden hover:bg-white transition-colors"
                >
                  <div
                    className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                    style={{
                      backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                      backgroundSize: "2.915576934814453px 2.915576934814453px",
                    }}
                  />
                  <span className="relative z-10 text-black font-mono font-medium text-base">
                    Buy credits
                  </span>
                </button>
              </div>

              {/* Bottom Section - Auto Top-Up */}
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 flex flex-col gap-2">
                  <p className="text-base font-mono text-[#e1e1e1]">
                    Auto-top up
                  </p>
                  <p className="text-sm text-white/60">
                    Automatically recharge your balance when it drops below threshold - no manual action needed
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Switch
                    checked={autoTopUp}
                    onCheckedChange={handleToggleAutoTopUp}
                    disabled={loadingAutoTopUp || paymentMethods.length === 0}
                    className="data-[state=checked]:bg-[#FF5800]"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSimulateUsage}
                      disabled={simulatingUsage}
                      className="text-base font-mono text-[#FF5800] underline hover:text-[#FF5800]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {simulatingUsage ? 'Simulating...' : 'Simulate usage'}
                    </button>
                    <button
                      type="button"
                      onClick={handleTriggerAutoTopUp}
                      disabled={!autoTopUp || triggeringAutoTopUp}
                      className="text-base font-mono text-[#FF5800] underline hover:text-[#FF5800]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {triggeringAutoTopUp ? 'Testing...' : 'Test now'}
                    </button>
                    <button
                      type="button"
                      onClick={handleEditAutoTopUp}
                      className="text-base font-mono text-white underline hover:text-white/80 transition-colors"
                    >
                      Edit auto-top up
                    </button>
                  </div>
                </div>
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
              Key items from spend automations, quota monitors, and provider
              health.
            </p>
          </div>

          {/* Table */}
          <div className="space-y-0 w-full">
            {/* Table Header */}
            <div className="flex w-full">
              <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface flex-[1.1] p-4">
                <p className="text-sm font-mono font-bold text-white uppercase">
                  Date
                </p>
              </div>
              <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t border-r border-b border-brand-surface flex-1 p-4">
                <p className="text-sm font-mono font-bold text-white uppercase">
                  Total
                </p>
              </div>
              <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t border-r border-b border-brand-surface flex-1 p-4">
                <p className="text-sm font-mono font-bold text-white uppercase">
                  Status
                </p>
              </div>
              <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t border-r border-b border-brand-surface flex-1 p-4">
                <p className="text-sm font-mono font-bold text-white uppercase">
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
                <p className="text-sm text-white/60 font-mono">No invoices yet</p>
              </div>
            ) : (
              invoices.map((invoice) => (
                <div key={invoice.id} className="flex w-full">
                  <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-l border-r border-b border-brand-surface flex-[1.1] p-4">
                    <p className="text-sm font-mono text-white uppercase">
                      {invoice.date}
                    </p>
                  </div>
                  <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-r border-b border-brand-surface flex-1 p-4">
                    <p className="text-sm font-mono text-white uppercase">
                      {invoice.total}
                    </p>
                  </div>
                  <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-r border-b border-brand-surface flex-1 p-4">
                    <p className="text-sm font-mono text-white uppercase">
                      {invoice.status}
                    </p>
                  </div>
                  <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-r border-b border-brand-surface flex-1 p-4">
                    <button
                      type="button"
                      onClick={() => handleViewInvoice(invoice)}
                      className="text-sm font-mono text-white underline uppercase hover:text-white/80 transition-colors"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </BrandCard>

      {/* Buy Credits Modal */}
      <BuyCreditsModal
        open={showBuyCreditsModal}
        onOpenChange={setShowBuyCreditsModal}
        currentBalance={balance}
        paymentMethod={paymentMethod}
        onBuyCredits={handleBuyCredits}
      />

      {/* Auto Top-Up Modal */}
      <AutoTopUpModal
        open={showAutoTopUpModal}
        onOpenChange={setShowAutoTopUpModal}
        currentAutoTopUp={autoTopUp}
        currentAmount={autoTopUpAmount}
        currentThreshold={autoTopUpThreshold}
        onUpdate={handleUpdateAutoTopUp}
      />

      {/* Update Payment Modal */}
      <UpdatePaymentModal
        open={showUpdatePaymentModal}
        onOpenChange={setShowUpdatePaymentModal}
        currentPaymentMethod={paymentMethod}
        onUpdate={handleUpdatePayment}
      />
    </div>
  );
}
