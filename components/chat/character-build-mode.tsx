"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { BuildModeAssistant } from "@/components/chat/build-mode-assistant";
import { AgentDnaEditor } from "@/components/chat/agent-dna-editor";
import { toast } from "sonner";
import { createCharacter, updateCharacter } from "@/app/actions/characters";
import type { ElizaCharacter } from "@/lib/types";
import { useChatStore } from "@/stores/chat-store";

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
          : "Failed to save character. Please try again.",
      );
    }
  }, [character, selectedCharacterId, setSelectedCharacterId]);

  return (
    <div className="flex h-full w-full min-h-0 overflow-hidden">
      {/* Split Pane Layout */}
      <div className="grid flex-1 overflow-hidden lg:grid-cols-2">
        {/* Left Column - AI Assistant Chat */}
        <div className="flex h-full flex-col overflow-hidden">
          <BuildModeAssistant
            character={character}
            onCharacterUpdate={handleCharacterUpdate}
          />
        </div>

        {/* Right Column - Agent DNA Editor */}
        <div
          className="flex h-full flex-col overflow-hidden border-l"
          style={{ borderColor: "#353535" }}
        >
          <AgentDnaEditor
            character={character}
            onChange={setCharacter}
            onSave={handleSave}
          />
        </div>
      </div>
    </div>
  );
}
