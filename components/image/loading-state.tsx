"use client";

import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="rounded-2xl border-2 bg-card overflow-hidden shadow-xl">
        <Skeleton className="w-full aspect-square" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>

      <div className="flex items-center justify-center gap-2 py-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">
          Creating your image...
        </p>
      </div>
    </div>
  );
}
