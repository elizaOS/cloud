import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl, getConfig } from "../../config/environments";
import { getAuthHeaders } from "../../helpers/auth";
import { parseBody } from "../../helpers/assertions";
import { generateConversationTitle } from "../../helpers/data-generators";
import { roomsCreated, recordHttpError } from "../../helpers/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();
const config = getConfig();

interface Room { id: string; name: string }

export function listRooms(): Room[] {
  const res = http.get(`${baseUrl}/api/eliza/rooms`, { headers, tags: { endpoint: "rooms" } });
  if (!check(res, { "list 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  return parseBody<{ rooms: Room[] }>(res).rooms || [];
}

export function createRoom(name?: string): string | null {
  const res = http.post(
    `${baseUrl}/api/eliza/rooms`,
    JSON.stringify({ name: name || `LoadTest-Room-${Date.now()}` }),
    { headers, tags: { endpoint: "rooms" } }
  );
  if (!check(res, { "create 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  roomsCreated.add(1);
  const body = parseBody<{ roomId?: string; id?: string }>(res);
  return body.roomId || body.id || null;
}

export function getRoom(roomId: string): Room | null {
  const res = http.get(`${baseUrl}/api/eliza/rooms/${roomId}`, { headers, tags: { endpoint: "rooms" } });
  if (!check(res, { "get 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  return parseBody<Room>(res);
}

export function getRoomMessages(roomId: string, limit = 20): unknown[] {
  const res = http.get(`${baseUrl}/api/eliza/rooms/${roomId}/messages?limit=${limit}`, { headers, tags: { endpoint: "rooms" } });
  if (!check(res, { "messages 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  return parseBody<{ messages: unknown[] }>(res).messages || [];
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
