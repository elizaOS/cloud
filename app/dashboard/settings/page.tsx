import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { SettingsPageClient } from "@/components/settings/settings-page-client";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your account preferences, profile, and settings",
};

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireAuth();

  return <SettingsPageClient user={user} />;
}
