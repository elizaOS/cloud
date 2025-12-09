/**
 * AI App Builder button component that opens the AI-powered app builder.
 * Provides a button trigger for creating apps with AI assistance.
 */

"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIAppBuilderDialog } from "./ai-app-builder-dialog";

export function AIAppBuilderButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="bg-gradient-to-r from-purple-600 to-[#FF5800] hover:from-purple-600/90 hover:to-[#FF5800]/90 text-white"
      >
        <Sparkles className="h-4 w-4 mr-2" />
        Build with AI
      </Button>
      <AIAppBuilderDialog open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
