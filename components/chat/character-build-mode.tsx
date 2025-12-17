/**
 * Character build mode component with split-pane layout.
 * Combines build mode assistant and character editor in resizable panels.
 * Supports mobile responsive view switching.
 *
 * @param props - Character build mode configuration
 * @param props.initialCharacters - Initial list of characters
 */

"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { BuildModeAssistant } from "@/components/chat/build-mode-assistant";
import { CharacterEditor } from "@/components/chat/character-editor";
import { toast } from "sonner";
import {
  createCharacter,
  updateCharacter,
  getCharacter,
} from "@/app/actions/characters";
import type { ElizaCharacter } from "@/lib/types";
import { useChatStore } from "@/lib/stores/chat-store";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { MessageSquare, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { createDefaultCharacter } from "@/lib/utils/character-names";
import { useRouter } from "next/navigation";

interface CharacterBuildModeProps {
  initialCharacters: ElizaCharacter[];
  onUnsavedChanges?: (hasChanges: boolean) => void;
}

export function CharacterBuildMode({
  initialCharacters,
  onUnsavedChanges,
}: CharacterBuildModeProps) {
  const { selectedCharacterId } = useChatStore();
  const { user } = usePrivy();
  const userId = user?.id || "";
  const router = useRouter();

  // Ref to get the builder room ID from BuildModeAssistant
  const builderRoomIdRef = useRef<string | null>(null);

  // Mobile view state: 'assistant' or 'editor'
  const [mobileView, setMobileView] = useState<"assistant" | "editor">(
    "assistant",
  );

  // Derive character from selectedCharacterId - avoid setState in effect
  const initialCharacter = useMemo(() => {
    if (selectedCharacterId) {
      const char = initialCharacters.find((c) => c.id === selectedCharacterId);
      if (char) {
        return char;
      }
    }
    return createDefaultCharacter();
  }, [selectedCharacterId, initialCharacters]);

  // Creator mode: no selected character from database (creating new)
  // Build mode: editing an existing character from database
  const isCreatorMode = !selectedCharacterId;

  const [character, setCharacter] = useState<ElizaCharacter>(initialCharacter);

  // Track unsaved changes
  useEffect(() => {
    const hasChanges =
      JSON.stringify(character) !== JSON.stringify(initialCharacter);
    onUnsavedChanges?.(hasChanges);
  }, [character, initialCharacter, onUnsavedChanges]);

  // Update local state when derived character changes
  useEffect(() => {
    setCharacter(initialCharacter);
  }, [initialCharacter]);

  const handleCharacterUpdate = useCallback(
    (updates: Partial<ElizaCharacter>) => {
      setCharacter((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!character.name) {
      toast.error("Character name is required");
      return;
    }

    if (!character.bio) {
      toast.error("Character bio is required");
      return;
    }

    try {
      if (selectedCharacterId && character.id) {
        // Update existing character
        await updateCharacter(selectedCharacterId, character);
        toast.success("Character updated successfully!");
      } else {
        // Create new character (creator mode)
        const saved = await createCharacter(character);

        if (saved.id) {
          // Lock the builder room if we have one
          const roomId = builderRoomIdRef.current;
          if (roomId) {
            await fetch(`/api/eliza/rooms/${roomId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                metadata: {
                  locked: true,
                  createdCharacterId: saved.id,
                  createdCharacterName: saved.name,
                  lockedAt: Date.now(),
                },
              }),
            });
          }

          toast.success("Character created! Redirecting to chat...", {
            duration: 2000,
          });

          // Redirect to chat with the new agent
          router.push(`/dashboard/chat?characterId=${saved.id}`);
        }
      }
    } catch (error) {
      console.error("Error saving character:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save character. Please try again.",
      );
    }

    // Mark changes as saved after successful save
    onUnsavedChanges?.(false);
  }, [character, selectedCharacterId, onUnsavedChanges, router]);

  const handleCharacterRefresh = useCallback(async () => {
    if (!character.id) {
      console.warn("[CharacterBuildMode] No character ID to refresh");
      return;
    }

    const refreshedCharacter = await getCharacter(character.id);

    // Update local state with fresh data from database
    setCharacter(refreshedCharacter);
  }, [character.id]);

  // Callback to receive the builder room ID from BuildModeAssistant
  const handleRoomIdChange = useCallback((roomId: string) => {
    builderRoomIdRef.current = roomId;
  }, []);

  return (
    <div className="flex h-full w-full min-h-0 overflow-hidden flex-col">
      <Image
        className="z-20 pointer-events-none absolute top-0 right-0 left-0"
        fill
        sizes="100vw"
        src="/elipse.svg"
        alt="background-elipse-builder-mode"
      />

      {/* Mobile Toggle Bar */}
      <div className="lg:hidden flex border-b border-[#353535] bg-[#0A0A0A] shrink-0">
        <button
          onClick={() => setMobileView("assistant")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
            mobileView === "assistant"
              ? "bg-[#FF5800] text-white"
              : "text-white/60 hover:text-white hover:bg-white/5",
          )}
        >
          <MessageSquare className="h-4 w-4" />
          <span>AI Assistant</span>
        </button>
        <button
          onClick={() => setMobileView("editor")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-l border-[#353535]",
            mobileView === "editor"
              ? "bg-[#FF5800] text-white"
              : "text-white/60 hover:text-white hover:bg-white/5",
          )}
        >
          <FileCode2 className="h-4 w-4" />
          <span>Editor</span>
        </button>
      </div>

      {/* Mobile Single Panel View */}
      <div className="lg:hidden flex-1 overflow-hidden">
        {mobileView === "assistant" ? (
          <div className="flex h-full flex-col overflow-hidden">
            <BuildModeAssistant
              character={character}
              onCharacterUpdate={handleCharacterUpdate}
              onCharacterRefresh={handleCharacterRefresh}
              onRoomIdChange={handleRoomIdChange}
              userId={userId}
              isCreatorMode={isCreatorMode}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col overflow-hidden">
            <CharacterEditor
              character={character}
              onChange={setCharacter}
              onSave={handleSave}
            />
          </div>
        )}
      </div>

      {/* Desktop Resizable Split Pane Layout */}
      <div className="z-0 hidden lg:flex h-full w-full min-h-0 overflow-hidden flex-1">
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* Left Panel - AI Assistant Chat */}
          <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
            <div
              className="flex h-full flex-col overflow-hidden"
              data-onboarding="build-assistant"
            >
              <BuildModeAssistant
                character={character}
                onCharacterUpdate={handleCharacterUpdate}
                onCharacterRefresh={handleCharacterRefresh}
                onRoomIdChange={handleRoomIdChange}
                userId={userId}
                isCreatorMode={isCreatorMode}
              />
            </div>
          </ResizablePanel>

          {/* Resizable Handle */}
          <ResizableHandle withHandle />

          {/* Right Panel - Character Editor */}
          <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
            <div
              className="flex h-full flex-col overflow-hidden border-l"
              style={{ borderColor: "#353535" }}
              data-onboarding="build-editor"
            >
              <CharacterEditor
                character={character}
                onChange={setCharacter}
                onSave={handleSave}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
