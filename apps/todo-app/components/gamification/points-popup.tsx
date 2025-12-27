"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

interface PointsPopupProps {
  points: number;
  onComplete?: () => void;
}

export function PointsPopup({ points, onComplete }: PointsPopupProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">
      <div className="animate-bounce bg-gradient-to-r from-primary to-orange-500 text-white px-6 py-4 rounded-2xl shadow-lg flex items-center gap-3">
        <Sparkles className="h-6 w-6" />
        <span className="text-2xl font-bold">+{points} points!</span>
        <Sparkles className="h-6 w-6" />
      </div>
    </div>
  );
}
