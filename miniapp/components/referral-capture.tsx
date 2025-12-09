"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const REFERRAL_CODE_KEY = "pending_referral_code";

export function ReferralCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      localStorage.setItem(REFERRAL_CODE_KEY, refCode.toUpperCase());
    }
  }, [searchParams]);

  return null;
}

export function getPendingReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFERRAL_CODE_KEY);
}

export function clearPendingReferralCode(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REFERRAL_CODE_KEY);
}
