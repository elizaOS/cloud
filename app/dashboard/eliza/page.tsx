import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { ElizaPageClient } from "@/components/chat/eliza-page-client";

export const metadata: Metadata = {
  title: "Eliza Agent",
  description:
    "Chat with Eliza using the full ElizaOS runtime with persistent memory and room-based conversations",
};

export default async function ElizaPage() {
  await requireAuth();

  return <ElizaPageClient />;
}
