"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { BuildModeAssistant } from "@/components/chat/build-mode-assistant";
import { CharacterEditor } from "@/components/chat/character-editor";
import { toast } from "sonner";
import {
  createCharacter,
  updateCharacter,
  getCharacter,
} from "@/app/actions/characters";
import type { ElizaCharacter } from "@/lib/types";
import { useChatStore } from "@/stores/chat-store";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { MessageSquare, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
interface CharacterBuildModeProps {
  initialCharacters: ElizaCharacter[];
}

const defaultCharacter: ElizaCharacter = {
  name: "",
  bio: "",
  system: "",
  topics: [],
  adjectives: [],
  postExamples: [],
  plugins: [],
  settings: {},
  secrets: {},
  style: {},
  templates: {},
};

export function CharacterBuildMode({
  initialCharacters,
}: CharacterBuildModeProps) {
  const { selectedCharacterId, setSelectedCharacterId } = useChatStore();
  const { user } = usePrivy();
  const userId = user?.id || "";

  // Mobile view state: 'assistant' or 'editor'
  const [mobileView, setMobileView] = useState<"assistant" | "editor">(
    "assistant"
  );

  // Derive character from selectedCharacterId - avoid setState in effect
  const initialCharacter = useMemo(() => {
    if (selectedCharacterId) {
      const char = initialCharacters.find((c) => c.id === selectedCharacterId);
      if (char) {
        return char;
      }
    }
    return defaultCharacter;
  }, [selectedCharacterId, initialCharacters]);

  const [character, setCharacter] = useState<ElizaCharacter>(initialCharacter);

  // Update local state when derived character changes
  useEffect(() => {
    setCharacter(initialCharacter);
  }, [initialCharacter]);

  const handleCharacterUpdate = useCallback(
    (updates: Partial<ElizaCharacter>) => {
      setCharacter((prev) => ({ ...prev, ...updates }));
    },
    []
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
        // Create new character
        const saved = await createCharacter(character);

        // Update selection to the newly created character
        if (saved.id) {
          setSelectedCharacterId(saved.id);
        }

        toast.success("Character created successfully!", {
          description: "You can now chat with your new character!",
          duration: 4000,
        });
      }
    } catch (error) {
      console.error("Error saving character:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save character. Please try again."
      );
    }
  }, [character, selectedCharacterId, setSelectedCharacterId]);

  const handleCharacterRefresh = useCallback(async () => {
    if (!character.id) {
      console.warn("[CharacterBuildMode] No character ID to refresh");
      return;
    }

    try {
      const refreshedCharacter = await getCharacter(character.id);

      // Update local state with fresh data from database
      setCharacter(refreshedCharacter);
    } catch (error) {
      console.error("[CharacterBuildMode] Error refreshing character:", error);
      toast.error("Failed to refresh character data");
    }
  }, [character.id]);

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
              ? "bg-[#E500FF] text-white"
              : "text-white/60 hover:text-white hover:bg-white/5"
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
              ? "bg-[#E500FF] text-white"
              : "text-white/60 hover:text-white hover:bg-white/5"
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
              userId={userId}
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
            <div className="flex h-full flex-col overflow-hidden">
              <BuildModeAssistant
                character={character}
                onCharacterUpdate={handleCharacterUpdate}
                onCharacterRefresh={handleCharacterRefresh}
                userId={userId}
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
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
