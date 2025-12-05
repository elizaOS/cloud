"use client";

import {
  AlertCircle,
  Bot,
  Loader2,
  Plus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  type Agent,
  createAgent,
  listAgents,
  type Pagination,
} from "@/lib/cloud-api";
import { useAuth } from "@/lib/use-auth";

export default function ChatsPage() {
  const router = useRouter();
  const { ready, authenticated } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const result = await listAgents();
      setAgents(result.agents);
      setPagination(result.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchAgents();
    }
  }, [authenticated, fetchAgents]);

  // Create new agent
  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const agent = await createAgent({
        name: "New Agent",
        bio: "A helpful AI assistant.",
      });
      // Navigate to chat with the new agent
      router.push(`/chats/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
      setCreating(false);
    }
  };

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Characters</h1>
          <p className="mt-1 text-sm text-white/60">
            Chat with your AI companions
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pink-600 disabled:opacity-50"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span>New Character</span>
        </button>
      </div>

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
          <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
        </div>
      )}

      {/* Empty state */}
      {!loading && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 py-16">
          <Bot className="h-12 w-12 text-white/20" />
          <p className="mt-4 text-sm text-white/60">No characters yet</p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-4 flex items-center gap-2 rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pink-600 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span>Create your first character</span>
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
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] transition-all hover:border-pink-500/30 hover:shadow-lg hover:shadow-pink-500/5"
            >
              {/* Agent Image */}
              <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-pink-500/20 to-purple-500/20">
                {agent.avatarUrl ? (
                  <Image
                    src={agent.avatarUrl}
                    alt={agent.name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Bot className="h-16 w-16 text-pink-400/50" />
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              </div>

              {/* Content - overlaid on bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
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

      {/* Pagination info */}
      {pagination && pagination.totalCount > 0 && (
        <p className="mt-6 text-center text-sm text-white/40">
          Showing {agents.length} of {pagination.totalCount} characters
        </p>
      )}
    </div>
  );
}
