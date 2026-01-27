import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { MessagingPageClient } from "@/components/messaging";

export const metadata: Metadata = {
  title: "Messaging Center",
  description: "View and manage SMS and iMessage conversations with your agents",
};

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

/**
 * Messaging page for viewing and managing phone conversations.
 */
export default async function MessagingPage() {
  await requireAuth();

  return <MessagingPageClient />;
}
