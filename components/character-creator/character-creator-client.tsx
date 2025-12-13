/**
 * Character creator client component for creating and editing characters.
 * Provides form-based and JSON editor modes with build mode assistant integration.
 * Supports character creation, updates, and testing.
 *
 * @param props - Character creator configuration
 * @param props.initialCharacters - Initial list of characters
 * @param props.initialCharacterId - Optional character ID to edit
 * @param props.userId - User ID for character ownership
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { JsonEditor } from "./json-editor";
import { CharacterForm } from "@/components/character-builder";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createCharacter, updateCharacter } from "@/app/actions/characters";
import type { ElizaCharacter } from "@/lib/types";
import { PanelLeftClose, PanelLeftOpen, MessageSquare } from "lucide-react";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import {
  BrandTabs,
  BrandTabsList,
  BrandTabsTrigger,
  BrandTabsContent,
  BrandCard,
  BrandButton,
  CornerBrackets,
} from "@/components/brand";
import { BuildModeAssistant } from "@/components/chat/build-mode-assistant";

interface CharacterCreatorClientProps {
  initialCharacters: ElizaCharacter[];
  initialCharacterId?: string;
  userId: string;
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

export function CharacterCreatorClient({
  initialCharacters,
  initialCharacterId,
  userId,
}: CharacterCreatorClientProps) {
  const router = useRouter();

  // Initialize character from URL parameter if provided
  const [character, setCharacter] = useState<ElizaCharacter>(() => {
    if (initialCharacterId) {
      const char = initialCharacters.find((c) => c.id === initialCharacterId);
      if (char) {
        return char;
      }
    }
    return defaultCharacter;
  });

  const [selectedId, setSelectedId] = useState<string | null>(
    initialCharacterId || null,
  );
  const [showAssistant, setShowAssistant] = useState(true);
  const [useBuildMode, setUseBuildMode] = useState(!!initialCharacterId);
  const [hasAutoInitialized, setHasAutoInitialized] = useState(false);
  const [isInitializingCharacter, setIsInitializingCharacter] = useState(false);

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
      let savedCharacterId: string | null = selectedId;

      if (selectedId) {
        await updateCharacter(selectedId, character);
        toast.success("Character updated successfully!");
      } else {
        const saved = await createCharacter(character);
        savedCharacterId = saved.id || null;
        setSelectedId(savedCharacterId);

        // Show simple success toast
        toast.success("Character created successfully!", {
          description:
            "You can now test your character in chat or continue editing.",
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
  }, [character, selectedId]);

  const handleLoadCharacter = useCallback(
    (characterId: string) => {
      const char = initialCharacters.find((c) => c.id === characterId);
      if (char) {
        setCharacter(char);
        setSelectedId(characterId);
        toast.success("Character loaded");
      }
    },
    [initialCharacters],
  );

  const handleNewCharacter = useCallback(() => {
    setCharacter(defaultCharacter);
    setSelectedId(null);
    setUseBuildMode(false);
    toast.success("New character created");
  }, []);

  // Initialize a blank character in database for BUILD mode
  const initializeBlankCharacter = useCallback(async () => {
    if (isInitializingCharacter) return;

    setIsInitializingCharacter(true);
    try {
      // Create a minimal character record with a temporary name
      const tempCharacter: ElizaCharacter = {
        name: `New Character ${Date.now()}`,
        bio: "Character being created with AI assistance",
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

      const saved = await createCharacter(tempCharacter);

      if (saved.id) {
        setCharacter(saved);
        setSelectedId(saved.id);
        setUseBuildMode(true);
        toast.success("Ready to chat! Tell me about your character idea.");
      } else {
        throw new Error("Character created but no ID returned");
      }
    } catch (error) {
      console.error("Error initializing character:", error);
      toast.error("Failed to initialize character for chat");
    } finally {
      setIsInitializingCharacter(false);
    }
  }, [isInitializingCharacter]);

  // Refresh character data from database
  const handleCharacterRefresh = useCallback(async () => {
    if (!selectedId) return;

    try {
      // Fetch updated character from server
      const response = await fetch(`/api/my-agents/${selectedId}`);
      if (response.ok) {
        const updatedChar = await response.json();
        setCharacter(updatedChar);
      }
    } catch (error) {
      console.error("Error refreshing character:", error);
    }
  }, [selectedId]);

  // Auto-initialize a blank character when entering the creator for the first time
  useEffect(() => {
    if (
      !selectedId &&
      !hasAutoInitialized &&
      !isInitializingCharacter &&
      showAssistant
    ) {
      setHasAutoInitialized(true);
      initializeBlankCharacter();
    }
  }, [
    selectedId,
    hasAutoInitialized,
    isInitializingCharacter,
    showAssistant,
    initializeBlankCharacter,
  ]);

  useSetPageHeader(
    {
      title: "Character Creator",
      description:
        "Create and customize AI agent characters with personality, knowledge, and style",
      actions: (
        <div className="flex items-center gap-3">
          <Select
            value={selectedId || "new"}
            onValueChange={(value) => {
              if (value === "new") {
                handleNewCharacter();
              } else {
                handleLoadCharacter(value);
              }
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select a character..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">+ New Character</SelectItem>
              {initialCharacters.map((char) => (
                <SelectItem key={char.id} value={char.id!}>
                  {char.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedId && (
            <BrandButton
              variant="primary"
              size="sm"
              onClick={() =>
                router.push(`/dashboard/chat?characterId=${selectedId}`)
              }
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Test in Chat
            </BrandButton>
          )}
          {!useBuildMode && (
            <BrandButton
              variant="outline"
              size="sm"
              onClick={() => setShowAssistant(!showAssistant)}
            >
              {showAssistant ? (
                <>
                  <PanelLeftClose className="mr-2 h-4 w-4" />
                  Hide Assistant
                </>
              ) : (
                <>
                  <PanelLeftOpen className="mr-2 h-4 w-4" />
                  Show Assistant
                </>
              )}
            </BrandButton>
          )}
        </div>
      ),
    },
    [
      selectedId,
      showAssistant,
      initialCharacters,
      handleNewCharacter,
      handleLoadCharacter,
      router,
    ],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Main Content */}
      <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-2">
        {/* Left Column - AI Assistant, Build Mode Assistant, or Form */}
        <div className="flex h-full flex-col overflow-hidden">
          {useBuildMode && selectedId ? (
            <BuildModeAssistant
              character={character}
              onCharacterUpdate={handleCharacterUpdate}
              onCharacterRefresh={handleCharacterRefresh}
              userId={userId}
            />
          ) : showAssistant ? (
            <BrandCard className="relative flex h-full flex-col">
              <CornerBrackets size="sm" className="opacity-50" />
              <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="animate-pulse">
                  <div className="w-12 h-12 rounded-full bg-white/10 mx-auto mb-4" />
                  <div className="h-4 w-32 bg-white/10 rounded mx-auto mb-2" />
                  <div className="h-3 w-48 bg-white/10 rounded mx-auto" />
                </div>
                <p className="text-white/60 mt-4">
                  Initializing chat builder...
                </p>
              </div>
            </BrandCard>
          ) : (
            <CharacterForm character={character} onChange={setCharacter} />
          )}
        </div>

        {/* Right Column - JSON Editor with Form Tab */}
        <div className="flex h-full flex-col overflow-hidden">
          <BrandCard className="relative flex h-full flex-col overflow-hidden">
            <CornerBrackets size="sm" className="opacity-50" />

            <BrandTabs
              id="character-editor-tabs"
              defaultValue="json"
              className="flex h-full flex-col relative z-10"
            >
              <BrandTabsList className="mx-4 mb-2 mt-4 w-[calc(100%-2rem)]">
                <BrandTabsTrigger value="json" className="flex-1">
                  JSON Editor
                </BrandTabsTrigger>
                <BrandTabsTrigger value="form" className="flex-1">
                  Form View
                </BrandTabsTrigger>
              </BrandTabsList>
              <BrandTabsContent
                value="json"
                className="m-0 flex-1 overflow-hidden p-0"
              >
                <JsonEditor
                  character={character}
                  onChange={setCharacter}
                  onSave={handleSave}
                />
              </BrandTabsContent>
              <BrandTabsContent
                value="form"
                className="m-0 flex-1 overflow-hidden p-0"
              >
                <CharacterForm character={character} onChange={setCharacter} />
              </BrandTabsContent>
            </BrandTabs>
          </BrandCard>
        </div>
      </div>
    </div>
  );
}
