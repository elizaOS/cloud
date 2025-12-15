/**
 * Chat Store - Zustand
 * Manages chat state including rooms, characters, and selections
 *
 * NOTE: entityId is now derived from authenticated user on the server, not stored locally.
 * This is a security improvement - clients cannot spoof their identity.
 */

import { create } from "zustand";
import type { RoomPreview } from "@/lib/services/agents/rooms";

export interface RoomItem {
  id: string;
  lastText?: string;
  lastTime?: number;
  characterId?: string;
  characterName?: string;
  title?: string; // AI-generated title from first user message
  isLocked?: boolean; // Whether the room is locked (character was created/saved)
  isBuildRoom?: boolean; // Whether this is a BUILD/CREATOR room
}

export interface Character {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
}

interface ChatState {
  // State
  rooms: RoomItem[];
  roomId: string | null;
  isLoadingRooms: boolean;
  availableCharacters: Character[];
  selectedCharacterId: string | null;
  pendingMessage: string | null; // Message from landing page to auto-send
  loadRoomsPromise: Promise<void> | null; // Track ongoing loadRooms operation
  anonymousSessionToken: string | null; // Session token for anonymous users (from URL)

  // Actions
  setRooms: (rooms: RoomItem[]) => void;
  setRoomId: (roomId: string | null) => void;
  setIsLoadingRooms: (isLoading: boolean) => void;
  setAvailableCharacters: (characters: Character[]) => void;
  setSelectedCharacterId: (characterId: string | null) => void;
  setPendingMessage: (message: string | null) => void;
  setAnonymousSessionToken: (token: string | null) => void;
  updateCharacterAvatar: (characterId: string, avatarUrl: string) => void;
  loadRooms: (force?: boolean) => Promise<void>;
  createRoom: (characterId?: string | null) => Promise<string | null>;
  deleteRoom: (roomId: string) => Promise<void>;
  clearChatData: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  rooms: [],
  roomId: null,
  isLoadingRooms: false,
  availableCharacters: [],
  selectedCharacterId: null,
  pendingMessage: null,
  loadRoomsPromise: null,
  anonymousSessionToken: null,

  // Setters
  setRooms: (rooms) => set({ rooms }),
  setRoomId: (roomId) => {
    set({ roomId });
    if (roomId && typeof window !== "undefined") {
      window.localStorage.setItem("elizaRoomId", roomId);
    }
  },
  setIsLoadingRooms: (isLoading) => set({ isLoadingRooms: isLoading }),
  setAvailableCharacters: (characters) =>
    set({ availableCharacters: characters }),
  setSelectedCharacterId: (characterId) =>
    set({ selectedCharacterId: characterId }),
  setPendingMessage: (message) => set({ pendingMessage: message }),
  setAnonymousSessionToken: (token) => set({ anonymousSessionToken: token }),

  // Update a character's avatar URL (used when avatar is generated in build mode)
  updateCharacterAvatar: (characterId, avatarUrl) => {
    const { availableCharacters } = get();
    const updatedCharacters = availableCharacters.map((char) =>
      char.id === characterId ? { ...char, avatarUrl } : char,
    );
    set({ availableCharacters: updatedCharacters });
  },

