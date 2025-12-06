"use client";

import {
  AlertCircle,
  Bot,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  type Agent,
  createAgent,
  deleteAgent,
  listAgents,
  type Pagination,
} from "@/lib/cloud-api";
import { useAuth } from "@/lib/use-auth";

export default function AgentsPage() {
  const router = useRouter();
  const { ready, authenticated } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Redirect to home if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // Fetch agents
  const fetchAgents = useCallback(async (searchQuery?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAgents({ search: searchQuery });
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

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (authenticated) {
        fetchAgents(search || undefined);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, authenticated, fetchAgents]);

  // Create new agent
  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const agent = await createAgent({
        name: "New Agent",
        bio: "A helpful AI assistant.",
      });
      // Navigate to edit the new agent
      router.push(`/agents/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
      setCreating(false);
    }
  };

  // Delete agent
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this agent?")) {
      return;
    }

    setDeleting(id);
    setError(null);
    try {
      await deleteAgent(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete agent");
    } finally {
      setDeleting(null);
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
          <h1 className="text-2xl font-bold text-white">My Agents</h1>
          <p className="mt-1 text-sm text-white/60">
            Create and manage your AI agents
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
          <span>New Agent</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <input
          type="text"
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
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
          <p className="mt-4 text-sm text-white/60">No agents yet</p>
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
            <span>Create your first agent</span>
          </button>
        </div>
      )}

      {/* Agents grid */}
      {!loading && agents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="group relative flex items-start gap-4 rounded-lg border border-white/10 bg-white/5 p-4 transition-colors hover:border-pink-500/30 hover:bg-white/10"
            >
              {/* Avatar */}
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-pink-500/20">
                {agent.avatarUrl ? (
                  <Image
                    src={agent.avatarUrl}
                    alt={agent.name}
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                ) : (
                  <Bot className="h-6 w-6 text-pink-400" />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-medium text-white">{agent.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-white/60">
                  {Array.isArray(agent.bio) ? agent.bio[0] : agent.bio}
                </p>

                {/* Stats */}
                {agent.stats && (
                  <div className="mt-2 flex items-center gap-3 text-xs text-white/40">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {agent.stats.chats || 0} chats
                    </span>
                  </div>
                )}
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(agent.id, e)}
                disabled={deleting === agent.id}
                className="absolute right-3 top-3 rounded p-1 text-white/40 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
              >
                {deleting === agent.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination info */}
      {pagination && pagination.totalCount > 0 && (
        <p className="mt-6 text-center text-sm text-white/40">
          Showing {agents.length} of {pagination.totalCount} agents
        </p>
      )}
    </div>
  );
}
