/**
 * Chat Store - Zustand
 * Manages chat state including rooms, characters, and selections
 * 
 * NOTE: entityId is now derived from authenticated user, not stored locally
 */

import { create } from "zustand";

export interface RoomItem {
  id: string;
  lastText?: string;
  lastTime?: number;
  characterId?: string;
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
  availableCharacters: Character[];
  selectedCharacterId: string | null;
  pendingMessage: string | null; // Message from landing page to auto-send
  loadRoomsPromise: Promise<void> | null; // Track ongoing loadRooms operation

  // Actions
  setRooms: (rooms: RoomItem[]) => void;
  setRoomId: (roomId: string | null) => void;
  setIsLoadingRooms: (isLoading: boolean) => void;
  setAvailableCharacters: (characters: Character[]) => void;
  setSelectedCharacterId: (characterId: string | null) => void;
  setPendingMessage: (message: string | null) => void;
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

  // Load rooms from API
  // entityId is now derived from authenticated user on the server
  loadRooms: async () => {
    const { setIsLoadingRooms, setRooms } = get();

    setIsLoadingRooms(true);
    try {
      // No entityId needed - server uses authenticated user's ID
      const res = await fetch(`/api/eliza/rooms`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.rooms)) {
          const roomItems: RoomItem[] = data.rooms
            .slice(0, 20)
            .map((r: RoomItem) => ({
              id: r.id,
              characterId: r.characterId,
              lastText: r.lastText,
              lastTime: r.lastTime,
              title: r.title, // AI-generated title
            }));

          setRooms(roomItems);
        }
      }
    } catch (error) {
      console.error("Error loading rooms:", error);
    } finally {
      setIsLoadingRooms(false);
    }
  },

  // Create new room
  // entityId is derived from authenticated user on the server
  createRoom: async (characterId?: string | null) => {
    const { loadRooms, setRoomId } = get();

    try {
      const requestBody = {
        characterId: characterId || undefined,
      };
      console.log("[ChatStore] Creating room with:", requestBody);

      const response = await fetch("/api/eliza/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    try {
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
    } catch (error) {
      console.error("Error deleting room:", error);
    }
  },

  // Clear all chat data on logout
  clearChatData: () => {
    // Clear localStorage items
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("elizaRoomId");
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
    });
  },
}));
