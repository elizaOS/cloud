"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

const STORAGE_KEY = "agent-onboarding-state";

interface OnboardingState {
  isVisible: boolean;
  isMinimized: boolean;
  agentId: string | null;
  agentName: string | null;
  agentAvatarUrl: string | null;
  completedSteps: string[];
  dismissedAt: number | null;
}

interface AgentOnboardingContextValue extends OnboardingState {
  showChecklist: (agent: {
    id: string;
    name: string;
    avatarUrl?: string;
  }) => void;
  setMinimized: (minimized: boolean) => void;
  toggleStepComplete: (stepId: string) => void;
  dismissChecklist: () => void;
  resetChecklist: () => void;
}

const defaultState: OnboardingState = {
  isVisible: false,
  isMinimized: false,
  agentId: null,
  agentName: null,
  agentAvatarUrl: null,
  completedSteps: [],
  dismissedAt: null,
};

const AgentOnboardingContext =
  createContext<AgentOnboardingContextValue | null>(null);

function loadStateFromStorage(): OnboardingState {
  if (typeof window === "undefined") return defaultState;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        parsed.dismissedAt &&
        Date.now() - parsed.dismissedAt < 24 * 60 * 60 * 1000
      ) {
        return { ...defaultState, dismissedAt: parsed.dismissedAt };
      }
      return { ...defaultState, ...parsed };
    }
  } catch {
  }
  return defaultState;
}

function saveStateToStorage(state: OnboardingState): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
  }
}

export function AgentOnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(defaultState);
  const isInitialized = useRef(false);
  const skipNextSave = useRef(true);

  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      const loadedState = loadStateFromStorage();
      if (JSON.stringify(loadedState) !== JSON.stringify(defaultState)) {
        skipNextSave.current = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydration from localStorage requires setState in effect
        setState(loadedState);
      } else {
        skipNextSave.current = false;
      }
    }
  }, []);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (isInitialized.current) {
      saveStateToStorage(state);
    }
  }, [state]);

  const showChecklist = useCallback(
    (agent: { id: string; name: string; avatarUrl?: string }) => {
      setState((prev) => ({
        ...prev,
        isVisible: true,
        isMinimized: false,
        agentId: agent.id,
        agentName: agent.name,
        agentAvatarUrl: agent.avatarUrl || null,
        completedSteps: [],
        dismissedAt: null,
      }));
    },
    [],
  );

  const setMinimized = useCallback((minimized: boolean) => {
    setState((prev) => ({ ...prev, isMinimized: minimized }));
  }, []);

  const toggleStepComplete = useCallback((stepId: string) => {
    setState((prev) => {
      const isCompleted = prev.completedSteps.includes(stepId);
      return {
        ...prev,
        completedSteps: isCompleted
          ? prev.completedSteps.filter((id) => id !== stepId)
          : [...prev.completedSteps, stepId],
      };
    });
  }, []);

  const dismissChecklist = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isVisible: false,
      dismissedAt: Date.now(),
    }));
  }, []);

  const resetChecklist = useCallback(() => {
    setState(defaultState);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo<AgentOnboardingContextValue>(
    () => ({
      ...state,
      showChecklist,
      setMinimized,
      toggleStepComplete,
      dismissChecklist,
      resetChecklist,
    }),
    [
      state,
      showChecklist,
      setMinimized,
      toggleStepComplete,
      dismissChecklist,
      resetChecklist,
    ],
  );

  return (
    <AgentOnboardingContext.Provider value={value}>
      {children}
    </AgentOnboardingContext.Provider>
  );
}

export function useAgentOnboarding(): AgentOnboardingContextValue {
  const context = useContext(AgentOnboardingContext);
  if (!context) {
    throw new Error(
      "useAgentOnboarding must be used within an AgentOnboardingProvider",
    );
  }
  return context;
}
