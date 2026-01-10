"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Bot, Check, Plus, Search, X, Sparkles, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

export interface Character {
  id: string;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | string[];
  is_public?: boolean;
}

interface CharacterPickerProps {
  characters: Character[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  maxSelection?: number;
  className?: string;
  loading?: boolean;
}

/**
 * CharacterPicker - Beautiful multi-select character picker
 * Allows selecting up to maxSelection (default 4) AI characters for an app
 */
export function CharacterPicker({
  characters,
  selectedIds,
  onSelectionChange,
  maxSelection = 4,
  className,
  loading = false,
}: CharacterPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter characters based on search
  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return characters;
    const query = searchQuery.toLowerCase();
    return characters.filter(
      (char) =>
        char.name.toLowerCase().includes(query) ||
        char.username?.toLowerCase().includes(query) ||
        (typeof char.bio === "string" && char.bio.toLowerCase().includes(query))
    );
  }, [characters, searchQuery]);

  // Get selected characters in order
  const selectedCharacters = useMemo(() => {
    return selectedIds
      .map((id) => characters.find((c) => c.id === id))
      .filter(Boolean) as Character[];
  }, [selectedIds, characters]);

  const toggleCharacter = (characterId: string) => {
    if (selectedIds.includes(characterId)) {
      // Remove character
      onSelectionChange(selectedIds.filter((id) => id !== characterId));
    } else if (selectedIds.length < maxSelection) {
      // Add character
      onSelectionChange([...selectedIds, characterId]);
    }
  };

  const removeCharacter = (characterId: string) => {
    onSelectionChange(selectedIds.filter((id) => id !== characterId));
  };

  const getBioPreview = (bio: string | string[] | undefined): string => {
    if (!bio) return "No description";
    const text = Array.isArray(bio) ? bio[0] : bio;
    return text.length > 80 ? text.slice(0, 77) + "..." : text;
  };

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with selection count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/20">
            <Users className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">App Characters</h3>
            <p className="text-xs text-white/50">
              Select up to {maxSelection} AI agents
            </p>
          </div>
        </div>
        <div className="px-2 py-1 rounded-full bg-white/5 border border-white/10">
          <span className="text-xs font-mono text-white/60">
            {selectedIds.length}/{maxSelection}
          </span>
        </div>
      </div>

      {/* Selected Characters Pills */}
      {selectedCharacters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCharacters.map((char, index) => (
            <div
              key={char.id}
              className={cn(
                "flex items-center gap-2 pl-1 pr-2 py-1 rounded-full",
                "bg-gradient-to-r border transition-all duration-300",
                index === 0
                  ? "from-violet-500/20 to-violet-500/10 border-violet-500/30"
                  : index === 1
                    ? "from-cyan-500/20 to-cyan-500/10 border-cyan-500/30"
                    : index === 2
                      ? "from-amber-500/20 to-amber-500/10 border-amber-500/30"
                      : "from-pink-500/20 to-pink-500/10 border-pink-500/30"
              )}
            >
              {char.avatar_url ? (
                <Image
                  src={char.avatar_url}
                  alt={char.name}
                  width={20}
                  height={20}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-white/60" />
                </div>
              )}
              <span className="text-xs font-medium text-white">{char.name}</span>
              <button
                onClick={() => removeCharacter(char.id)}
                className="p-0.5 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="h-3 w-3 text-white/50 hover:text-white/80" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search characters..."
          className="pl-10 bg-white/5 border-white/10 focus:border-violet-500/50 text-sm"
        />
      </div>

      {/* Character Grid */}
      <ScrollArea className="h-[280px] pr-3">
        <div className="grid gap-2">
          {filteredCharacters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="p-3 rounded-full bg-white/5 mb-3">
                <Bot className="h-6 w-6 text-white/30" />
              </div>
              <p className="text-sm text-white/50">
                {searchQuery ? "No characters match your search" : "No characters available"}
              </p>
              <p className="text-xs text-white/30 mt-1">
                Create agents in the Build tab first
              </p>
            </div>
          ) : (
            filteredCharacters.map((character) => {
              const isSelected = selectedIds.includes(character.id);
              const isDisabled = !isSelected && selectedIds.length >= maxSelection;

              return (
                <button
                  key={character.id}
                  onClick={() => !isDisabled && toggleCharacter(character.id)}
                  disabled={isDisabled}
                  className={cn(
                    "group relative flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-300",
                    "border touch-manipulation",
                    isSelected
                      ? "bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border-violet-500/30 ring-1 ring-violet-500/20"
                      : isDisabled
                        ? "bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed"
                        : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20"
                  )}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {character.avatar_url ? (
                      <Image
                        src={character.avatar_url}
                        alt={character.name}
                        width={44}
                        height={44}
                        className="rounded-xl object-cover ring-2 ring-white/5"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-white/60" />
                      </div>
                    )}
                    {character.is_public && (
                      <div className="absolute -top-1 -right-1 p-0.5 rounded-full bg-green-500/20 border border-green-500/30">
                        <Sparkles className="h-2.5 w-2.5 text-green-400" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white truncate">
                        {character.name}
                      </span>
                      {character.username && (
                        <span className="text-xs text-white/40 truncate">
                          @{character.username}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
                      {getBioPreview(character.bio)}
                    </p>
                  </div>

                  {/* Selection indicator */}
                  <div
                    className={cn(
                      "flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300",
                      isSelected
                        ? "bg-violet-500 border-violet-500"
                        : "border-white/20 group-hover:border-white/40"
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Helper text */}
      <p className="text-xs text-white/40 text-center">
        Selected characters will be available for chat in your app via the SDK
      </p>
    </div>
  );
}

/**
 * CompactCharacterPicker - Smaller version for inline use
 */
export function CompactCharacterPicker({
  characters,
  selectedIds,
  onSelectionChange,
  maxSelection = 4,
}: CharacterPickerProps) {
  const selectedCharacters = useMemo(() => {
    return selectedIds
      .map((id) => characters.find((c) => c.id === id))
      .filter(Boolean) as Character[];
  }, [selectedIds, characters]);

  const availableCharacters = useMemo(() => {
    return characters.filter((c) => !selectedIds.includes(c.id));
  }, [characters, selectedIds]);

  const addCharacter = (characterId: string) => {
    if (selectedIds.length < maxSelection) {
      onSelectionChange([...selectedIds, characterId]);
    }
  };

  const removeCharacter = (characterId: string) => {
    onSelectionChange(selectedIds.filter((id) => id !== characterId));
  };

  return (
    <div className="space-y-3">
      {/* Selected */}
      <div className="flex flex-wrap gap-2">
        {selectedCharacters.map((char) => (
          <div
            key={char.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"
          >
            {char.avatar_url ? (
              <Image
                src={char.avatar_url}
                alt={char.name}
                width={20}
                height={20}
                className="rounded-full object-cover"
              />
            ) : (
              <Bot className="h-4 w-4 text-violet-400" />
            )}
            <span className="text-xs font-medium text-white">{char.name}</span>
            <button
              onClick={() => removeCharacter(char.id)}
              className="p-0.5 rounded hover:bg-white/10"
            >
              <X className="h-3 w-3 text-white/50" />
            </button>
          </div>
        ))}

        {/* Add button */}
        {selectedIds.length < maxSelection && availableCharacters.length > 0 && (
          <select
            onChange={(e) => {
              if (e.target.value) {
                addCharacter(e.target.value);
                e.target.value = "";
              }
            }}
            className="px-2 py-1.5 rounded-lg bg-white/5 border border-dashed border-white/20 text-xs text-white/60 cursor-pointer hover:border-white/40 transition-colors"
          >
            <option value="">+ Add character</option>
            {availableCharacters.map((char) => (
              <option key={char.id} value={char.id}>
                {char.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedIds.length === 0 && (
        <p className="text-xs text-white/40">No characters selected</p>
      )}
    </div>
  );
}

export default CharacterPicker;
