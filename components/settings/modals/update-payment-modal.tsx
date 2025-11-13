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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, X, CheckSquare, Loader2 } from "lucide-react";
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import { StripeCardElement } from "@/components/payment/stripe-card-element";
import { toast } from "sonner";

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

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "PT", name: "Portugal" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "IE", name: "Ireland" },
  { code: "PL", name: "Poland" },
  { code: "GR", name: "Greece" },
  { code: "CZ", name: "Czech Republic" },
  { code: "RO", name: "Romania" },
  { code: "HU", name: "Hungary" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "SI", name: "Slovenia" },
  { code: "SK", name: "Slovakia" },
  { code: "LT", name: "Lithuania" },
  { code: "LV", name: "Latvia" },
  { code: "EE", name: "Estonia" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "CY", name: "Cyprus" },
  { code: "JP", name: "Japan" },
  { code: "CN", name: "China" },
  { code: "IN", name: "India" },
  { code: "KR", name: "South Korea" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "TW", name: "Taiwan" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "VN", name: "Vietnam" },
  { code: "NZ", name: "New Zealand" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "PE", name: "Peru" },
  { code: "VE", name: "Venezuela" },
  { code: "ZA", name: "South Africa" },
  { code: "EG", name: "Egypt" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "IL", name: "Israel" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "TR", name: "Turkey" },
  { code: "RU", name: "Russia" },
  { code: "UA", name: "Ukraine" },
];

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
  const [country, setCountry] = useState("PT");
  const [addressLine1, setAddressLine1] = useState("");
  const [showLinkDropdown, setShowLinkDropdown] = useState(true);
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardError, setCardError] = useState<string | undefined>();

  const stripe = useStripe();
  const elements = useElements();

  const handleUpdate = async () => {
    if (selectedMethod !== "new-card") {
      const paymentData: PaymentFormData = {
        paymentMethod: selectedMethod,
        email: selectedMethod === "link" ? email : undefined,
        fullName,
        country,
        addressLine1,
      };
      onUpdate(paymentData);
      onOpenChange(false);
      return;
    }

    if (!stripe || !elements) {
      toast.error("Stripe not initialized");
      return;
    }

    if (!cardComplete) {
      toast.error("Please complete card details");
      return;
    }

    if (!fullName || !country || !addressLine1) {
      toast.error("Please fill in all billing information");
      return;
    }

    setLoading(true);

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("Card element not found");
      }

      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: {
          name: fullName,
          address: {
            line1: addressLine1,
            country: country,
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!paymentMethod) {
        throw new Error("Failed to create payment method");
      }

      const response = await fetch("/api/payment-methods/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to attach payment method");
      }

      toast.success("Payment method added successfully");

      const paymentData: PaymentFormData = {
        paymentMethod: "new-card",
        fullName,
        country,
        addressLine1,
      };
      onUpdate(paymentData);
      onOpenChange(false);
    } catch (error) {
      console.error("Error adding payment method:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to add payment method",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border border-brand-surface p-4 sm:p-6 md:p-10 max-w-[95vw] sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <CornerBrackets size="md" className="opacity-50" />

        <div className="relative z-10 flex flex-col gap-6 md:gap-10 items-center">
          {/* Title */}
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl font-mono font-bold text-[#e1e1e1] text-center tracking-tight">
              Update payment method
            </DialogTitle>
          </DialogHeader>

          {/* Content */}
          <div className="flex flex-col gap-4 md:gap-6 w-full">
            {/* Payment Method Selection */}
            <div className="flex flex-col gap-2">
              {/* Link Payment Method */}
              {showLinkDropdown && (
                <div className="backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] p-4 sm:p-6 relative">
                  <CornerBrackets size="sm" className="opacity-50" />

                  <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-white size-5 flex items-center justify-center flex-shrink-0">
                        <CheckSquare className="h-4 w-4 text-black fill-black" />
                      </div>
                      <p className="text-sm sm:text-base font-mono font-medium text-[#e1e1e1]">
                        link
                      </p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="flex items-center gap-1 min-w-0 flex-1 sm:flex-initial">
                        <p className="text-sm sm:text-base font-mono font-medium text-[rgba(225,225,225,0.5)] truncate">
                          {email}
                        </p>
                        <ChevronDown className="h-5 w-5 text-[#e1e1e1] flex-shrink-0" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowLinkDropdown(false)}
                        className="hover:opacity-80 transition-opacity flex-shrink-0"
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
                  px-4 sm:px-6 py-3 text-left hover:bg-[rgba(255,255,255,0.05)] transition-colors
                  ${selectedMethod === "existing-card" ? "bg-[rgba(255,255,255,0.08)]" : ""}
                `}
              >
                <p className="text-sm sm:text-base font-mono font-medium text-[#e1e1e1] break-words">
                  Use{" "}
                  <span className="text-[rgba(225,225,225,0.5)]">
                    {currentPaymentMethod}
                  </span>
                </p>
              </button>

              {/* Pay Another Way Option */}
              <button
                type="button"
                onClick={() => setSelectedMethod("new-card")}
                className={`
                  backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)]
                  px-4 sm:px-6 py-3 text-left hover:bg-[rgba(255,255,255,0.05)] transition-colors
                  ${selectedMethod === "new-card" ? "bg-[rgba(255,255,255,0.08)]" : ""}
                `}
              >
                <p className="text-sm sm:text-base font-mono font-medium text-[#e1e1e1]">
                  Pay another way
                </p>
              </button>
            </div>

            {/* Billing Information */}
            <div className="flex flex-col gap-4 md:gap-6">
              {/* Full Name */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm sm:text-base font-mono font-medium text-[#e1e1e1]">
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
                <Label className="text-sm sm:text-base font-mono font-medium text-[#e1e1e1]">
                  Country or region
                </Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="w-full backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] text-[#717171] h-11 font-mono">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] bg-neutral-950 border border-[rgba(255,255,255,0.15)]">
                    {COUNTRIES.map((country) => (
                      <SelectItem
                        key={country.code}
                        value={country.code}
                        className="font-mono text-xs sm:text-sm text-[#e1e1e1] hover:bg-[rgba(255,255,255,0.05)] focus:bg-[rgba(255,255,255,0.08)] cursor-pointer"
                      >
                        {country.code} ({country.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Address Line 1 */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm sm:text-base font-mono font-medium text-[#e1e1e1]">
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

              {/* Card Element - Only show when new-card is selected */}
              {selectedMethod === "new-card" && (
                <>
                  <StripeCardElement
                    onChange={(complete, error) => {
                      setCardComplete(complete);
                      setCardError(error);
                    }}
                  />
                  {cardError && (
                    <p className="text-xs text-red-500 font-mono">
                      {cardError}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="relative bg-[rgba(255,88,0,0.25)] px-6 py-3 hover:bg-[rgba(255,88,0,0.35)] transition-colors w-full sm:w-auto"
              >
                <CornerBrackets size="sm" className="opacity-70" />
                <span className="relative z-10 text-[#FF5800] font-mono font-medium text-sm sm:text-base whitespace-nowrap">
                  Cancel
                </span>
              </button>

              <button
                type="button"
                onClick={handleUpdate}
                disabled={
                  loading || (selectedMethod === "new-card" && !cardComplete)
                }
                className="bg-white px-6 py-3 hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                {loading && (
                  <Loader2 className="h-4 w-4 animate-spin text-black flex-shrink-0" />
                )}
                <span className="text-black font-mono font-medium text-sm sm:text-base whitespace-nowrap">
                  {loading ? "Processing..." : "Update"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
