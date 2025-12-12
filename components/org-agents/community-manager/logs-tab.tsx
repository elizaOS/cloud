/**
 * Logs Tab
 *
 * View moderation event history and manage resolutions.
 */

"use client";

import { useState, useEffect } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import {
  ScrollText,
  AlertCircle,
  Shield,
  Link2,
  MessageSquareX,
  Users,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import type { OrgModerationEvent } from "@/db/schemas/org-community-moderation";

interface LogsTabProps {
  organizationId: string;
  serverId?: string;
}

const EVENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  spam: <AlertCircle className="h-4 w-4 text-yellow-500" />,
  scam: <AlertCircle className="h-4 w-4 text-red-500" />,
  banned_word: <MessageSquareX className="h-4 w-4 text-orange-500" />,
  malicious_link: <Link2 className="h-4 w-4 text-red-500" />,
  phishing: <AlertCircle className="h-4 w-4 text-red-500" />,
  raid: <Users className="h-4 w-4 text-purple-500" />,
  harassment: <AlertCircle className="h-4 w-4 text-pink-500" />,
  nsfw: <AlertCircle className="h-4 w-4 text-pink-500" />,
  manual: <Shield className="h-4 w-4 text-blue-500" />,
  token_gate_fail: <AlertCircle className="h-4 w-4 text-yellow-500" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "text-green-500 bg-green-500/10",
  medium: "text-yellow-500 bg-yellow-500/10",
  high: "text-orange-500 bg-orange-500/10",
  critical: "text-red-500 bg-red-500/10",
};

const ACTION_LABELS: Record<string, string> = {
  warn: "Warned",
  delete: "Deleted",
  timeout: "Timed Out",
  kick: "Kicked",
  ban: "Banned",
};

export function LogsTab({ organizationId, serverId }: LogsTabProps) {
  const [events, setEvents] = useState<OrgModerationEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unresolved" | "resolved">("all");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState<string | null>(null);

  useEffect(() => {
    if (serverId) {
      fetchEvents();
    }
  }, [serverId, filter]);

  const fetchEvents = async () => {
    if (!serverId) return;
    setIsLoading(true);

    const params = new URLSearchParams({ serverId });
    if (filter === "unresolved") params.append("unresolved", "true");
    if (filter === "resolved") params.append("resolved", "true");

    const res = await fetch(`/api/v1/org/moderation/events?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events ?? []);
    }

    setIsLoading(false);
  };

  const handleResolve = async (
    eventId: string,
    falsePositive: boolean,
    notes?: string
  ) => {
    setIsResolving(eventId);

    const res = await fetch(`/api/v1/org/moderation/events/${eventId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ falsePositive, notes }),
    });

    if (res.ok) {
      setEvents(
        events.map((e) =>
          e.id === eventId
            ? { ...e, resolved_at: new Date(), false_positive: falsePositive }
            : e
        )
      );
    }

    setIsResolving(null);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-orange-500" />
          <h3 className="font-semibold">Moderation Logs</h3>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
          >
            <option value="all">All Events</option>
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
          </select>
          <button
            onClick={fetchEvents}
            disabled={isLoading}
            className="p-2 hover:bg-zinc-800 rounded-lg"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Events List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading events...
        </div>
      ) : events.length === 0 ? (
        <BrandCard className="p-8 text-center">
          <CornerBrackets />
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-medium mb-2">No moderation events</h3>
          <p className="text-sm text-muted-foreground">
            Moderation events will appear here when detected
          </p>
        </BrandCard>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <BrandCard key={event.id} className="p-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() =>
                  setExpandedEvent(expandedEvent === event.id ? null : event.id)
                }
              >
                <div className="flex items-center gap-3">
                  {EVENT_TYPE_ICONS[event.event_type] || (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">
                        {event.event_type.replace("_", " ")}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          SEVERITY_COLORS[event.severity]
                        }`}
                      >
                        {event.severity}
                      </span>
                      {event.action_taken && (
                        <span className="text-xs px-2 py-0.5 bg-zinc-800 rounded">
                          {ACTION_LABELS[event.action_taken] || event.action_taken}
                        </span>
                      )}
                      {event.resolved_at && (
                        <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-500 rounded">
                          {event.false_positive ? "False Positive" : "Resolved"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      @{event.platform_username || event.platform_user_id} •{" "}
                      {formatDate(event.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {expandedEvent === event.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </div>

              {/* Expanded Content */}
              {expandedEvent === event.id && (
                <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                  {event.content_sample && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Content
                      </label>
                      <div className="p-2 bg-zinc-900 rounded text-sm font-mono break-all">
                        {event.content_sample}
                      </div>
                    </div>
                  )}

                  {event.matched_pattern && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Matched Pattern
                      </label>
                      <div className="p-2 bg-zinc-900 rounded text-sm font-mono">
                        {event.matched_pattern}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <label className="text-xs text-muted-foreground">Platform</label>
                      <div className="capitalize">{event.platform}</div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Channel</label>
                      <div className="font-mono text-xs">
                        {event.channel_id || "N/A"}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Confidence</label>
                      <div>{event.confidence_score ?? "N/A"}%</div>
                    </div>
                  </div>

                  {/* Resolution Actions */}
                  {!event.resolved_at && (
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResolve(event.id, false);
                        }}
                        disabled={isResolving === event.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg text-sm"
                      >
                        <Check className="h-4 w-4" />
                        Resolve
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResolve(event.id, true);
                        }}
                        disabled={isResolving === event.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg text-sm"
                      >
                        <X className="h-4 w-4" />
                        False Positive
                      </button>
                    </div>
                  )}

                  {event.resolution_notes && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Resolution Notes
                      </label>
                      <div className="p-2 bg-zinc-900 rounded text-sm">
                        {event.resolution_notes}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </BrandCard>
          ))}
        </div>
      )}
    </div>
  );
}

