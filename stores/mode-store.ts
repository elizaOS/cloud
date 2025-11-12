/**
 * Mode Store - Zustand
 * Manages chat vs build mode state
 */

import { create } from "zustand";

export type ChatMode = "chat" | "build";

interface ModeState {
  // State
  mode: ChatMode;

  // Actions
  setMode: (mode: ChatMode) => void;
  toggleMode: () => void;
}

export const useModeStore = create<ModeState>((set, get) => ({
  // Initial state
  mode: "chat",

  // Setters
  setMode: (mode) => set({ mode }),

  toggleMode: () => {
    const current = get().mode;
    set({ mode: current === "chat" ? "build" : "chat" });
  },
}));
