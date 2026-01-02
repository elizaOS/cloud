import type { Metadata } from "next";
import { requireAuthWithOrg } from "@/lib/auth";
import { voiceCloningService } from "@/lib/services/voice-cloning";
import { generationsRepository } from "@/db/repositories/generations";
import { VoicePageClient } from "@/components/voices/voice-page-client";
import { organizationsService } from "@/lib/services/organizations";
import type { Voice } from "@/components/voices/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Voice Studio",
  description:
    "Clone your voice and create custom AI voices for text-to-speech",
};

/**
 * Voice Studio page for managing voice clones and creating custom AI voices.
 * Displays user's voices and provides voice cloning functionality.
 *
 * @returns The rendered voice studio page client component with initial voices and credit balance.
 */
export default async function VoicesPage() {
  const user = await requireAuthWithOrg();

  // Fetch user's voices directly from service (server-side)
  const userVoices = await voiceCloningService.getUserVoices({
    organizationId: user.organization_id,
    includeInactive: false,
  });

  // Format for client component - ensure dates are properly serialized
  const voices: Voice[] = userVoices.map((voice) => ({
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

  // Get organization for credit balance
  const organization = await organizationsService.getById(user.organization_id);

  // Fetch TTS generation history
  const ttsGenerations = await generationsRepository.listByOrganizationAndStatus(
    user.organization_id,
    "completed",
    { type: "tts", limit: 20 }
  );

  // Format TTS history for client - only include items with a valid storage URL
  const ttsHistory = ttsGenerations
    .filter((gen) => gen.storage_url && gen.storage_url.length > 0)
    .map((gen) => ({
      id: gen.id,
      url: gen.storage_url!,
      text: gen.prompt,
      voiceId: (gen.settings as Record<string, unknown>)?.voiceId as string || "default",
      voiceName: (gen.metadata as Record<string, unknown>)?.voiceName as string || "Default",
      createdAt: gen.created_at.toISOString(),
    }));

  return (
    <VoicePageClient
      initialVoices={voices}
      initialTtsHistory={ttsHistory}
      creditBalance={Number(organization?.credit_balance || 0)}
    />
  );
}
