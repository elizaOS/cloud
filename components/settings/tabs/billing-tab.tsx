"use client";

import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { CreditCard } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import {
  BuyCreditsModal,
  AutoTopUpModal,
  UpdatePaymentModal,
} from "../modals";
import type { PaymentFormData } from "../modals/update-payment-modal";
import { toast } from "sonner";

interface BillingTabProps {
  user: UserWithOrganization;
}

interface Invoice {
  id: string;
  date: string;
  total: string;
  status: string;
}

export function BillingTab({ user }: BillingTabProps) {
  const [autoTopUp, setAutoTopUp] = useState(true);
  const [showBuyCreditsModal, setShowBuyCreditsModal] = useState(false);
  const [showAutoTopUpModal, setShowAutoTopUpModal] = useState(false);
  const [showUpdatePaymentModal, setShowUpdatePaymentModal] = useState(false);
  const [autoTopUpAmount, setAutoTopUpAmount] = useState(200);
  const [autoTopUpPeriodicity, setAutoTopUpPeriodicity] = useState("when-hits-0");
  
  // Mock data - replace with real data from API
  const balance = 200.24;
  const paymentMethod = "Visa···9605";
  
  const invoices: Invoice[] = [
    { id: "1", date: "Oct 11, 2025", total: "€18.00", status: "Paid" },
    { id: "2", date: "Sep 11, 2025", total: "€18.00", status: "Paid" },
    { id: "3", date: "Aug 11, 2025", total: "€18.00", status: "Paid" },
  ];

  const handleOpenBuyCredits = () => {
    setShowBuyCreditsModal(true);
  };

  const handleBuyCredits = (amount: number) => {
    // Buy credits logic - integrate with Stripe
    console.log("Buying credits:", amount);
    toast.success(`Successfully purchased $${amount.toFixed(2)} in credits`);
  };

  const handleEditPayment = () => {
    setShowUpdatePaymentModal(true);
  };

  const handleUpdatePayment = (paymentData: PaymentFormData) => {
    // Update payment method logic - integrate with Stripe
    console.log("Updating payment:", paymentData);
    toast.success("Payment method updated successfully");
  };

  const handleEditAutoTopUp = () => {
    setShowAutoTopUpModal(true);
  };

  const handleUpdateAutoTopUp = (
    enabled: boolean,
    amount: number,
    periodicity: string
  ) => {
    setAutoTopUp(enabled);
    setAutoTopUpAmount(amount);
    setAutoTopUpPeriodicity(periodicity);
    toast.success("Auto-top up settings updated successfully");
  };

  const handleViewInvoice = (invoiceId: string) => {
    // View invoice logic
    console.log("View invoice:", invoiceId);
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
                    Auto-reload your balance when it hits 0, by the amount you
                    set prior
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Switch
                    checked={autoTopUp}
                    onCheckedChange={setAutoTopUp}
                    className="data-[state=checked]:bg-[#FF5800]"
                  />
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
            {invoices.map((invoice, index) => (
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
                    onClick={() => handleViewInvoice(invoice.id)}
                    className="text-sm font-mono text-white underline uppercase hover:text-white/80 transition-colors"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
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
        currentPeriodicity={autoTopUpPeriodicity}
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
