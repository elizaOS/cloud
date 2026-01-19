"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, AppWindow, Loader2 } from "lucide-react";
import type { App } from "@/db/schemas/apps";

interface AppPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (app: { id: string; name: string; slug: string }) => void;
}

export function AppPickerDialog({ open, onOpenChange, onSelect }: AppPickerDialogProps) {
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open && apps.length === 0) {
      setIsLoading(true);
      fetch("/api/v1/apps")
        .then((res) => res.json())
        .then((data: App[]) => setApps(data))
        .finally(() => setIsLoading(false));
    }
  }, [open, apps.length]);

  const filteredApps = apps.filter((app) =>
    search === "" || app.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (app: App) => {
    onSelect({
      id: app.id,
      name: app.name,
      slug: app.slug,
    });
    onOpenChange(false);
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col bg-neutral-950 border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl">Select App</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps..."
            className="pl-10 bg-white/5 border-white/10"
            autoFocus
          />
        </div>

        {/* App list */}
        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-white/40" />
              <span className="ml-2 text-white/40">Loading apps...</span>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              {apps.length === 0 ? "No apps found. Create an app first." : `No apps matching "${search}"`}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredApps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => handleSelect(app)}
                  className="flex items-center gap-4 p-4 rounded-lg border border-white/10 bg-white/5 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <AppWindow className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">{app.name}</div>
                    {app.description && (
                      <div className="text-sm text-white/40 truncate mt-0.5">
                        {app.description}
                      </div>
                    )}
                    <div className="text-xs text-purple-400 mt-1">
                      {app.total_users} users · {app.total_requests} requests
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
