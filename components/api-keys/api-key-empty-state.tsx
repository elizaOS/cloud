import { KeyRound, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ApiKeyEmptyStateProps {
  onCreateKey?: () => void;
}

export function ApiKeyEmptyState({ onCreateKey }: ApiKeyEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-10 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <KeyRound className="h-7 w-7" />
      </div>
      <h3 className="mt-6 text-2xl font-semibold">No API keys yet</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Create your first API key to start authenticating requests and tracking
        usage across the platform.
      </p>
      <Button className="mt-6" onClick={onCreateKey}>
        <Plus className="mr-2 h-4 w-4" />
        Create API Key
      </Button>
    </div>
  );
}
