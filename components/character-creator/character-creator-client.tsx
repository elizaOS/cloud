/**
 * Character creator client component for creating and editing characters.
 * 
 * Two modes:
 * - Blank state: Chat with Eliza to create a new character
 * - Edit mode: Edit an existing character with form/JSON editor
 *
 * @param props - Character creator configuration
 * @param props.initialCharacters - Initial list of characters
 * @param props.initialCharacterId - Optional character ID to edit
 * @param props.userId - User ID for character ownership
 */

"use client";

import { useState, useCallback } from "react";
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
import { createDefaultCharacter } from "@/lib/utils/character-names";

interface CharacterCreatorClientProps {
  initialCharacters: ElizaCharacter[];
  initialCharacterId?: string;
  userId: string;
}

export function CharacterCreatorClient({
  initialCharacters,
  initialCharacterId,
  userId,
}: CharacterCreatorClientProps) {
  const router = useRouter();

  // Determine if we're in creator mode (blank state) or edit mode
  const isCreatorMode = !initialCharacterId;

  // Initialize character from URL parameter if provided
  const [character, setCharacter] = useState<ElizaCharacter>(() => {
    if (initialCharacterId) {
      const char = initialCharacters.find((c) => c.id === initialCharacterId);
      if (char) return char;
    }
    return createDefaultCharacter();
  });

  const [selectedId, setSelectedId] = useState<string | null>(
    initialCharacterId || null,
  );
  const [showAssistant, setShowAssistant] = useState(true);

  const handleCharacterUpdate = useCallback(
    (updates: Partial<ElizaCharacter>) => {
      setCharacter((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  // Redirect to build mode after character creation
  const handleCharacterCreated = useCallback(
    (characterId: string) => {
      router.push(`/dashboard/build?characterId=${characterId}`);
    },
    [router],
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

    if (selectedId) {
      await updateCharacter(selectedId, character);
      toast.success("Character updated successfully!");
    } else {
      const saved = await createCharacter(character);
      if (saved.id) {
        toast.success("Character created! Redirecting to build mode...", {
          duration: 2000,
        });
        router.push(`/dashboard/build?characterId=${saved.id}`);
      }
    }
  }, [character, selectedId, router]);

  const handleLoadCharacter = useCallback(
    (characterId: string) => {
      // Redirect to build page with character ID
      router.push(`/dashboard/build?characterId=${characterId}`);
    },
    [router],
  );

  const handleNewCharacter = useCallback(() => {
    setCharacter(createDefaultCharacter());
    setSelectedId(null);
  }, []);

  // Refresh character data from database
  const handleCharacterRefresh = useCallback(async () => {
    if (!selectedId) return;

    const response = await fetch(`/api/my-agents/${selectedId}`);
    if (response.ok) {
      const updatedChar = await response.json();
      setCharacter(updatedChar);
    }
  }, [selectedId]);

  useSetPageHeader(
    {
      title: isCreatorMode ? "Create Character" : "Edit Character",
      description: isCreatorMode
        ? "Chat with Eliza to create your new AI character"
        : undefined,
      actions: (
        <div className="flex items-center gap-3">
          <Select
            value={selectedId || "new"}
            onValueChange={(value) => {
              if (value === "new") {
                handleNewCharacter();
                router.push("/dashboard/character-creator");
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
        </div>
      ),
    },
    [
      isCreatorMode,
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
      <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-2">
        {/* Left Column - AI Assistant (Eliza for creator, Character for edit) or Form */}
        <div className="flex h-full flex-col overflow-hidden">
          {showAssistant ? (
            <BuildModeAssistant
              character={isCreatorMode ? undefined : character}
              onCharacterUpdate={handleCharacterUpdate}
              onCharacterRefresh={isCreatorMode ? undefined : handleCharacterRefresh}
              onCharacterCreated={isCreatorMode ? handleCharacterCreated : undefined}
              userId={userId}
              isCreatorMode={isCreatorMode}
            />
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
              defaultValue="form"
              className="flex h-full flex-col relative z-10"
            >
              <BrandTabsList className="mx-4 mb-2 mt-4 w-[calc(100%-2rem)]">
                <BrandTabsTrigger value="form" className="flex-1">
                  Form
                </BrandTabsTrigger>
                <BrandTabsTrigger value="json" className="flex-1">
                  JSON
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
