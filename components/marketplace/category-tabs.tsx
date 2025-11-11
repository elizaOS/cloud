"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const activeValue = activeCategory || "all";
  const activeCat = activeCategory && activeCategory in CHARACTER_CATEGORIES 
    ? CHARACTER_CATEGORIES[activeCategory as keyof typeof CHARACTER_CATEGORIES] 
    : null;

  return (
    <div className="border-b">
      {/* Mobile Dropdown */}
      {isMounted && (
        <div className="block md:hidden px-6 py-3">
          <Select
            value={activeValue}
            onValueChange={(value) =>
              onCategoryChange(value === "all" ? null : (value as CategoryId))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                <div className="flex items-center gap-2">
                  {activeValue === "all" ? (
                    <>
                      <Sparkles className="h-4 w-4" />
                      All Characters
                    </>
                  ) : activeCat ? (
                    <>
                      <span>{activeCat.icon}</span>
                      <span>{activeCat.name}</span>
                    </>
                  ) : null}
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  All Characters
                </div>
              </SelectItem>
              {CATEGORY_ORDER.map((catKey) => {
                const cat = CHARACTER_CATEGORIES[catKey];
                return (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span>{cat.name}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Desktop Tabs */}
      <Tabs
        id="marketplace-category-tabs"
        value={activeValue}
        onValueChange={(value) =>
          onCategoryChange(value === "all" ? null : (value as CategoryId))
        }
      >
        <TabsList className="hidden md:flex w-full justify-start overflow-x-auto h-auto px-6 py-3 bg-transparent scrollbar-hide">
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
