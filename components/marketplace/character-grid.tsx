"use client";

import { useEffect, useRef } from "react";
import { CharacterCard } from "./character-card";
import { EmptyStates } from "./empty-states";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import type { ExtendedCharacter } from "@/lib/types/marketplace";

interface CharacterGridProps {
  characters: ExtendedCharacter[];
  view: "grid" | "list";
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
  onStartChat: (character: ExtendedCharacter) => void;
  onCloneCharacter: (character: ExtendedCharacter) => void;
  onViewDetails: (character: ExtendedCharacter) => void;
}

export function CharacterGrid({
  characters,
  view,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  onLoadMore,
  onStartChat,
  onCloneCharacter,
  onViewDetails,
}: CharacterGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoading || isLoadingMore || !hasMore) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );

    const trigger = loadMoreTriggerRef.current;
    if (trigger) {
      observerRef.current.observe(trigger);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [isLoading, isLoadingMore, hasMore, onLoadMore]);

  if (isLoading) {
    return <EmptyStates type="loading" />;
  }

  if (error) {
    return <EmptyStates type="error" message={error} />;
  }

  if (characters.length === 0) {
    return <EmptyStates type="no-results" />;
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="p-6">
          <div
            className={
              view === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
                : "flex flex-col gap-4"
            }
          >
            {characters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onStartChat={onStartChat}
                onClone={onCloneCharacter}
                onViewDetails={onViewDetails}
              />
            ))}
          </div>

          {/* Infinite Scroll Trigger */}
          {hasMore && (
            <div
              ref={loadMoreTriggerRef}
              className="flex justify-center py-8"
            >
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading more characters...</span>
                </div>
              )}
            </div>
          )}

          {/* End of Results */}
          {!hasMore && characters.length > 0 && (
            <div className="flex justify-center py-8 text-sm text-muted-foreground">
              You&apos;ve reached the end
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
