"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Bot, Check, Plus, Search, X, Sparkles, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

export interface Agent {
  id: string;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | string[];
  is_public?: boolean;
}

interface AgentPickerProps {
  agents: Agent[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  maxSelection?: number;
  className?: string;
  loading?: boolean;
}

/**
 * AgentPicker - Beautiful multi-select agent picker
 * Allows selecting up to maxSelection (default 4) AI agents for an app
 */
export function AgentPicker({
  agents,
  selectedIds,
  onSelectionChange,
  maxSelection = 4,
  className,
  loading = false,
}: AgentPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter agents based on search
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents;
    const query = searchQuery.toLowerCase();
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.username?.toLowerCase().includes(query) ||
        (typeof agent.bio === "string" &&
          agent.bio.toLowerCase().includes(query)),
    );
  }, [agents, searchQuery]);

  // Get selected agents in order
  const selectedAgents = useMemo(() => {
    return selectedIds
      .map((id) => agents.find((a) => a.id === id))
      .filter(Boolean) as Agent[];
  }, [selectedIds, agents]);

  const toggleAgent = (agentId: string) => {
    if (selectedIds.includes(agentId)) {
      // Remove agent
      onSelectionChange(selectedIds.filter((id) => id !== agentId));
    } else if (selectedIds.length < maxSelection) {
      // Add agent
      onSelectionChange([...selectedIds, agentId]);
    }
  };

  const removeAgent = (agentId: string) => {
    onSelectionChange(selectedIds.filter((id) => id !== agentId));
  };

  const getBioPreview = (bio: string | string[] | undefined): string => {
    if (!bio) return "No description";
    const text = Array.isArray(bio) ? bio[0] : bio;
    return text.length > 80 ? text.slice(0, 77) + "..." : text;
  };

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with selection count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/20">
            <Users className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">App Agents</h3>
            <p className="text-xs text-white/50">
              Select up to {maxSelection} AI agents
            </p>
          </div>
        </div>
        <div className="px-2 py-1 rounded-full bg-white/5 border border-white/10">
          <span className="text-xs font-mono text-white/60">
            {selectedIds.length}/{maxSelection}
          </span>
        </div>
      </div>

      {/* Selected Agents Pills */}
      {selectedAgents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedAgents.map((agent, index) => (
            <div
              key={agent.id}
              className={cn(
                "flex items-center gap-2 pl-1 pr-2 py-1 rounded-full",
                "bg-gradient-to-r border transition-all duration-300",
                index === 0
                  ? "from-violet-500/20 to-violet-500/10 border-violet-500/30"
                  : index === 1
                    ? "from-cyan-500/20 to-cyan-500/10 border-cyan-500/30"
                    : index === 2
                      ? "from-amber-500/20 to-amber-500/10 border-amber-500/30"
                      : "from-pink-500/20 to-pink-500/10 border-pink-500/30",
              )}
            >
              {agent.avatar_url ? (
                <Image
                  src={agent.avatar_url}
                  alt={agent.name}
                  width={20}
                  height={20}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-white/60" />
                </div>
              )}
              <span className="text-xs font-medium text-white">
                {agent.name}
              </span>
              <button
                onClick={() => removeAgent(agent.id)}
                className="p-0.5 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="h-3 w-3 text-white/50 hover:text-white/80" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search agents..."
          className="pl-10 bg-white/5 border-white/10 focus:border-violet-500/50 text-sm"
        />
      </div>

      {/* Agent Grid */}
      <ScrollArea className="max-h-[320px] pr-3">
        <div className="grid gap-2">
          {filteredAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="p-3 rounded-full bg-white/5 mb-3">
                <Bot className="h-6 w-6 text-white/30" />
              </div>
              <p className="text-sm text-white/50">
                {searchQuery
                  ? "No agents match your search"
                  : "No agents available"}
              </p>
              <p className="text-xs text-white/30 mt-1">
                Create agents in the Build tab first
              </p>
            </div>
          ) : (
            filteredAgents.map((agent) => {
              const isSelected = selectedIds.includes(agent.id);
              const isDisabled =
                !isSelected && selectedIds.length >= maxSelection;

              return (
                <button
                  key={agent.id}
                  onClick={() => !isDisabled && toggleAgent(agent.id)}
                  disabled={isDisabled}
                  className={cn(
                    "group relative flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-300",
                    "border touch-manipulation",
                    isSelected
                      ? "bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border-violet-500/30 ring-1 ring-violet-500/20"
                      : isDisabled
                        ? "bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed"
                        : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20",
                  )}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {agent.avatar_url ? (
                      <Image
                        src={agent.avatar_url}
                        alt={agent.name}
                        width={44}
                        height={44}
                        className="rounded-xl object-cover ring-2 ring-white/5"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-white/60" />
                      </div>
                    )}
                    {agent.is_public && (
                      <div className="absolute -top-1 -right-1 p-0.5 rounded-full bg-green-500/20 border border-green-500/30">
                        <Sparkles className="h-2.5 w-2.5 text-green-400" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white truncate">
                        {agent.name}
                      </span>
                      {agent.username && (
                        <span className="text-xs text-white/40 truncate">
                          @{agent.username}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
                      {getBioPreview(agent.bio)}
                    </p>
                  </div>

                  {/* Selection indicator */}
                  <div
                    className={cn(
                      "flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300",
                      isSelected
                        ? "bg-violet-500 border-violet-500"
                        : "border-white/20 group-hover:border-white/40",
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Helper text */}
      <p className="text-xs text-white/40 text-center">
        Selected agents will be available for chat in your app via the SDK
      </p>
    </div>
  );
}

/**
 * CompactAgentPicker - Smaller version for inline use
 */
export function CompactAgentPicker({
  agents,
  selectedIds,
  onSelectionChange,
  maxSelection = 4,
}: AgentPickerProps) {
  const selectedAgents = useMemo(() => {
    return selectedIds
      .map((id) => agents.find((a) => a.id === id))
      .filter(Boolean) as Agent[];
  }, [selectedIds, agents]);

  const availableAgents = useMemo(() => {
    return agents.filter((a) => !selectedIds.includes(a.id));
  }, [agents, selectedIds]);

  const addAgent = (agentId: string) => {
    if (selectedIds.length < maxSelection) {
      onSelectionChange([...selectedIds, agentId]);
    }
  };

  const removeAgent = (agentId: string) => {
    onSelectionChange(selectedIds.filter((id) => id !== agentId));
  };

  return (
    <div className="space-y-3">
      {/* Selected */}
      <div className="flex flex-wrap gap-2">
        {selectedAgents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"
          >
            {agent.avatar_url ? (
              <Image
                src={agent.avatar_url}
                alt={agent.name}
                width={20}
                height={20}
                className="rounded-full object-cover"
              />
            ) : (
              <Bot className="h-4 w-4 text-violet-400" />
            )}
            <span className="text-xs font-medium text-white">{agent.name}</span>
            <button
              onClick={() => removeAgent(agent.id)}
              className="p-0.5 rounded hover:bg-white/10"
            >
              <X className="h-3 w-3 text-white/50" />
            </button>
          </div>
        ))}

        {/* Add button */}
        {selectedIds.length < maxSelection && availableAgents.length > 0 && (
          <select
            onChange={(e) => {
              if (e.target.value) {
                addAgent(e.target.value);
                e.target.value = "";
              }
            }}
            className="px-2 py-1.5 rounded-lg bg-white/5 border border-dashed border-white/20 text-xs text-white/60 cursor-pointer hover:border-white/40 transition-colors"
          >
            <option value="">+ Add agent</option>
            {availableAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedIds.length === 0 && (
        <p className="text-xs text-white/40">No agents selected</p>
      )}
    </div>
  );
}

export default AgentPicker;
