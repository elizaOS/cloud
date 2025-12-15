import { group, sleep } from "k6";
import { getConfig } from "../../config/environments";
import { httpGet, httpPost } from "../../helpers/http";
import { roomsCreated } from "../../helpers/metrics";

const config = getConfig();

interface Room {
  id: string;
  name: string;
}

export function listRooms(): Room[] {
  const body = httpGet<{ rooms: Room[] }>("/api/eliza/rooms", {
    tags: { endpoint: "rooms" },
  });
  return body?.rooms ?? [];
}

export function createRoom(name?: string): string | null {
  const body = httpPost<{ roomId?: string; id?: string }>(
    "/api/eliza/rooms",
    { name: name || `LoadTest-Room-${Date.now()}` },
    { tags: { endpoint: "rooms" } },
  );
  if (!body) return null;
  roomsCreated.add(1);
  return body.roomId ?? body.id ?? null;
}

export function getRoom(roomId: string): Room | null {
  return httpGet<Room>(`/api/eliza/rooms/${roomId}`, {
    tags: { endpoint: "rooms" },
  });
}

export function getRoomMessages(roomId: string, limit = 20): unknown[] {
  const body = httpGet<{ messages: unknown[] }>(
    `/api/eliza/rooms/${roomId}/messages?limit=${limit}`,
    { tags: { endpoint: "rooms" } },
  );
  return body?.messages ?? [];
}

export function roomOperationsCycle() {
  group("Room Ops", () => {
    const rooms = listRooms();
    sleep(0.3);

    if (config.safeMode) {
      if (rooms.length > 0) {
        getRoom(rooms[0].id);
        getRoomMessages(rooms[0].id, 10);
      }
      return;
    }

    const roomId = createRoom();
    if (roomId) {
      sleep(0.3);
      getRoom(roomId);
      sleep(0.3);
      getRoomMessages(roomId, 10);
    }
  });
  sleep(1);
}

export default function () {
  roomOperationsCycle();
}
