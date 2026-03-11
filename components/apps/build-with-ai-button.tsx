"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { BrandButton } from "@elizaos/ui";
import { QuickCreateDialog } from "@/components/builders/quick-create-dialog";

export function BuildWithAIButton() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <>
      <BrandButton
        onClick={() => setShowCreateDialog(true)}
        className="h-9 md:h-10"
      >
        <Sparkles className="h-4 w-4" />
        Build with AI
      </BrandButton>

      <QuickCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        defaultType="app"
      />
    </>
  );
}
