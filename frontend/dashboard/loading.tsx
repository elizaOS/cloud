import { Loader2 } from "lucide-react";

/**
 * Loading UI for dashboard routes.
 * Shown during client-side navigation while RSC payloads stream in.
 * Prevents "hanging navigation" where NextTopLoader fires but content never appears.
 */
export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF5800]" />
        <p className="text-sm text-white/40">Loading…</p>
      </div>
    </div>
  );
}
