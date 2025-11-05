"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles } from "lucide-react";
import {
  CATEGORY_ORDER,
  CHARACTER_CATEGORIES,
} from "@/lib/constants/character-categories";
import type { CategoryId } from "@/lib/types/my-agents";

interface CategoryTabsProps {
  activeCategory: CategoryId | null;
  onCategoryChange: (category: CategoryId | null) => void;
}

export function CategoryTabs({
  activeCategory,
  onCategoryChange,
}: CategoryTabsProps) {
  return (
    <div className="border-b">
      <Tabs
        value={activeCategory || "all"}
        onValueChange={(value) =>
          onCategoryChange(value === "all" ? null : (value as CategoryId))
        }
      >
        <TabsList className="w-full justify-start overflow-x-auto h-auto px-6 py-3 bg-transparent scrollbar-hide">
          <TabsTrigger value="all" className="gap-2">
            <Sparkles className="h-4 w-4" />
            All Characters
          </TabsTrigger>
          {CATEGORY_ORDER.map((catKey) => {
            const cat = CHARACTER_CATEGORIES[catKey];
            return (
              <TabsTrigger key={cat.id} value={cat.id} className="gap-2">
                <span>{cat.icon}</span>
                <span className="hidden sm:inline">{cat.name}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
}
