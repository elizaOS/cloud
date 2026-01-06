"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  GitCommit,
  RotateCcw,
  Clock,
  User,
  Check,
  AlertCircle,
  Loader2,
  GitBranch,
  RefreshCw,
  ChevronDown,
  History,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface HistoryTabProps {
  sessionId: string;
  className?: string;
  onRollbackComplete?: () => void;
  currentCommitSha?: string | null;
}

export function HistoryTab({
  sessionId,
  className,
  onRollbackComplete,
  currentCommitSha,
}: HistoryTabProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollbackingSha, setRollbackingSha] = useState<string | null>(null);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCommits = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/app-builder/sessions/${sessionId}/history`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.commits) {
          setCommits(data.commits);
        }
      } else {
        setError("Failed to fetch commit history");
      }
    } catch (err) {
      setError("Failed to connect to server");
      console.warn("[HistoryTab] Failed to fetch commits:", err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchCommits();
  }, [fetchCommits]);

  const handleRollback = async (sha: string) => {
    if (rollbackingSha) return;

    const commit = commits.find((c) => c.sha === sha);
    const shortSha = sha.substring(0, 7);
    const confirmMessage = `Rollback to commit ${shortSha}?\n\n"${commit?.message.split("\n")[0] || "Unknown"}"\n\nThis will discard any unsaved changes.`;

    if (!window.confirm(confirmMessage)) return;

    setRollbackingSha(sha);

    try {
      const response = await fetch(
        `/api/v1/app-builder/sessions/${sessionId}/rollback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commitSha: sha }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(`Rolled back to ${shortSha}`, {
          description: commit?.message.split("\n")[0],
        });
        onRollbackComplete?.();
        fetchCommits();
      } else {
        toast.error("Rollback failed", {
          description: data.error || "Unknown error",
        });
      }
    } catch (err) {
      toast.error("Rollback failed", {
        description: err instanceof Error ? err.message : "Connection error",
      });
    } finally {
      setRollbackingSha(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className={cn("flex flex-col h-full bg-[#060606]", className)}>
        <div className="flex items-center justify-center h-full">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl animate-pulse" />
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400 relative" />
            </div>
            <p className="text-sm text-white/50 font-medium">Loading history...</p>
          </motion.div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("flex flex-col h-full bg-[#060606]", className)}>
        <div className="flex items-center justify-center h-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 text-center px-6"
          >
            <div className="h-14 w-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-white/70 font-medium mb-1">{error}</p>
              <p className="text-xs text-white/40">Check your connection and try again</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCommits}
              className="mt-2 border-white/10 bg-white/5 hover:bg-white/10 text-white"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Try Again
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  // Empty state
  if (commits.length === 0) {
    return (
      <div className={cn("flex flex-col h-full bg-[#060606]", className)}>
        <div className="flex items-center justify-center h-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 max-w-[280px] text-center px-6"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-white/5 rounded-3xl blur-2xl" />
              <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-white/10">
                <History className="h-9 w-9 text-white/30" />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-white/80 mb-2">No version history</p>
              <p className="text-xs text-white/40 leading-relaxed">
                Save your work to GitHub to create version checkpoints. Each save becomes a restore point.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-[#060606]", className)}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r from-white/[0.02] to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-cyan-500/10">
            <GitBranch className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <div>
            <span className="text-sm font-semibold text-white/90">
              Version History
            </span>
            <span className="ml-2 text-xs text-white/40">
              {commits.length} checkpoint{commits.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchCommits}
          className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10 rounded-lg"
          title="Refresh history"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Timeline */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[15px] top-6 bottom-6 w-[2px] bg-gradient-to-b from-cyan-500/40 via-white/10 to-transparent rounded-full" />

            <div className="space-y-2">
              {commits.map((commit, index) => {
                const isFirst = index === 0;
                const isCurrent = currentCommitSha === commit.sha;
                const isRollingBack = rollbackingSha === commit.sha;
                const isExpanded = expandedCommit === commit.sha;

                return (
                  <motion.div
                    key={commit.sha}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                  >
                    <Collapsible
                      open={isExpanded}
                      onOpenChange={(open) =>
                        setExpandedCommit(open ? commit.sha : null)
                      }
                    >
                      <div
                        className={cn(
                          "group relative pl-10 transition-all duration-200",
                          isExpanded && "pb-1"
                        )}
                      >
                        {/* Timeline node */}
                        <div className="absolute left-0 top-0 flex flex-col items-center">
                          <motion.div
                            className={cn(
                              "relative flex items-center justify-center h-8 w-8 rounded-xl transition-all duration-300",
                              isFirst
                                ? "bg-gradient-to-br from-cyan-400 to-cyan-600 shadow-lg shadow-cyan-500/25"
                                : isCurrent
                                  ? "bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 ring-2 ring-emerald-500/50"
                                  : "bg-white/[0.06] group-hover:bg-white/10"
                            )}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {isFirst ? (
                              <Sparkles className="h-4 w-4 text-white" />
                            ) : isCurrent ? (
                              <Check className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <GitCommit className="h-4 w-4 text-white/40 group-hover:text-white/60" />
                            )}
                            {/* Glow effect for first item */}
                            {isFirst && (
                              <div className="absolute inset-0 rounded-xl bg-cyan-400/30 blur-lg -z-10" />
                            )}
                          </motion.div>
                        </div>

                        {/* Commit card */}
                        <CollapsibleTrigger asChild>
                          <motion.div
                            className={cn(
                              "relative cursor-pointer rounded-xl p-3 transition-all duration-200",
                              "border border-transparent",
                              isExpanded
                                ? "bg-white/[0.06] border-white/10"
                                : "hover:bg-white/[0.04]",
                              isCurrent && !isExpanded && "bg-emerald-500/[0.06] border-emerald-500/20"
                            )}
                            whileHover={{ x: 2 }}
                          >
                            {/* Header row */}
                            <div className="flex items-center gap-2 mb-2">
                              {/* SHA badge */}
                              <span className="inline-flex items-center font-mono text-[11px] font-medium text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                                {commit.sha.substring(0, 7)}
                              </span>

                              {/* Status badges */}
                              {isFirst && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-300 bg-gradient-to-r from-cyan-500/20 to-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                                  <Zap className="h-2.5 w-2.5" />
                                  HEAD
                                </span>
                              )}
                              {isCurrent && !isFirst && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                  <Check className="h-2.5 w-2.5" />
                                  ACTIVE
                                </span>
                              )}

                              {/* Expand chevron */}
                              <motion.div
                                className="ml-auto"
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <ChevronDown className="h-4 w-4 text-white/30" />
                              </motion.div>
                            </div>

                            {/* Commit message */}
                            <p className="text-[13px] text-white/85 font-medium leading-snug mb-2 line-clamp-2 pr-6">
                              {commit.message.split("\n")[0]}
                            </p>

                            {/* Meta info */}
                            <div className="flex items-center gap-4 text-[11px] text-white/40">
                              <span className="flex items-center gap-1.5">
                                <User className="h-3 w-3" />
                                {commit.author}
                              </span>
                              <span
                                className="flex items-center gap-1.5"
                                title={formatFullDate(commit.date)}
                              >
                                <Clock className="h-3 w-3" />
                                {formatDate(commit.date)}
                              </span>
                            </div>

                            {/* Quick rollback button on hover */}
                            {!isFirst && !isCurrent && !isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileHover={{ opacity: 1, scale: 1 }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRollback(commit.sha);
                                  }}
                                  disabled={isRollingBack}
                                  className="h-7 px-2.5 bg-[#FF5800]/10 hover:bg-[#FF5800]/20 text-[#FF5800] border border-[#FF5800]/20 rounded-lg"
                                >
                                  {isRollingBack ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </motion.div>
                            )}
                          </motion.div>
                        </CollapsibleTrigger>

                        {/* Expanded content */}
                        <CollapsibleContent asChild forceMount>
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ 
                                  opacity: 1, 
                                  height: "auto",
                                  transition: {
                                    height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                                    opacity: { duration: 0.2, delay: 0.05 }
                                  }
                                }}
                                exit={{ 
                                  opacity: 0, 
                                  height: 0,
                                  transition: {
                                    height: { duration: 0.2, ease: [0.4, 0, 1, 1] },
                                    opacity: { duration: 0.15 }
                                  }
                                }}
                                className="overflow-hidden"
                              >
                                <div className="px-3 pb-3 space-y-3">
                              {/* Full SHA */}
                              <div className="flex items-center justify-between py-2 px-3 bg-black/30 rounded-lg border border-white/[0.04]">
                                <div>
                                  <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
                                    Full Commit SHA
                                  </p>
                                  <p className="text-xs font-mono text-white/60 select-all">
                                    {commit.sha}
                                  </p>
                                </div>
                              </div>

                              {/* Extended commit message */}
                              {commit.message.includes("\n") && (
                                <div className="py-2 px-3 bg-black/30 rounded-lg border border-white/[0.04]">
                                  <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
                                    Full Message
                                  </p>
                                  <p className="text-xs text-white/50 whitespace-pre-wrap font-mono leading-relaxed">
                                    {commit.message.split("\n").slice(1).join("\n").trim()}
                                  </p>
                                </div>
                              )}

                              {/* Action buttons */}
                              <div className="flex items-center justify-end gap-2 pt-1">
                                {isFirst ? (
                                  <span className="text-xs text-cyan-400/70 flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Latest Version
                                  </span>
                                ) : isCurrent ? (
                                  <span className="text-xs text-emerald-400/70 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                    <Check className="h-3.5 w-3.5" />
                                    Currently Active
                                  </span>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRollback(commit.sha);
                                    }}
                                    disabled={isRollingBack}
                                    className="h-8 px-4 bg-gradient-to-r from-[#FF5800] to-[#FF7033] hover:from-[#FF6A1A] hover:to-[#FF8247] text-white font-medium shadow-lg shadow-[#FF5800]/20 rounded-lg"
                                  >
                                    {isRollingBack ? (
                                      <>
                                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                        Restoring...
                                      </>
                                    ) : (
                                      <>
                                        <RotateCcw className="h-3.5 w-3.5 mr-2" />
                                        Restore This Version
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CollapsibleContent>
                      </div>
                    </Collapsible>
                  </motion.div>
                );
              })}
            </div>

            {/* End of timeline marker */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: commits.length * 0.05 + 0.2 }}
              className="flex items-center gap-3 pl-10 pt-4 text-white/30"
            >
              <div className="absolute left-[11px] h-2 w-2 rounded-full bg-white/20" />
              <span className="text-[11px]">End of history</span>
            </motion.div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
