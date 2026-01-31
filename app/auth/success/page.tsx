"use client";

import { useEffect, useState } from "react";
import { CheckCircle, MessageCircle } from "lucide-react";

export default function AuthSuccessPage() {
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    // Try to close the window after a short delay
    // This works when the page was opened via window.open()
    const timer = setTimeout(() => {
      try {
        window.close();
      } catch {
        // If we can't close, show the manual close message
        setCanClose(true);
      }
      // If window.close() didn't work (opened in new tab), show message
      setCanClose(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-4">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-neutral-900/50 to-[#0A0A0A]" />
      <div className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl p-8">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-500/10">
            <CheckCircle className="h-7 w-7 text-green-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-white">
              Connection Successful
            </h2>
            <p className="text-sm text-neutral-400">
              Your account has been connected successfully.
            </p>
          </div>

          <div className="w-full p-4 bg-neutral-800/50 rounded-xl border border-white/5">
            <div className="flex items-center gap-3 text-left">
              <MessageCircle className="h-5 w-5 text-neutral-400 flex-shrink-0" />
              <p className="text-sm text-neutral-300">
                Return to your chat and say{" "}
                <span className="text-white font-medium">&quot;done&quot;</span>{" "}
                to verify the connection.
              </p>
            </div>
          </div>

          {canClose && (
            <p className="text-xs text-neutral-600">
              You can close this window.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
