/**
 * Voice page client component with voice generator.
 * Manages credit balance state and displays voice generation interface.
 *
 * @param props - Voice page client configuration
 * @param props.initialVoices - Initial list of voices
 * @param props.creditBalance - Initial credit balance
 */

"use client";

import { useState } from "react";
import { VoiceGeneratorAdvanced } from "./voice-generator-advanced";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import type { Voice } from "./types";

export interface TtsHistoryItem {
  id: string;
  url: string;
  text: string;
  voiceId: string;
  voiceName: string;
  createdAt: string;
}

interface VoicePageClientProps {
  initialVoices: Voice[];
  initialTtsHistory?: TtsHistoryItem[];
  creditBalance: number;
}

export function VoicePageClient({
  initialVoices,
  initialTtsHistory = [],
  creditBalance: initialCreditBalance,
}: VoicePageClientProps) {
  const [creditBalance, setCreditBalance] = useState(initialCreditBalance);
  const [voices, setVoices] = useState<Voice[]>(initialVoices);

  useSetPageHeader({
    title: "Voice Studio",
    description: "Generate speech from text or clone your voice",
  });

  const handleVoiceCreated = (newVoice: Voice) => {
    setVoices([newVoice, ...voices]);
  };

  return (
    <div className="w-full flex flex-col pb-6 md:pb-8">
      <VoiceGeneratorAdvanced
        voices={voices}
        initialTtsHistory={initialTtsHistory}
        creditBalance={creditBalance}
        onCreditBalanceChange={setCreditBalance}
        onVoiceCreated={handleVoiceCreated}
      />
    </div>
  );
}
