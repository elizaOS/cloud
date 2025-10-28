"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  Clock,
  SortAsc,
  RefreshCw,
  Volume2,
  Rocket,
  Star,
  User,
  X,
} from "lucide-react";
import type { SortBy, SearchFilters } from "@/lib/types/marketplace";

interface FilterBarProps {
  sortBy: SortBy;
  onSortChange: (sortBy: SortBy) => void;
  filters: SearchFilters;
  onToggleFilter: (filterKey: keyof SearchFilters) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function FilterBar({
  sortBy,
  onSortChange,
  filters,
  onToggleFilter,
  hasActiveFilters,
  onClearFilters,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b overflow-x-auto scrollbar-hide">
      {/* Sort Dropdown */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          Sort:
        </span>
        <Select value={sortBy} onValueChange={(value) => onSortChange(value as SortBy)}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popularity">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                <span>Most Popular</span>
              </div>
            </SelectItem>
            <SelectItem value="newest">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Newest First</span>
              </div>
            </SelectItem>
            <SelectItem value="name">
              <div className="flex items-center gap-2">
                <SortAsc className="h-4 w-4" />
                <span>Name A-Z</span>
              </div>
            </SelectItem>
            <SelectItem value="updated">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                <span>Recently Updated</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-border shrink-0" />

      {/* Filter Chips */}
      <div className="flex gap-2 flex-wrap">
        <Badge
          variant={filters.hasVoice ? "default" : "outline"}
          className="cursor-pointer transition-colors"
          onClick={() => onToggleFilter("hasVoice")}
        >
          <Volume2 className="h-3 w-3 mr-1" />
          Voice
        </Badge>

        <Badge
          variant={filters.deployed ? "default" : "outline"}
          className="cursor-pointer transition-colors"
          onClick={() => onToggleFilter("deployed")}
        >
          <Rocket className="h-3 w-3 mr-1" />
          Deployed
        </Badge>

        <Badge
          variant={filters.template ? "default" : "outline"}
          className="cursor-pointer transition-colors"
          onClick={() => onToggleFilter("template")}
        >
          <Star className="h-3 w-3 mr-1" />
          Templates
        </Badge>

        <Badge
          variant={filters.myCharacters ? "default" : "outline"}
          className="cursor-pointer transition-colors"
          onClick={() => onToggleFilter("myCharacters")}
        >
          <User className="h-3 w-3 mr-1" />
          My Characters
        </Badge>

        <Badge
          variant={filters.featured ? "default" : "outline"}
          className="cursor-pointer transition-colors"
          onClick={() => onToggleFilter("featured")}
        >
          <Star className="h-3 w-3 mr-1 fill-current" />
          Featured
        </Badge>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <>
          <div className="h-6 w-px bg-border shrink-0" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="shrink-0"
          >
            <X className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </>
      )}
    </div>
  );
}
