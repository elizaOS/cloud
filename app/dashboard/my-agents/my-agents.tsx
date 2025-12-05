"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MyAgentsView } from "@/components/marketplace";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import type { ExtendedCharacter } from "@/lib/types/my-agents";
import { toast } from "sonner";

export function MyAgentsClient() {
  const router = useRouter();
  const claimAttempted = useRef(false);

  useSetPageHeader({
    title: "My Agents",
    description:
      "Manage and interact with your personal AI agents.",
  });

  // Claim any affiliate characters the user has interacted with
  useEffect(() => {
    if (claimAttempted.current) return;
    claimAttempted.current = true;

    // Get session token from localStorage (set during anonymous chat)
    let sessionToken: string | null = null;
    try {
      sessionToken = localStorage.getItem("eliza-anon-session-token");
    } catch (e) {
      console.warn("[My Agents] Failed to read localStorage:", e);
    }

    fetch("/api/my-agents/claim-affiliate-characters", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionToken: sessionToken || undefined }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.claimed?.length > 0) {
          console.log("[My Agents] 🎯 Claimed affiliate characters:", data.claimed);
          toast.success(
            `${data.claimed.length} agent(s) added to your library!`,
            {
              description: data.claimed.map((c: { name: string }) => c.name).join(", "),
            }
          );
          // Trigger a refresh of the character list
          window.dispatchEvent(new CustomEvent("characters-updated"));

          // Clean up localStorage after successful claim
          if (sessionToken) {
            try {
              localStorage.removeItem("eliza-anon-session-token");
              console.log("[My Agents] Cleaned up session token from localStorage");
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        }
      })
      .catch((error) => {
        console.error("[My Agents] Failed to claim affiliate characters:", error);
        // Silent failure - this is a background optimization
      });
  }, []);

  const handleSelectCharacter = useCallback(
    async (character: ExtendedCharacter) => {
      try {
        toast.success(`Opening chat with ${character.name}...`);

        router.push(`/dashboard/chat?characterId=${character.id}`);
      } catch (error) {
        console.error("[My Agents] Error navigating to chat:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to open chat",
        );
      }
    },
    [router],
  );

  const handleCloneCharacter = useCallback(
    async (character: ExtendedCharacter) => {
      try {
        const response = await fetch(
          `/api/my-agents/characters/${character.id}/clone`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to clone character");
        }

        const result = await response.json();
        toast.success(`Cloned ${character.name} to your library`);
      } catch (error) {
        console.error("[My Agents] Error cloning character:", error);
        throw error;
      }
    },
    [],
  );

  return (
    <MyAgentsView
      onSelectCharacter={handleSelectCharacter}
      onCloneCharacter={handleCloneCharacter}
      isCollapsed={false}
    />
  );
}
