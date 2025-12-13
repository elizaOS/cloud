/**
 * Chat Store - Zustand
 * Manages chat state including rooms, characters, and selections
 */

import { create } from "zustand";

export interface RoomItem {
  id: string;
  lastText?: string;
  lastTime?: number;
  characterId?: string;
  characterName?: string;
  title?: string; // AI-generated title from first user message
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
  entityId: string;
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
  loadRooms: (force?: boolean) => Promise<void>;
  createRoom: (characterId?: string | null) => Promise<string | null>;
  deleteRoom: (roomId: string) => Promise<void>;
  initializeEntityId: () => void;
  clearChatData: () => void;
}

// Initialize entity ID from localStorage
// CRITICAL: Always returns a valid ID, never empty
const getEntityId = (): string => {
  if (typeof window === "undefined") {
    // SSR fallback - return temporary ID
    return `user-ssr-${Math.random().toString(36).substring(2, 9)}`;
  }

  let id = window.localStorage.getItem("elizaEntityId");
  if (!id || id.trim() === "") {
    // Generate new ID with timestamp and random component for uniqueness
    id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    window.localStorage.setItem("elizaEntityId", id);
    console.log("[ChatStore] Generated new entityId:", id);
  }
  return id;
};

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  rooms: [],
  roomId: null,
  isLoadingRooms: false,
  entityId: getEntityId(), // CRITICAL: Initialize immediately, never empty
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

  // Initialize entity ID
  initializeEntityId: () => {
    const entityId = getEntityId();
    set({ entityId });
  },

  // Load rooms from API
  loadRooms: async (force = false) => {
    const state = get();
    let { entityId, anonymousSessionToken } = state;

    // Ensure entityId is initialized
    if (!entityId || entityId.trim() === "") {
      const newEntityId = getEntityId();
      set({ entityId: newEntityId });
      entityId = newEntityId;
    }

    // Deduplicate concurrent loadRooms calls
    if (!force && state.loadRoomsPromise) {
      console.log("[ChatStore] loadRooms - using existing promise");
      return state.loadRoomsPromise;
    }

    console.log("[ChatStore] loadRooms - fetching rooms for entityId:", entityId, "sessionToken:", anonymousSessionToken?.slice(0, 8) + "...");

    const loadPromise = (async () => {
      set({ isLoadingRooms: true });
      try {
        const params = new URLSearchParams({ entityId });
        // CRITICAL: Pass session token to preserve session identity
        if (anonymousSessionToken) {
          params.set("sessionToken", anonymousSessionToken);
        }
        const res = await fetch(`/api/eliza/rooms?${params.toString()}`, {
          headers: {
            // Also pass as header for redundancy
            ...(anonymousSessionToken && { "X-Anonymous-Session": anonymousSessionToken }),
          },
        });
        if (res.ok) {
          const data = await res.json();
          console.log("[ChatStore] loadRooms - API response:", { 
            roomCount: data.rooms?.length || 0, 
            rooms: data.rooms?.map((r: Record<string, unknown>) => ({ id: r.id, characterId: r.characterId })) 
          });
          if (Array.isArray(data.rooms)) {
            const roomItems: RoomItem[] = data.rooms
              .slice(0, 20)
              .map((r: Record<string, unknown>) => ({
                id: r.id as string,
                characterId: r.characterId as string | undefined,
                characterName: r.characterName as string | undefined,
                lastText: r.lastText as string | undefined,
                lastTime: r.lastTime as number | undefined,
                title: r.title as string | undefined,
              }));

            const currentState = get();
            const existingCharacterIds = new Set(currentState.availableCharacters.map(c => c.id));

            const charactersFromRooms: Character[] = [];
            for (const room of roomItems) {
              if (room.characterId && room.characterName && !existingCharacterIds.has(room.characterId)) {
                charactersFromRooms.push({
                  id: room.characterId,
                  name: room.characterName,
                });
                existingCharacterIds.add(room.characterId);
              }
            }

            const mergedCharacters = [...currentState.availableCharacters, ...charactersFromRooms];

            let newSelectedCharacterId = currentState.selectedCharacterId;
            if (!newSelectedCharacterId && charactersFromRooms.length === 1 && currentState.availableCharacters.length === 0) {
              newSelectedCharacterId = charactersFromRooms[0].id;
              console.log("[ChatStore] Auto-selecting character:", newSelectedCharacterId);
            }

            set({
              rooms: roomItems,
              availableCharacters: mergedCharacters,
              selectedCharacterId: newSelectedCharacterId,
            });
          }
        } else {
          console.error("[ChatStore] loadRooms - API error:", res.status, await res.text());
        }
      } catch (error) {
        console.error("[ChatStore] Error loading rooms:", error);
      } finally {
        set({ isLoadingRooms: false, loadRoomsPromise: null });
      }
    })();

    set({ loadRoomsPromise: loadPromise });
    return loadPromise;
  },

  // Create new room
  createRoom: async (characterId?: string | null) => {
    let { entityId, loadRooms, setRoomId, anonymousSessionToken } = get();

    // Ensure entityId is initialized
    if (!entityId) {
      const newEntityId = getEntityId();
      set({ entityId: newEntityId });
      entityId = newEntityId;
    }

    try {
      const requestBody = {
        entityId,
        characterId: characterId || undefined,
        // CRITICAL: Pass the session token to preserve anonymous session identity
        sessionToken: anonymousSessionToken || undefined,
      };
      console.log("[ChatStore] Creating room with:", requestBody);

      const response = await fetch("/api/eliza/rooms", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          // Also pass as header for redundancy
          ...(anonymousSessionToken && { "X-Anonymous-Session": anonymousSessionToken }),
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("[ChatStore] Room creation response:", data);
        const newRoomId = data.roomId;

        if (!newRoomId) {
          console.error("[ChatStore] API returned empty roomId:", data);
          throw new Error(
            "Room creation succeeded but returned empty ID. Check server logs.",
          );
        }

        // Automatically switch to the new room FIRST (before loading rooms)
        // This ensures the UI updates immediately
        setRoomId(newRoomId);

        // Then reload rooms to get the updated list (fire-and-forget)
        loadRooms().catch((err) => {
          console.error(
            "[ChatStore] Failed to reload rooms after creation:",
            err,
          );
        });

        return newRoomId;
      } else {
        // Log the error response for debugging
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        console.error("Failed to create room:", response.status, errorData);
        throw new Error(
          errorData.error || `Failed to create room: ${response.status}`,
        );
      }
    } catch (error) {
      console.error("Error creating room:", error);
      throw error; // Re-throw the error so it can be handled by the caller
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
    } else {
      console.error("Error deleting room:", response.status);
    }
  },

  // Clear all chat data on logout
  clearChatData: () => {
    // Clear localStorage items
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("elizaEntityId");
      window.localStorage.removeItem("elizaRoomId");
      window.localStorage.removeItem("eliza-anon-session-token");
    }

    // Reset store state
    set({
      rooms: [],
      roomId: null,
      isLoadingRooms: false,
      entityId: getEntityId(), // Re-initialize with new ID
      availableCharacters: [],
      selectedCharacterId: null,
      pendingMessage: null,
      loadRoomsPromise: null,
      anonymousSessionToken: null,
    });
  },
}));

// Subscribe to migration events to clear anonymous session token
// This is called when the PrivyProvider successfully migrates an anonymous session
if (typeof window !== "undefined") {
  window.addEventListener("anonymous-session-migrated", () => {
    console.log("[ChatStore] Received anonymous-session-migrated event, clearing token");
    useChatStore.getState().setAnonymousSessionToken(null);
  });
}
