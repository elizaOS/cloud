"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AiAssistant } from "./ai-assistant";
import { JsonEditor } from "./json-editor";
import { CharacterForm } from "./character-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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

interface CharacterCreatorClientProps {
  initialCharacters: ElizaCharacter[];
  initialCharacterId?: string;
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
}: CharacterCreatorClientProps) {
  const router = useRouter();
  const [character, setCharacter] = useState<ElizaCharacter>(defaultCharacter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAssistant, setShowAssistant] = useState(true);

  // Load character from URL parameter on mount
  useEffect(() => {
    if (initialCharacterId) {
      const char = initialCharacters.find((c) => c.id === initialCharacterId);
      if (char) {
        setCharacter(char);
        setSelectedId(initialCharacterId);
        console.log("[Character Creator] Loaded character from URL:", char.name);
      }
    }
  }, [initialCharacterId, initialCharacters]);

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

        // Show enhanced success toast with actions
        toast.success(
          <div className="flex flex-col gap-3">
            <p className="font-medium">Character created successfully!</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs"
                onClick={() => {
                  if (savedCharacterId) {
                    router.push(`/dashboard/eliza?characterId=${savedCharacterId}`);
                  }
                }}
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                Test in Chat
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  toast.dismiss();
                }}
              >
                Continue Editing
              </Button>
            </div>
          </div>,
          { duration: 6000 }
        );
      }
    } catch (error) {
      throw error;
    }
  }, [character, selectedId, router]);

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
    toast.success("New character created");
  }, []);

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
      selectedId,
      showAssistant,
      initialCharacters,
      handleNewCharacter,
      handleLoadCharacter,
    ],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Main Content */}
      <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-2">
        {/* Left Column - AI Assistant or Form */}
        <div className="flex h-full flex-col overflow-hidden">
          {showAssistant ? (
            <AiAssistant
              character={character}
              onCharacterUpdate={handleCharacterUpdate}
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