  // Load rooms from API
  // entityId is now derived from authenticated user on the server
  loadRooms: async (force = false) => {
    const state = get();
    const { anonymousSessionToken } = state;

    // Deduplicate concurrent loadRooms calls
    if (!force && state.loadRoomsPromise) {
      return state.loadRoomsPromise;
    }

    const loadPromise = (async () => {
      set({ isLoadingRooms: true });

      // Server derives entityId from authenticated user
      const headers: Record<string, string> = {};

      // Pass anonymous session token if available (for affiliate flows)
      if (anonymousSessionToken) {
        headers["X-Anonymous-Session"] = anonymousSessionToken;
      }

      const res = await fetch(`/api/eliza/rooms`, { headers });

      if (res.ok) {
        const data = await res.json();

        if (Array.isArray(data.rooms)) {
          const roomItems: RoomItem[] = data.rooms
            .slice(0, 20)
            .map((r: RoomPreview) => ({
              id: r.id,
              characterId: r.characterId,
              characterName: r.characterName,
              lastText: r.lastText,
              lastTime: r.lastTime,
              title: r.title,
              isLocked: r.isLocked,
              isBuildRoom: r.isBuildRoom,
            }));

          const currentState = get();
          const existingCharacterIds = new Set(
            currentState.availableCharacters.map((c) => c.id),
          );

          const charactersFromRooms: Character[] = [];
          for (const room of data.rooms as RoomPreview[]) {
            if (
              room.characterId &&
              room.characterName &&
              !existingCharacterIds.has(room.characterId)
            ) {
              charactersFromRooms.push({
                id: room.characterId,
                name: room.characterName,
                avatarUrl: room.characterAvatarUrl,
              });
              existingCharacterIds.add(room.characterId);
            }
          }

          const mergedCharacters = [
            ...currentState.availableCharacters,
            ...charactersFromRooms,
          ];

          let newSelectedCharacterId = currentState.selectedCharacterId;
          if (
            !newSelectedCharacterId &&
            charactersFromRooms.length === 1 &&
            currentState.availableCharacters.length === 0
          ) {
            newSelectedCharacterId = charactersFromRooms[0].id;
          }

          set({
            rooms: roomItems,
            availableCharacters: mergedCharacters,
            selectedCharacterId: newSelectedCharacterId,
          });
        }
      }

      set({ isLoadingRooms: false, loadRoomsPromise: null });
    })();

    set({ loadRoomsPromise: loadPromise });
    return loadPromise;
  },

  // Create new room
  // entityId is derived from authenticated user on the server
  createRoom: async (characterId?: string | null) => {
    const { loadRooms, setRoomId, anonymousSessionToken } = get();

    const requestBody: Record<string, string | undefined> = {
      characterId: characterId || undefined,
    };

    // Pass the session token for anonymous users
    if (anonymousSessionToken) {
      requestBody.sessionToken = anonymousSessionToken;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Also pass as header for redundancy
    if (anonymousSessionToken) {
      headers["X-Anonymous-Session"] = anonymousSessionToken;
    }

    const response = await fetch("/api/eliza/rooms", {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      const data = await response.json();
      const newRoomId = data.roomId;

      if (!newRoomId) {
        throw new Error(
          "Room creation succeeded but returned empty ID. Check server logs.",
        );
      }

      // Automatically switch to the new room FIRST (before loading rooms)
      // This ensures the UI updates immediately
      setRoomId(newRoomId);

      // Then reload rooms to get the updated list (fire-and-forget)
      void loadRooms();

      return newRoomId;
    } else {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Failed to create room: ${response.status}`,
      );
    }
  },

  // Delete room
  deleteRoom: async (roomIdToDelete: string) => {
    const { rooms, roomId, setRooms, setRoomId } = get();

    const response = await fetch(`/api/eliza/rooms/${roomIdToDelete}`, {
      method: "DELETE",
    });

    if (response.ok) {
      // Remove from local state
      setRooms(rooms.filter((r) => r.id !== roomIdToDelete));

      // If deleted room was selected, clear selection
      if (roomId === roomIdToDelete) {
        setRoomId(null);
        // Also clear from localStorage
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("elizaRoomId");
        }
      }
    }
  },

  // Clear all chat data on logout
  clearChatData: () => {
    // Clear localStorage items
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("elizaRoomId");
      window.localStorage.removeItem("eliza-anon-session-token");
    }

    // Reset store state
    set({
      rooms: [],
      roomId: null,
      isLoadingRooms: false,
      availableCharacters: [],
      selectedCharacterId: null,
      pendingMessage: null,
      loadRoomsPromise: null,
      anonymousSessionToken: null,
    });
  },
}));

// Subscribe to migration events to clear anonymous session token
if (typeof window !== "undefined") {
  window.addEventListener("anonymous-session-migrated", () => {
    useChatStore.getState().setAnonymousSessionToken(null);
  });
}
