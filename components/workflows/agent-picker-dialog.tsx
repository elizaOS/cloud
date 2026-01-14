"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Bot, Loader2 } from "lucide-react";
import { listCharacters } from "@/app/actions/characters";
import type { ElizaCharacter } from "@/lib/types";
import Image from "next/image";

interface AgentPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (agent: { id: string; name: string; avatarUrl?: string }) => void;
}

export function AgentPickerDialog({ open, onOpenChange, onSelect }: AgentPickerDialogProps) {
  const [agents, setAgents] = useState<ElizaCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open && agents.length === 0) {
      setIsLoading(true);
      listCharacters()
        .then((chars) => setAgents(chars))
        .finally(() => setIsLoading(false));
    }
  }, [open, agents.length]);

  const filteredAgents = agents.filter((agent) =>
    search === "" || agent.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (agent: ElizaCharacter) => {
    onSelect({
      id: agent.id ?? "",
      name: agent.name,
      avatarUrl: agent.avatarUrl,
    });
    onOpenChange(false);
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col bg-neutral-950 border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl">Select Agent</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="pl-10 bg-white/5 border-white/10"
            autoFocus
          />
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-white/40" />
              <span className="ml-2 text-white/40">Loading agents...</span>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              {agents.length === 0 ? "No agents found. Create an agent first." : `No agents matching "${search}"`}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleSelect(agent)}
                  className="flex items-center gap-4 p-4 rounded-lg border border-white/10 bg-white/5 hover:border-[#FF5800]/50 hover:bg-[#FF5800]/5 transition-all text-left"
                >
                  {agent.avatarUrl ? (
                    <Image
                      src={agent.avatarUrl}
                      alt={agent.name}
                      width={48}
                      height={48}
                      className="rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-6 h-6 text-blue-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">{agent.name}</div>
                    {agent.bio && (
                      <div className="text-sm text-white/40 truncate mt-0.5">
                        {Array.isArray(agent.bio) ? agent.bio[0] : agent.bio}
                      </div>
                    )}
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
