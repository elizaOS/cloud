import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { ElizaChatRedesigned } from "@/components/chat/eliza-chat-redesigned";

export const metadata: Metadata = {
  title: "Eliza Chat (New Design)",
  description: "Preview of the redesigned chat interface based on Figma designs",
};

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

export default async function ElizaPreviewPage() {
  const user = await requireAuth();

  return (
    <div className="h-screen w-full overflow-hidden">
      <ElizaChatRedesigned />
    </div>
  );
}

