"use client";

import { useEffect, useState } from "react";
import type { ReferralMeResponse } from "@/lib/types/referral-me";
import { fetchReferralMe } from "@/lib/utils/referral-me-fetch";

export interface UseDashboardReferralMeResult {
  referralMe: ReferralMeResponse | null;
  loadingReferral: boolean;
  referralFetchFailed: boolean;
}

export function useDashboardReferralMe(): UseDashboardReferralMeResult {
  const [referralMe, setReferralMe] = useState<ReferralMeResponse | null>(null);
  const [loadingReferral, setLoadingReferral] = useState(true);
  const [referralFetchFailed, setReferralFetchFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingReferral(true);
      setReferralFetchFailed(false);
      try {
        const parsed = await fetchReferralMe();
        if (!cancelled) {
          setReferralMe(parsed);
        }
      } catch {
        if (!cancelled) {
          setReferralFetchFailed(true);
          setReferralMe(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingReferral(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { referralMe, loadingReferral, referralFetchFailed };
}
