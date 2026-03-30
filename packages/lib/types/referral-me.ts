/**
 * JSON body for GET /api/v1/referrals.
 *
 * WHY a dedicated type + parser: Fetch JSON is untrusted at the type level; `parseReferralMeResponse`
 * fails closed on wrong shapes instead of using `any`. WHY flat top-level fields: matches the API
 * contract documented in docs/referrals.md—do not nest the string `code` under an object key also
 * named `code`.
 */
export interface ReferralMeResponse {
  code: string;
  total_referrals: number;
  is_active: boolean;
}

export function parseReferralMeResponse(data: unknown): ReferralMeResponse | null {
  if (typeof data !== "object" || data === null) return null;
  const o = data as Record<string, unknown>;
  if (typeof o.code !== "string" || o.code.length === 0) return null;
  const tr = o.total_referrals;
  const totalReferrals = typeof tr === "number" ? tr : Number(tr);
  if (!Number.isFinite(totalReferrals)) return null;
  if (typeof o.is_active !== "boolean") return null;
  return {
    code: o.code,
    total_referrals: totalReferrals,
    is_active: o.is_active,
  };
}
