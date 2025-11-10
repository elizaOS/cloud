"use client";

import { X, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useOnboardingStore } from "@/lib/stores/onboarding-store";
import { BrandCard } from "@/components/brand";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";

export function OnboardingChecklist() {
  const { checklistItems, checklistDismissed, dismissChecklist } =
    useOnboardingStore();
  const [collapsed, setCollapsed] = useState(false);

  if (checklistDismissed) {
    return null;
  }

  const completedCount = checklistItems.filter((item) => item.completed).length;
  const progressPercent = (completedCount / checklistItems.length) * 100;

  return (
    <BrandCard className="fixed bottom-4 right-4 w-96 z-50 bg-black/95 backdrop-blur-sm shadow-2xl">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-white text-lg">
              Getting Started
            </h3>
            <p className="text-sm text-white/60">
              {completedCount}/{checklistItems.length} completed
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-white/60 hover:text-white transition-colors p-1"
              aria-label={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={dismissChecklist}
              className="text-white/60 hover:text-white transition-colors p-1"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Progress value={progressPercent} className="h-2" />

        {!collapsed && (
          <ul className="space-y-3">
            {checklistItems.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <Checkbox
                  checked={item.completed}
                  className="mt-1"
                  disabled
                  aria-label={item.label}
                />
                <Link
                  href={item.url}
                  className="text-sm text-white hover:text-white/80 transition-colors flex-1 leading-relaxed"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {completedCount === checklistItems.length && (
          <div className="text-center text-sm text-green-400 font-medium pt-2 border-t border-white/10">
            🎉 Congratulations! You&apos;ve completed onboarding!
          </div>
        )}
      </div>
    </BrandCard>
  );
}
