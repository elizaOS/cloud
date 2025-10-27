"use client";

import { useState } from "react";
import { VoiceStudioAdvanced } from "./voice-studio-advanced";
import { useSetPageHeader } from "@/components/layout/page-header-context";

interface Voice {
  id: string;
  elevenlabsVoiceId: string;
  name: string;
  description: string | null;
  cloneType: "instant" | "professional";
  sampleCount: number;
  usageCount: number;
  isActive: boolean;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
  audioQualityScore: string | null;
  totalAudioDurationSeconds: number | null;
}

interface VoicePageClientProps {
  initialVoices: Voice[];
  creditBalance: number;
}

export function VoicePageClient({
  initialVoices,
  creditBalance: initialCreditBalance,
}: VoicePageClientProps) {
  const [creditBalance, setCreditBalance] = useState(initialCreditBalance);

  useSetPageHeader({
    title: "Voice Studio",
    description: "Clone your voice and create custom AI voices",
  });

  return (
    <div className="flex flex-col w-full">
      <div className="w-full max-w-[1800px] mx-auto px-6 py-6">
        <VoiceStudioAdvanced
          initialVoices={initialVoices}
          creditBalance={creditBalance}
          onCreditBalanceChange={setCreditBalance}
        />
      </div>
    </div>
  );
}
