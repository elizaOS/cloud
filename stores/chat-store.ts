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
}

export interface Character {
  id: string;
  name: string;
  username?: string;
}

interface ChatState {
  // State
  rooms: RoomItem[];
  roomId: string | null;
  isLoadingRooms: boolean;
  entityId: string;
  availableCharacters: Character[];
  selectedCharacterId: string | null;

  // Actions
  setRooms: (rooms: RoomItem[]) => void;
  setRoomId: (roomId: string | null) => void;
  setIsLoadingRooms: (isLoading: boolean) => void;
  setAvailableCharacters: (characters: Character[]) => void;
  setSelectedCharacterId: (characterId: string | null) => void;
  loadRooms: () => Promise<void>;
  createRoom: (characterId?: string | null) => Promise<string | null>;
  deleteRoom: (roomId: string) => Promise<void>;
  initializeEntityId: () => void;
}

// Initialize entity ID from localStorage
const getEntityId = (): string => {
  if (typeof window === "undefined") return "";
  
  let id = window.localStorage.getItem("elizaEntityId");
  if (!id) {
    id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    window.localStorage.setItem("elizaEntityId", id);
  }
  return id;
};

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  rooms: [],
  roomId: null,
  isLoadingRooms: false,
  entityId: "",
  availableCharacters: [],
  selectedCharacterId: null,

  // Setters
  setRooms: (rooms) => set({ rooms }),
  setRoomId: (roomId) => {
    set({ roomId });
    if (roomId && typeof window !== "undefined") {
      window.localStorage.setItem("elizaRoomId", roomId);
    }
  },
  setIsLoadingRooms: (isLoading) => set({ isLoadingRooms: isLoading }),
  setAvailableCharacters: (characters) => set({ availableCharacters: characters }),
  setSelectedCharacterId: (characterId) => set({ selectedCharacterId: characterId }),

  // Initialize entity ID
  initializeEntityId: () => {
    const entityId = getEntityId();
    set({ entityId });
  },

  // Load rooms from API
  loadRooms: async () => {
    let { entityId, setIsLoadingRooms, setRooms } = get();
    
    // Ensure entityId is initialized
    if (!entityId) {
      const newEntityId = getEntityId();
      set({ entityId: newEntityId });
      entityId = newEntityId;
    }
    
    setIsLoadingRooms(true);
    try {
      const params = new URLSearchParams({ entityId });
      const res = await fetch(`/api/eliza/rooms?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.rooms)) {
          const roomItems: RoomItem[] = data.rooms.slice(0, 20).map((r: any) => ({
            id: r.id,
            characterId: r.characterId,
            lastText: r.lastText,
            lastTime: r.lastTime,
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
  createRoom: async (characterId?: string | null) => {
    let { entityId, loadRooms, setRoomId } = get();
    
    // Ensure entityId is initialized
    if (!entityId) {
      const newEntityId = getEntityId();
      set({ entityId: newEntityId });
      entityId = newEntityId;
    }
    
    try {
      const response = await fetch("/api/eliza/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId,
          characterId: characterId || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newRoomId = data.roomId;
        
        // Reload rooms to get the updated list
        await loadRooms();
        
        // Automatically switch to the new room
        setRoomId(newRoomId);
        
        return newRoomId;
      }
      return null;
    } catch (error) {
      console.error("Error creating room:", error);
      return null;
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
}));

