"use client";

import { useState, useCallback } from "react";
import { AiAssistant } from "./ai-assistant";
import { JsonEditor } from "./json-editor";
import { CharacterForm } from "./character-form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { createCharacter, updateCharacter } from "@/app/actions/characters";
import type { ElizaCharacter } from "@/lib/types";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSetPageHeader } from "@/components/layout/page-header-context";

interface CharacterCreatorClientProps {
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

export function CharacterCreatorClient({
  initialCharacters,
}: CharacterCreatorClientProps) {
  const [character, setCharacter] = useState<ElizaCharacter>(defaultCharacter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAssistant, setShowAssistant] = useState(true);

  const handleCharacterUpdate = useCallback((updates: Partial<ElizaCharacter>) => {
    setCharacter((prev) => ({ ...prev, ...updates }));
  }, []);

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
      if (selectedId) {
        await updateCharacter(selectedId, character);
      } else {
        const saved = await createCharacter(character);
        setSelectedId(saved.id || null);
      }
    } catch (error) {
      throw error;
    }
  }, [character, selectedId]);

  const handleLoadCharacter = useCallback((characterId: string) => {
    const char = initialCharacters.find((c) => c.id === characterId);
    if (char) {
      setCharacter(char);
      setSelectedId(characterId);
      toast.success("Character loaded");
    }
  }, [initialCharacters]);

  const handleNewCharacter = useCallback(() => {
    setCharacter(defaultCharacter);
    setSelectedId(null);
    toast.success("New character created");
  }, []);

  useSetPageHeader({
    title: "Character Creator",
    description: "Create and customize AI agent characters with personality, knowledge, and style",
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
        <Button
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
        </Button>
      </div>
    ),
  }, [selectedId, showAssistant, initialCharacters, handleNewCharacter, handleLoadCharacter]);

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
          <Card className="flex h-full flex-col overflow-hidden p-0">
            <Tabs defaultValue="json" className="flex h-full flex-col">
              <TabsList className="mx-4 mb-2 mt-4 grid w-[calc(100%-2rem)] grid-cols-2">
                <TabsTrigger value="json">JSON Editor</TabsTrigger>
                <TabsTrigger value="form">Form View</TabsTrigger>
              </TabsList>
              <TabsContent value="json" className="m-0 flex-1 overflow-hidden p-0">
                <JsonEditor
                  character={character}
                  onChange={setCharacter}
                  onSave={handleSave}
                />
              </TabsContent>
              <TabsContent value="form" className="m-0 flex-1 overflow-hidden p-0">
                <CharacterForm
                  character={character}
                  onChange={setCharacter}
                />
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}

