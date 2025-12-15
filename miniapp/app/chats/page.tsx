"use client";

import { AlertCircle, Bot, Gift, Loader2, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ShareModal, useShareStatus } from "@/components/share-modal";
import { type Agent, createAgent, listAgents } from "@/lib/cloud-api";
import { useAuth } from "@/lib/use-auth";

export default function ChatsPage() {
  const router = useRouter();
  const { ready, authenticated } = useAuth();
  const { allClaimedToday, availableToday } = useShareStatus();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listAgents();
    setAgents(result.agents);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated) {
      // Defer fetch to avoid cascading renders
      queueMicrotask(() => {
        fetchAgents();
      });
    }
  }, [authenticated, fetchAgents]);

  // Create new agent
  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    const agent = await createAgent({
      name: "New Agent",
      bio: "A helpful AI assistant.",
    });
    // Navigate to chat with the new agent
    router.push(`/chats/${agent.id}`);
    setCreating(false);
  };

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="text-brand h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Friends</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Show Earn Credits button - hide only when definitely all claimed */}
          {allClaimedToday !== true && (
            <button
              onClick={() => setShareModalOpen(true)}
              className="from-brand/20 to-accent-brand/20 border-brand/30 text-brand-400 hover:from-brand/30 hover:to-accent-brand/30 flex items-center gap-2 rounded-lg border bg-gradient-to-r px-4 py-2 text-sm font-medium transition-colors"
            >
              <Gift className="h-4 w-4" />
              <span>
                {availableToday > 0
                  ? `Earn ${Math.round(availableToday).toLocaleString()} credits`
                  : "Share & Earn"}
              </span>
            </button>
          )}
          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-brand hover:bg-brand-600 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span>New Friend</span>
          </button>
        </div>
      </div>

      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="text-brand h-8 w-8 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 py-16">
          <Bot className="h-12 w-12 text-white/20" />
          <p className="mt-4 text-sm text-white/60">No friends yet</p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-brand hover:bg-brand-600 mt-4 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span>Create your first friend</span>
          </button>
        </div>
      )}

      {/* Agents grid */}
      {!loading && agents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/chats/${agent.id}`}
              className="group hover:border-brand/30 hover:shadow-brand/5 relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] transition-all hover:shadow-lg"
            >
              {/* Agent Image */}
              <div className="from-brand/20 to-accent-brand/20 relative aspect-square w-full overflow-hidden bg-gradient-to-br">
                {agent.avatarUrl ? (
                  agent.avatarUrl.startsWith("data:") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={agent.avatarUrl}
                      alt={agent.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <Image
                      src={agent.avatarUrl}
                      alt={agent.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  )
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Bot className="text-brand-400/50 h-16 w-16" />
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              </div>

              {/* Content - overlaid on bottom */}
              <div className="absolute right-0 bottom-0 left-0 p-4">
                <h3 className="truncate text-lg font-semibold text-white">
                  {agent.name}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-white/70">
                  {Array.isArray(agent.bio) ? agent.bio[0] : agent.bio}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
