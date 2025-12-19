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
import type { PreUploadedFile } from "@/lib/types/knowledge";
import { markKnowledgeProcessingPending } from "@/components/chat/hooks/use-knowledge-processing-status";

interface CharacterBuildModeProps {
  initialCharacters: ElizaCharacter[];
  onUnsavedChanges?: (hasChanges: boolean) => void;
}

export function CharacterBuildMode({
  initialCharacters,
  onUnsavedChanges,
}: CharacterBuildModeProps) {
  const { selectedCharacterId, setRoomId, setSelectedCharacterId } =
    useChatStore();
  const { user } = usePrivy();
  const userId = user?.id || "";
  const router = useRouter();

  // Ref to get the builder room ID from BuildModeAssistant
  const builderRoomIdRef = useRef<string | null>(null);

  // Track pending navigation after character creation to avoid race conditions
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );

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
  const [preUploadedFiles, setPreUploadedFiles] = useState<PreUploadedFile[]>([]);

  const handlePreUploadedFilesChange = useCallback((files: PreUploadedFile[]) => {
    setPreUploadedFiles(files);
  }, []);

  // Track unsaved changes (includes both character edits and pre-uploaded files)
  useEffect(() => {
    const hasCharacterChanges =
      JSON.stringify(character) !== JSON.stringify(initialCharacter);
    const hasFileChanges = preUploadedFiles.length > 0;
    onUnsavedChanges?.(hasCharacterChanges || hasFileChanges);
  }, [character, initialCharacter, preUploadedFiles.length, onUnsavedChanges]);

  // Update local state when derived character changes
  useEffect(() => {
    setCharacter(initialCharacter);
  }, [initialCharacter]);

  // Handle navigation after state updates have been committed
  // This avoids race conditions where router.push happens before state is applied
  useEffect(() => {
    if (pendingNavigation) {
      router.push(`/dashboard/chat?characterId=${pendingNavigation}`);
      setPendingNavigation(null);
    }
  }, [pendingNavigation, router]);

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
          // Queue pre-uploaded files for background processing
          if (preUploadedFiles.length > 0) {
            try {
              // Step 1: Queue the files
              const queueResponse = await fetch("/api/v1/knowledge/queue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  characterId: saved.id,
                  files: preUploadedFiles.map((f) => ({
                    blobUrl: f.blobUrl,
                    filename: f.filename,
                    contentType: f.contentType,
                    size: f.size,
                  })),
                }),
              });

              if (queueResponse.ok) {
                // Mark as pending so the polling hook shows completion toast
                markKnowledgeProcessingPending(saved.id);

                toast.success("Character created!", {
                  description: `Processing ${preUploadedFiles.length} file(s) for RAG knowledge base in background...`,
                  duration: 4000,
                });

                // Step 2: Immediately trigger processing (fire and forget)
                // This starts processing in the background without blocking the redirect
                fetch("/api/v1/knowledge/process-queue", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                }).catch(() => {
                  // Silent failure - cron job will pick it up
                });
              } else {
                toast.warning("Character created", {
                  description: "Failed to queue knowledge files - you can upload them later",
                  duration: 5000,
                });
              }
            } catch {
              toast.warning("Character created", {
                description: "Failed to queue knowledge files - you can upload them later from the Files tab",
                duration: 5000,
              });
            }
          }

          // Lock the builder room if we have one
          const roomId = builderRoomIdRef.current;
          if (roomId) {
            await fetch(`/api/eliza/rooms/${roomId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
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

          // Only show redirect toast if no files were queued (avoids duplicate success toasts)
          if (preUploadedFiles.length === 0) {
            toast.success("Character created! Redirecting to chat...", {
              duration: 2000,
            });
          }

          // Clear room and set new character BEFORE navigating
          // This ensures chat page starts fresh with no stale room data
          setRoomId(null);
          setSelectedCharacterId(saved.id);

          // Redirect to chat with the new agent
          router.push(`/dashboard/chat?characterId=${saved.id}`);
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save character. Please try again.",
      );
    }

    // Mark changes as saved after successful save
    onUnsavedChanges?.(false);
  }, [character, selectedCharacterId, onUnsavedChanges, router, setRoomId, setSelectedCharacterId, preUploadedFiles]);

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

  // Callback when character is created via AI assistant (CREATE_CHARACTER action)
  const handleCharacterCreated = useCallback(
    (characterId: string, _characterName: string) => {
      // Clear unsaved changes since character was saved by the agent
      onUnsavedChanges?.(false);

      // Update store state first
      setRoomId(null);
      setSelectedCharacterId(characterId);

      // Trigger navigation via useEffect to ensure state updates are committed first
      // This avoids race conditions where the next page renders with stale state
      setPendingNavigation(characterId);
    },
    [onUnsavedChanges, setRoomId, setSelectedCharacterId],
  );

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
              onCharacterCreated={handleCharacterCreated}
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
              preUploadedFiles={preUploadedFiles}
              onPreUploadedFilesChange={handlePreUploadedFilesChange}
            />
          </div>
        )}
      </div>

      {/* Desktop Resizable Split Pane Layout */}
      <div className="z-0 hidden lg:flex h-full w-full min-h-0 overflow-hidden flex-1">
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* Left Panel - AI Assistant Chat */}
          <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
            <div className="flex h-full flex-col overflow-hidden">
              <BuildModeAssistant
                character={character}
                onCharacterUpdate={handleCharacterUpdate}
                onCharacterRefresh={handleCharacterRefresh}
                onRoomIdChange={handleRoomIdChange}
                onCharacterCreated={handleCharacterCreated}
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
            >
              <CharacterEditor
                character={character}
                onChange={setCharacter}
                onSave={handleSave}
                preUploadedFiles={preUploadedFiles}
                onPreUploadedFilesChange={handlePreUploadedFilesChange}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
