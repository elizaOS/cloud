/**
 * Marketplace header component with search, view mode toggle, and create button.
 * Provides responsive layout with mobile collapse support.
 *
 * @param props - Marketplace header configuration
 * @param props.searchQuery - Current search query
 * @param props.onSearchChange - Callback when search changes
 * @param props.view - Current view mode (grid or list)
 * @param props.onViewChange - Callback when view mode changes
 * @param props.onToggleCollapse - Optional callback to toggle sidebar collapse
 */

"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, LayoutGrid, List, Plus, PanelLeftClose } from "lucide-react";
import { useRouter } from "next/navigation";

interface MyAgentsHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  view: "grid" | "list";
  onViewChange: (view: "grid" | "list") => void;
  onToggleCollapse?: () => void;
}

export function MyAgentsHeader({
  searchQuery,
  onSearchChange,
  view,
  onViewChange,
  onToggleCollapse,
}: MyAgentsHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b">
      {/* Left: Toggle + Search */}
      <div className="flex items-center gap-2 flex-1">
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="md:hidden"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search characters..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Right: View Toggle + Create Button */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 border rounded-md p-1">
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onViewChange("grid")}
            className="h-8 w-8 p-0"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onViewChange("list")}
            className="h-8 w-8 p-0"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        <Button
          onClick={() => router.push("/dashboard/build")}
          size="sm"
          className="hidden sm:flex"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Agent
        </Button>
        <Button
          onClick={() => router.push("/dashboard/build")}
          size="sm"
          className="sm:hidden h-8 w-8 p-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
