import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { VoicePageClient } from "@/components/voices/voice-page-client";
import { organizationsService } from "@/lib/services";
import type { Voice } from "@/components/voices/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Voice Studio",
  description:
    "Clone your voice and create custom AI voices for text-to-speech",
};

export default async function VoicesPage() {
  const user = await requireAuth();

  // Fetch user's voices directly from service (server-side)
  const { voiceCloningService } = await import("@/lib/services/voice-cloning");

  let voices: Voice[] = [];
  try {
    const userVoices = await voiceCloningService.getUserVoices({
      organizationId: user.organization_id,
      includeInactive: false,
    });

    // Format for client component - ensure dates are properly serialized
    voices = userVoices.map((voice) => ({
      id: voice.id,
      elevenlabsVoiceId: voice.elevenlabsVoiceId,
      name: voice.name,
      description: voice.description,
      cloneType: voice.cloneType,
      sampleCount: voice.sampleCount,
      totalAudioDurationSeconds: voice.totalAudioDurationSeconds,
      audioQualityScore: voice.audioQualityScore,
      usageCount: voice.usageCount,
      lastUsedAt: voice.lastUsedAt
        ? new Date(voice.lastUsedAt).toISOString()
        : null,
      isActive: voice.isActive,
      isPublic: voice.isPublic,
      createdAt: new Date(voice.createdAt).toISOString(), // Convert to ISO string for consistent parsing
    }));
  } catch (error) {
    console.error("Failed to fetch voices:", error);
  }

  // Get organization for credit balance
  const organization = await organizationsService.getById(user.organization_id);

  return (
    <VoicePageClient
      initialVoices={voices}
      creditBalance={Number(organization?.credit_balance || 0)}
    />
  );
}
