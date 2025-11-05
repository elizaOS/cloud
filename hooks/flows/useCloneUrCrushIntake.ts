"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ElizaCharacter } from "@/lib/types";
import { CLONE_UR_CRUSH_CHARACTER_KEY, ELIZA_ROOM_ID } from "@/lib/constants/storage";
import { createCharacter } from "@/app/actions/characters";

interface UseCloneYourCrushIntakeOptions {
  isAuthenticated: boolean;
  onSaved?: (saved: ElizaCharacter) => void;
}

interface UseCloneYourCrushIntakeResult {
  pendingCharacter: ElizaCharacter | null;
  isSaving: boolean;
}

export function useCloneUrCrushIntake(
  options: UseCloneYourCrushIntakeOptions,
): UseCloneYourCrushIntakeResult {
  const { isAuthenticated, onSaved } = options;
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pendingCharacter, setPendingCharacter] = useState<ElizaCharacter | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Effect 1: Process character from URL (runs once)
  useEffect(() => {
    const source = searchParams.get("source");
    const characterParam = searchParams.get("character");

    if (source === "clone-ur-crush" && characterParam) {
      try {
        const decoded = decodeURIComponent(atob(characterParam));
        const characterData = JSON.parse(decoded) as ElizaCharacter;

        // Store in localStorage so we can resume after auth
        localStorage.setItem(CLONE_UR_CRUSH_CHARACTER_KEY, JSON.stringify(characterData));

        // If unauthenticated, surface modal via pending character
        if (!isAuthenticated) {
          setPendingCharacter(characterData);
        }

        // Clean up URL after a brief tick
        setTimeout(() => {
          router.replace("/dashboard/eliza?source=clone-ur-crush", { scroll: false });
        }, 100);
      } catch (err) {
        console.error("[CLONE_UR_CRUSH] Failed to parse character from URL:", err);
      }
    }
    // We intentionally run once: URL source payload is handled on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 2: When authenticated, persist and produce initialCharacterId via onSaved
  useEffect(() => {
    if (!isAuthenticated || isSaving) return;

    const cached = localStorage.getItem(CLONE_UR_CRUSH_CHARACTER_KEY);
    if (!cached) return;

    setIsSaving(true);
    setPendingCharacter(null); // Close any modal

    try {
      const characterData = JSON.parse(cached) as ElizaCharacter;
      createCharacter(characterData)
        .then((saved) => {
          localStorage.removeItem(CLONE_UR_CRUSH_CHARACTER_KEY);
          localStorage.removeItem(ELIZA_ROOM_ID); // Force new room

          if (saved && saved.id) {
            onSaved?.(saved);
          }
        })
        .catch((error) => {
          console.error("[CLONE_UR_CRUSH] Failed to save character:", error);
        })
        .finally(() => {
          setIsSaving(false);
        });
    } catch (err) {
      console.error("[CLONE_UR_CRUSH] Failed to parse cached character:", err);
      localStorage.removeItem(CLONE_UR_CRUSH_CHARACTER_KEY);
      setIsSaving(false);
    }
  }, [isAuthenticated, isSaving, onSaved]);

  return useMemo(
    () => ({ pendingCharacter, isSaving }),
    [pendingCharacter, isSaving],
  );
}


