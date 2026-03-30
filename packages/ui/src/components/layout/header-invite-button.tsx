/**
 * One-click copy of `{origin}/login?ref=…` for signed-in dashboard users.
 *
 * WHY lazy fetch on click (not on mount): Avoids an extra API call on every dashboard paint; most
 * sessions never use Invite.
 *
 * WHY cache + in-flight dedupe: Double-clicks or strict-mode remounts must not spam
 * `getOrCreateCode`; the promise ref collapses concurrent requests into one.
 *
 * WHY block copy when `!is_active`: Apply rejects inactive codes; sharing would waste invitees’ time.
 */
"use client";

import { BrandButton } from "@elizaos/cloud-ui";
import { Loader2, UserPlus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { parseReferralMeResponse, type ReferralMeResponse } from "@/lib/types/referral-me";

const REFERRALS_ME_PATH = "/api/v1/referrals";

export function HeaderInviteButton() {
  const [loading, setLoading] = useState(false);
  const cachedRef = useRef<ReferralMeResponse | null>(null);
  const inFlightRef = useRef<Promise<ReferralMeResponse> | null>(null);

  const resolveMe = useCallback(async (): Promise<ReferralMeResponse> => {
    if (cachedRef.current) {
      return cachedRef.current;
    }
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const promise = (async (): Promise<ReferralMeResponse> => {
      const res = await fetch(REFERRALS_ME_PATH, {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Request failed (${res.status})`);
      }
      const json: unknown = await res.json();
      const parsed = parseReferralMeResponse(json);
      if (!parsed) {
        throw new Error("Invalid response from server");
      }
      cachedRef.current = parsed;
      return parsed;
    })();

    inFlightRef.current = promise;
    const result = await promise.finally(() => {
      inFlightRef.current = null;
    });
    return result;
  }, []);

  const onClick = useCallback(async () => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    if (!origin) {
      toast.error("Could not build invite link");
      return;
    }

    setLoading(true);
    const me = await resolveMe().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not load invite link";
      toast.error(msg);
      return null;
    });
    setLoading(false);

    if (!me) return;

    if (!me.is_active) {
      toast.error("Your invite link is inactive and cannot be shared.");
      return;
    }

    const url = `${origin}/login?ref=${encodeURIComponent(me.code)}`;
    await navigator.clipboard.writeText(url).then(
      () => {
        toast.success("Invite link copied!");
      },
      () => {
        toast.error("Could not copy to clipboard");
      },
    );
  }, [resolveMe]);

  return (
    <BrandButton
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 shrink-0 border-white/10 bg-white/5 px-2 md:h-10 md:w-auto md:gap-2 md:px-3"
      onClick={() => void onClick()}
      disabled={loading}
      aria-label="Copy invite link"
      title="Copy invite link"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-white" />
      ) : (
        <UserPlus className="h-4 w-4 text-white" />
      )}
      <span className="hidden md:inline text-sm text-white">Invite</span>
    </BrandButton>
  );
}
