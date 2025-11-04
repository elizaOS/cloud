"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CornerBrackets } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, X, CheckSquare } from "lucide-react";

interface UpdatePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPaymentMethod: string;
  onUpdate: (paymentData: PaymentFormData) => void;
}

export interface PaymentFormData {
  paymentMethod: "link" | "existing-card" | "new-card";
  email?: string;
  fullName: string;
  country: string;
  addressLine1: string;
}

export function UpdatePaymentModal({
  open,
  onOpenChange,
  currentPaymentMethod,
  onUpdate,
}: UpdatePaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<
    "link" | "existing-card" | "new-card"
  >("link");
  const [email, setEmail] = useState("bil****@elizaos.ai");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("Portugal");
  const [addressLine1, setAddressLine1] = useState("");
  const [showLinkDropdown, setShowLinkDropdown] = useState(true);

  const handleUpdate = () => {
    const paymentData: PaymentFormData = {
      paymentMethod: selectedMethod,
      email: selectedMethod === "link" ? email : undefined,
      fullName,
      country,
      addressLine1,
    };
    onUpdate(paymentData);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border border-brand-surface p-10 max-w-[520px]">
        <CornerBrackets size="md" className="opacity-50" />

        <div className="relative z-10 flex flex-col gap-10 items-center">
          {/* Title */}
          <DialogHeader>
            <DialogTitle className="text-2xl font-mono font-bold text-[#e1e1e1] text-center tracking-tight">
              Update payment method
            </DialogTitle>
          </DialogHeader>

          {/* Content */}
          <div className="flex flex-col gap-6 w-full">
            {/* Payment Method Selection */}
            <div className="flex flex-col gap-2">
              {/* Link Payment Method */}
              {showLinkDropdown && (
                <div className="backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] p-6 relative">
                  <CornerBrackets size="xs" className="opacity-50" />
                  
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="bg-white size-5 flex items-center justify-center">
                        <CheckSquare className="h-4 w-4 text-black fill-black" />
                      </div>
                      <p className="text-base font-mono font-medium text-[#e1e1e1]">
                        link
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <p className="text-base font-mono font-medium text-[rgba(225,225,225,0.5)]">
                          {email}
                        </p>
                        <ChevronDown className="h-5 w-5 text-[#e1e1e1]" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowLinkDropdown(false)}
                        className="hover:opacity-80 transition-opacity"
                      >
                        <X className="h-5 w-5 text-[#e1e1e1]" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Existing Card Option */}
              <button
                type="button"
                onClick={() => setSelectedMethod("existing-card")}
                className={`
                  backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)]
                  px-6 py-3 text-left hover:bg-[rgba(255,255,255,0.05)] transition-colors
                  ${selectedMethod === "existing-card" ? "bg-[rgba(255,255,255,0.08)]" : ""}
                `}
              >
                <p className="text-base font-mono font-medium text-[#e1e1e1]">
                  Use <span className="text-[rgba(225,225,225,0.5)]">{currentPaymentMethod}</span>
                </p>
              </button>

              {/* Pay Another Way Option */}
              <button
                type="button"
                onClick={() => setSelectedMethod("new-card")}
                className={`
                  backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)]
                  px-6 py-3 text-left hover:bg-[rgba(255,255,255,0.05)] transition-colors
                  ${selectedMethod === "new-card" ? "bg-[rgba(255,255,255,0.08)]" : ""}
                `}
              >
                <p className="text-base font-mono font-medium text-[#e1e1e1]">
                  Pay another way
                </p>
              </button>
            </div>

            {/* Billing Information */}
            <div className="flex flex-col gap-6">
              {/* Full Name */}
              <div className="flex flex-col gap-2">
                <Label className="text-base font-mono font-medium text-[#e1e1e1]">
                  Full name
                </Label>
                <Input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] text-[#717171] h-11"
                  placeholder="Full name"
                />
              </div>

              {/* Country or Region */}
              <div className="flex flex-col gap-2">
                <Label className="text-base font-mono font-medium text-[#e1e1e1]">
                  Country or region
                </Label>
                <Input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] text-[#717171] h-11"
                  placeholder="Portugal"
                />
              </div>

              {/* Address Line 1 */}
              <div className="flex flex-col gap-2">
                <Label className="text-base font-mono font-medium text-[#e1e1e1]">
                  Address line 1
                </Label>
                <Input
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className="backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] text-[#717171] h-11"
                  placeholder="Address line 1"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 w-full justify-start">
              <button
                type="button"
                onClick={handleCancel}
                className="relative bg-[rgba(255,88,0,0.25)] px-6 py-3 hover:bg-[rgba(255,88,0,0.35)] transition-colors"
              >
                <CornerBrackets size="xs" className="opacity-70" />
                <span className="relative z-10 text-[#FF5800] font-mono font-medium text-base">
                  Cancel
                </span>
              </button>

              <button
                type="button"
                onClick={handleUpdate}
                className="bg-white px-6 py-3 hover:bg-white/90 transition-colors"
              >
                <span className="text-black font-mono font-medium text-base">
                  Update
                </span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

