import { parseReferralMeResponse, type ReferralMeResponse } from "@/lib/types/referral-me";

export const REFERRALS_ME_API_PATH = "/api/v1/referrals";

/**
 * Authenticated GET `/api/v1/referrals` from the browser. Throws on network/HTTP/parse errors.
 */
export async function fetchReferralMe(): Promise<ReferralMeResponse> {
  const res = await fetch(REFERRALS_ME_API_PATH, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Request failed (${res.status})`);
  }
  const json = await res.json();
  const parsed = parseReferralMeResponse(json);
  if (!parsed) {
    throw new Error("Invalid response from server");
  }
  return parsed;
}
