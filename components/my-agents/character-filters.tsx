"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, LayoutGrid, List } from "lucide-react";
import type { ViewMode, SortOption } from "./my-agents-client";

interface CharacterFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  totalCount: number;
  filteredCount: number;
}

export function CharacterFilters({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  totalCount,
  filteredCount,
}: CharacterFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
      {/* Search */}
      <div className="relative flex-1 max-w-md w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        <Input
          type="text"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
        />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Results count */}
        {searchQuery && (
          <span className="text-sm text-white/60">
            {filteredCount} of {totalCount} agents
          </span>
        )}

        {/* Sort */}
        <Select
          value={sortBy}
          onValueChange={(v) => onSortChange(v as SortOption)}
        >
          <SelectTrigger className="w-[140px] rounded-none border-white/10 bg-black/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="modified">Last Modified</SelectItem>
            <SelectItem value="created">Created Date</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="recent">Recently Used</SelectItem>
          </SelectContent>
        </Select>

        {/* View mode toggle */}
        <div className="flex border border-white/10 rounded-none overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewModeChange("grid")}
            className={`rounded-none px-3 ${
              viewMode === "grid"
                ? "bg-[#FF5800] text-white hover:bg-[#FF5800]/90"
                : "bg-black/40 text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewModeChange("list")}
            className={`rounded-none px-3 border-l border-white/10 ${
              viewMode === "list"
                ? "bg-[#FF5800] text-white hover:bg-[#FF5800]/90"
                : "bg-black/40 text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
