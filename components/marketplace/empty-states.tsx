/**
 * Empty states component displaying different states for character marketplace.
 * Supports loading, no results, and error states with customizable messages.
 *
 * @param props - Empty states configuration
 * @param props.type - Type of empty state (loading, no-results, error)
 * @param props.message - Optional custom message to display
 */

"use client";

import { Loader2, Search, Sparkles } from "lucide-react";

interface EmptyStatesProps {
  type: "loading" | "no-results" | "error";
  message?: string;
}

export function EmptyStates({ type, message }: EmptyStatesProps) {
  if (type === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading characters...</p>
      </div>
    );
  }

  if (type === "no-results") {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-8 text-center">
        <div className="rounded-full bg-muted p-6">
          <Search className="h-12 w-12 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">No characters found</h3>
          <p className="text-muted-foreground max-w-sm">
            {message ||
              "Try adjusting your filters or search query to find what you're looking for."}
          </p>
        </div>
      </div>
    );
  }

  if (type === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-8 text-center">
        <div className="rounded-full bg-destructive/10 p-6">
          <Sparkles className="h-12 w-12 text-destructive" />
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">Something went wrong</h3>
          <p className="text-muted-foreground max-w-sm">
            {message ||
              "We couldn't load the characters. Please try again later."}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
