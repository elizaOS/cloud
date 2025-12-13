"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function BillingSuccessContent() {
  const router = useRouter();
  // session_id is available via useSearchParams() if needed for validation
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // Countdown to redirect
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/settings");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050109] p-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
          <CheckCircle2 className="h-8 w-8 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Payment Successful</h1>
        <p className="mt-3 text-white/60">
          Credits added to your account.
        </p>

        <div className="mt-6 text-sm text-white/40">
          Redirecting in {countdown}s
        </div>

        <button
          onClick={() => router.push("/settings")}
          className="mt-4 rounded-lg bg-brand px-6 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Go to Settings Now
        </button>
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#050109] p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-400" />
          </div>
        </div>
      }
    >
      <BillingSuccessContent />
    </Suspense>
  );
}
