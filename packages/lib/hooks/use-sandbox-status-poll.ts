"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SandboxStatus =
  | "pending"
  | "provisioning"
  | "running"
  | "stopped"
  | "disconnected"
  | "error";

export interface SandboxStatusResult {
  status: SandboxStatus;
  lastHeartbeat: string | null;
  error: string | null;
  isLoading: boolean;
}

const TERMINAL_STATES = new Set<SandboxStatus>(["running", "stopped", "error"]);
const ACTIVE_STATES = new Set<SandboxStatus>(["pending", "provisioning"]);

/**
 * Polls a single agent's status while it's in a non-terminal state.
 * Stops automatically when the agent reaches "running", "stopped", or "error".
 */
export function useSandboxStatusPoll(
  agentId: string | null,
  options: {
    intervalMs?: number;
    enabled?: boolean;
  } = {},
) {
  const { intervalMs = 5_000, enabled = true } = options;
  const [result, setResult] = useState<SandboxStatusResult>({
    status: "pending",
    lastHeartbeat: null,
    error: null,
    isLoading: false,
  });

  const cancelledRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<SandboxStatus>("pending");

  const cleanup = useCallback(() => {
    cancelledRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!agentId || !enabled) {
      cleanup();
      return;
    }

    cancelledRef.current = false;

    const poll = async () => {
      if (cancelledRef.current) return;
      if (TERMINAL_STATES.has(statusRef.current)) {
        cleanup();
        return;
      }

      setResult((prev) => ({ ...prev, isLoading: true }));

      try {
        const res = await fetch(`/api/v1/milady/agents/${agentId}`);
        if (cancelledRef.current) return;

        if (!res.ok) {
          setResult((prev) => ({
            ...prev,
            isLoading: false,
            error: `HTTP ${res.status}`,
          }));
          return;
        }

        const json = await res.json();
        const data = json?.data;
        if (!data) return;

        const newStatus = (data.status as SandboxStatus) ?? "pending";
        statusRef.current = newStatus;

        setResult({
          status: newStatus,
          lastHeartbeat: data.lastHeartbeatAt ?? null,
          error: data.errorMessage ?? null,
          isLoading: false,
        });

        // Stop polling once we've reached a terminal state
        if (TERMINAL_STATES.has(newStatus)) {
          cleanup();
        }
      } catch {
        if (!cancelledRef.current) {
          setResult((prev) => ({ ...prev, isLoading: false }));
        }
      }
    };

    // Initial poll
    void poll();

    // Set up interval
    intervalRef.current = setInterval(() => void poll(), intervalMs);

    return cleanup;
  }, [agentId, enabled, intervalMs, cleanup]);

  return result;
}

/**
 * Polls the agent list endpoint while any sandbox is in an active state.
 * Returns true when any sandbox transitions to 'running'.
 */
export function useSandboxListPoll(
  sandboxes: Array<{ id: string; status: string }>,
  options: {
    intervalMs?: number;
    onTransitionToRunning?: (agentId: string, agentName?: string) => void;
  } = {},
) {
  const { intervalMs = 10_000, onTransitionToRunning } = options;
  const [isPolling, setIsPolling] = useState(false);
  const previousStatusesRef = useRef<Map<string, string>>(new Map());
  const callbackRef = useRef(onTransitionToRunning);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    callbackRef.current = onTransitionToRunning;
  }, [onTransitionToRunning]);

  // Sync current sandbox statuses
  useEffect(() => {
    const statusMap = new Map<string, string>();
    for (const sb of sandboxes) {
      statusMap.set(sb.id, sb.status);
    }
    previousStatusesRef.current = statusMap;
  }, [sandboxes]);

  const hasActiveAgents = sandboxes.some((sb) =>
    ACTIVE_STATES.has(sb.status as SandboxStatus),
  );

  useEffect(() => {
    if (!hasActiveAgents) {
      setIsPolling(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setIsPolling(true);
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;

      try {
        const res = await fetch("/api/v1/milady/agents");
        if (cancelled || !res.ok) return;

        const json = await res.json();
        const agents: Array<{ id: string; status: string; agentName?: string; agent_name?: string }> =
          json?.data ?? [];

        for (const agent of agents) {
          const prevStatus = previousStatusesRef.current.get(agent.id);
          const newStatus = agent.status;

          if (
            prevStatus &&
            ACTIVE_STATES.has(prevStatus as SandboxStatus) &&
            newStatus === "running"
          ) {
            callbackRef.current?.(agent.id, agent.agentName ?? agent.agent_name);
          }

          previousStatusesRef.current.set(agent.id, newStatus);
        }
      } catch {
        // Silently retry on next interval
      }
    };

    intervalRef.current = setInterval(() => void poll(), intervalMs);

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasActiveAgents, intervalMs]);

  return { isPolling };
}
