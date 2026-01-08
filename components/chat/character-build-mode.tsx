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
  initialCharacterId?: string;
  onUnsavedChanges?: (hasChanges: boolean) => void;
}

export function CharacterBuildMode({
  initialCharacters,
  initialCharacterId,
  onUnsavedChanges,
}: CharacterBuildModeProps) {
  const { setRoomId, setSelectedCharacterId } = useChatStore();

  // Parent uses key={initialCharacterId} to force remount on character change
  const effectiveCharacterId = initialCharacterId || null;
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

  // Store the default character in a ref to prevent it from changing between renders
  // This prevents pre-uploaded files from being cleared unexpectedly in creator mode
  const defaultCharacterRef = useRef<ElizaCharacter | null>(null);

  // Clear default character ref when switching to an existing character
  // This is done in a separate effect to avoid side effects in useMemo
  useEffect(() => {
    if (effectiveCharacterId) {
      defaultCharacterRef.current = null;
    }
  }, [effectiveCharacterId]);

  // Derive character from effectiveCharacterId - avoid setState in effect
  // Use effectiveCharacterId to get correct character on first render
  const initialCharacter = useMemo(() => {
    if (effectiveCharacterId) {
      const char = initialCharacters.find((c) => c.id === effectiveCharacterId);
      if (char) {
        return char;
      }
    }
    // In creator mode, use a stable reference for the default character
    if (!defaultCharacterRef.current) {
      defaultCharacterRef.current = createDefaultCharacter();
    }
    return defaultCharacterRef.current;
  }, [effectiveCharacterId, initialCharacters]);

  // Creator mode: no selected character from database (creating new)
  // Build mode: editing an existing character from database
  // Use effectiveCharacterId to avoid flash on first render when store has stale value
  const isCreatorMode = !effectiveCharacterId;

  const [character, setCharacter] = useState<ElizaCharacter>(initialCharacter);
  const [preUploadedFiles, setPreUploadedFiles] = useState<PreUploadedFile[]>(
    [],
  );

  // Track the character ID to detect actual character switches vs reference changes
  const previousCharacterIdRef = useRef<string | undefined>(
    initialCharacter.id,
  );

  // Use functional updates to avoid stale closure issues with concurrent operations
  const handlePreUploadedFilesAdd = useCallback(
    (newFiles: PreUploadedFile[]) => {
      setPreUploadedFiles((prev) => [...prev, ...newFiles]);
    },
    [],
  );

  const handlePreUploadedFileRemove = useCallback((fileId: string) => {
    setPreUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  // Track unsaved changes (memoized to avoid JSON.stringify on every render)
  const hasUnsavedChanges = useMemo(() => {
    const hasCharacterChanges =
      JSON.stringify(character) !== JSON.stringify(initialCharacter);
    const hasFileChanges = preUploadedFiles.length > 0;
    return hasCharacterChanges || hasFileChanges;
  }, [character, initialCharacter, preUploadedFiles]);

  // Notify parent of unsaved changes state
  useEffect(() => {
    onUnsavedChanges?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChanges]);

  // Update local state only when switching to a DIFFERENT character (by ID)
  // This prevents data loss when parent re-renders with new array reference but same content
  useEffect(() => {
    const characterIdChanged =
      initialCharacter.id !== previousCharacterIdRef.current;
    if (characterIdChanged) {
      setCharacter(initialCharacter);
      setPreUploadedFiles([]);
      previousCharacterIdRef.current = initialCharacter.id;
    }
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

    if (!character.username) {
      toast.error("Username is required");
      return;
    }

    if (!character.bio) {
      toast.error("Character bio is required");
      return;
    }

    try {
      // Use character.id to detect if character exists (covers both database characters
      // and characters just created but not yet in initialCharacters)
      if (character.id) {
        // Update existing character
        await updateCharacter(character.id, character);

        // Handle any pending pre-uploaded files (can happen after failed queueing on create)
        if (preUploadedFiles.length > 0) {
          // Capture file IDs before async operation to only clear these specific files
          // This preserves any files added during the fetch request
          const filesToQueue = preUploadedFiles;
          const queuedFileIds = new Set(filesToQueue.map((f) => f.id));

          let fileQueuingSucceeded = true;
          try {
            const queueResponse = await fetch("/api/v1/knowledge/queue", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                characterId: character.id,
                files: filesToQueue.map((f) => ({
                  blobUrl: f.blobUrl,
                  filename: f.filename,
                  contentType: f.contentType,
                  size: f.size,
                })),
              }),
            });

            if (queueResponse.ok) {
              markKnowledgeProcessingPending(character.id);
              // Only remove the files that were queued, preserve any newly added files
              setPreUploadedFiles((prev) =>
                prev.filter((f) => !queuedFileIds.has(f.id)),
              );
              toast.success("Character updated!", {
                description: `Processing ${filesToQueue.length} file(s) for RAG knowledge base...`,
                duration: 4000,
              });
              fetch("/api/v1/knowledge/process-queue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
              }).catch(() => {});
            } else {
              fileQueuingSucceeded = false;
            }
          } catch {
            fileQueuingSucceeded = false;
          }

          if (!fileQueuingSucceeded) {
            toast.warning("Character updated, but file queueing failed", {
              description: "You can retry by clicking Save again.",
              duration: 6000,
            });
            // Character was saved - mark as such, even though files failed
            onUnsavedChanges?.(false);
            return;
          }
        } else {
          toast.success("Character updated successfully!");
        }

        onUnsavedChanges?.(false);
      } else {
        // Create new character (creator mode)
        const saved = await createCharacter(character);

        if (saved.id) {
          // Track if file queueing succeeds (only relevant if we have files)
          let fileQueuingSucceeded = true;

          // Capture files to queue BEFORE any async operations
          // Used later to determine which toast to show (state updates are async)
          const filesToQueue = preUploadedFiles;
          const queuedFileIds = new Set(filesToQueue.map((f) => f.id));

          // Queue pre-uploaded files for background processing
          if (filesToQueue.length > 0) {
            try {
              const queueResponse = await fetch("/api/v1/knowledge/queue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  characterId: saved.id,
                  files: filesToQueue.map((f) => ({
                    blobUrl: f.blobUrl,
                    filename: f.filename,
                    contentType: f.contentType,
                    size: f.size,
                  })),
                }),
              });

              if (queueResponse.ok) {
                markKnowledgeProcessingPending(saved.id);
                // Only remove the files that were queued, preserve any newly added files
                setPreUploadedFiles((prev) =>
                  prev.filter((f) => !queuedFileIds.has(f.id)),
                );

                toast.success("Character created!", {
                  description: `Processing ${filesToQueue.length} file(s) for RAG knowledge base in background...`,
                  duration: 4000,
                });

                // Trigger processing in background (fire and forget)
                fetch("/api/v1/knowledge/process-queue", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                }).catch(() => {});
              } else {
                fileQueuingSucceeded = false;
              }
            } catch {
              fileQueuingSucceeded = false;
            }

            // If queueing failed, notify user but still navigate to chat
            // Character was created successfully - files can be uploaded from Files tab
            if (!fileQueuingSucceeded) {
              toast.warning("Character created! File queueing failed", {
                description: "You can upload files from the Files tab in chat.",
                duration: 6000,
              });
              // Clear only the files we attempted to queue, preserve any newly added files
              setPreUploadedFiles((prev) =>
                prev.filter((f) => !queuedFileIds.has(f.id)),
              );
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
          // Use filesToQueue.length instead of preUploadedFiles.length since state updates are async
          if (filesToQueue.length === 0) {
            toast.success("Character created! Redirecting to chat...", {
              duration: 2000,
            });
          }

          // Mark changes as saved after successful creation
          onUnsavedChanges?.(false);

          // Clear room before navigating - chat page starts fresh with no stale room data
          setRoomId(null);

          // Use pendingNavigation pattern to defer navigation until state is committed
          setPendingNavigation(saved.id);
        } else {
          // createCharacter returned without an id - treat as failure
          throw new Error("Character creation failed: no ID returned");
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save character. Please try again.",
      );
    }
  }, [character, onUnsavedChanges, setRoomId, preUploadedFiles]);

  const handleCharacterRefresh = useCallback(async () => {
    if (!character.id) return;

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
              key={effectiveCharacterId || "creator"}
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
              onPreUploadedFilesAdd={handlePreUploadedFilesAdd}
              onPreUploadedFileRemove={handlePreUploadedFileRemove}
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
                key={effectiveCharacterId || "creator"}
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
              data-onboarding="build-editor"
            >
              <CharacterEditor
                character={character}
                onChange={setCharacter}
                onSave={handleSave}
                preUploadedFiles={preUploadedFiles}
                onPreUploadedFilesAdd={handlePreUploadedFilesAdd}
                onPreUploadedFileRemove={handlePreUploadedFileRemove}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
