import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { VoicePageClient } from "@/components/voices/voice-page-client";
import { organizationsService } from "@/lib/services";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Voice Studio",
  description:
    "Clone your voice and create custom AI voices for text-to-speech",
};

export default async function VoicesPage() {
  const user = await requireAuth();

  // Fetch user's voices
  let voices = [];
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/elevenlabs/voices/user`,
      {
        headers: {
          // Pass auth via internal request
          "x-user-id": user.id,
        },
        cache: "no-store",
      }
    );

    if (response.ok) {
      const data = await response.json();
      voices = data.voices || [];
    }
  } catch (error) {
    console.error("Failed to fetch voices:", error);
  }

  // Get organization for credit balance
  const organization = await organizationsService.getById(user.organization_id);

  return (
    <VoicePageClient
      initialVoices={voices}
      creditBalance={organization?.credit_balance || 0}
    />
  );
}
