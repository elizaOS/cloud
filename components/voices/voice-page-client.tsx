"use client";

import { useState } from "react";
import { VoiceManager } from "./voice-manager";
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
  const [voices, setVoices] = useState<Voice[]>(initialVoices);
  const [creditBalance, setCreditBalance] = useState(initialCreditBalance);

  useSetPageHeader({
    title: "Voice Studio",
    description: "Clone your voice and create custom AI voices",
  });

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      <div className="w-full max-w-[1400px] mx-auto px-6 py-6">
        <VoiceManager
          voices={voices}
          onVoicesChange={setVoices}
          creditBalance={creditBalance}
          onCreditBalanceChange={setCreditBalance}
        />
      </div>
    </div>
  );
}
