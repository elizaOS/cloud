import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { createFile, formDataRequest, jsonRequest, routeParams } from "./route-test-helpers";

class MockInsufficientCreditsError extends Error {
  required: number;

  constructor(required: number) {
    super("Insufficient balance");
    this.required = required;
  }
}

const mockRequireAuth = mock();
const mockRequireAuthWithOrg = mock();
const mockRequireAuthOrApiKeyWithOrg = mock();
const mockGetVoices = mock();
const mockTextToSpeech = mock();
const mockSpeechToText = mock();
const mockCreateVoiceClone = mock();
const mockGetUserVoices = mock();
const mockGetVoiceById = mock();
const mockDeleteVoice = mock();
const mockUpdateVoice = mock();
const mockIncrementUsageCount = mock();
const mockUsageCreate = mock();
const mockCreditsReserve = mock();
const mockFileTypeFromBuffer = mock();

let voiceLookupRows: Array<{ id: string; name: string; organizationId: string }> = [];

const reservationFactory = () => ({
  reconcile: mock().mockResolvedValue(undefined),
  reservedAmount: 1,
});

mock.module("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
  requireAuthWithOrg: mockRequireAuthWithOrg,
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/services/elevenlabs", () => ({
  getElevenLabsService: () => ({
    getVoices: mockGetVoices,
    textToSpeech: mockTextToSpeech,
    speechToText: mockSpeechToText,
  }),
}));

mock.module("@/lib/services/voice-cloning", () => ({
  voiceCloningService: {
    createVoiceClone: mockCreateVoiceClone,
    getUserVoices: mockGetUserVoices,
    getVoiceById: mockGetVoiceById,
    deleteVoice: mockDeleteVoice,
    updateVoice: mockUpdateVoice,
    incrementUsageCount: mockIncrementUsageCount,
  },
}));

mock.module("@/lib/services/usage", () => ({
  usageService: {
    create: mockUsageCreate,
  },
}));

mock.module("@/lib/services/credits", () => ({
  creditsService: {
    reserve: mockCreditsReserve,
  },
  InsufficientCreditsError: MockInsufficientCreditsError,
}));

mock.module("@/lib/pricing", () => ({
  calculateTTSCost: () => 2,
  calculateSTTCost: () => 1.5,
}));

mock.module("@/lib/pricing-constants", () => ({
  CUSTOM_VOICE_TTS_MARKUP: 1.2,
  VOICE_CLONE_INSTANT_COST: 3,
  VOICE_CLONE_PROFESSIONAL_COST: 30,
}));

mock.module("@/db/client", () => ({
  dbRead: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => voiceLookupRows,
        }),
      }),
    }),
  },
}));

mock.module("@/db/schemas/user-voices", () => ({
  userVoices: {
    id: "id",
    name: "name",
    organizationId: "organizationId",
    elevenlabsVoiceId: "elevenlabsVoiceId",
  },
}));

mock.module("drizzle-orm", () => ({
  eq: () => "eq",
}));

mock.module("file-type", () => ({
  fileTypeFromBuffer: mockFileTypeFromBuffer,
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

import { POST as stt } from "@/app/api/elevenlabs/stt/route";
import { POST as tts } from "@/app/api/elevenlabs/tts/route";
import {
  DELETE as deleteVoice,
  GET as getVoice,
  PATCH as patchVoice,
} from "@/app/api/elevenlabs/voices/[id]/route";
import { POST as cloneVoice } from "@/app/api/elevenlabs/voices/clone/route";
import { GET as listPublicVoices } from "@/app/api/elevenlabs/voices/route";
import { GET as listUserVoices } from "@/app/api/elevenlabs/voices/user/route";

const authenticatedUser = {
  id: "user-1",
  organization_id: "org-1",
};

beforeEach(() => {
  voiceLookupRows = [];

  mockRequireAuth.mockReset();
  mockRequireAuthWithOrg.mockReset();
  mockRequireAuthOrApiKeyWithOrg.mockReset();
  mockGetVoices.mockReset();
  mockTextToSpeech.mockReset();
  mockSpeechToText.mockReset();
  mockCreateVoiceClone.mockReset();
  mockGetUserVoices.mockReset();
  mockGetVoiceById.mockReset();
  mockDeleteVoice.mockReset();
  mockUpdateVoice.mockReset();
  mockIncrementUsageCount.mockReset();
  mockUsageCreate.mockReset();
  mockCreditsReserve.mockReset();
  mockFileTypeFromBuffer.mockReset();

  mockRequireAuth.mockResolvedValue(authenticatedUser);
  mockRequireAuthWithOrg.mockResolvedValue(authenticatedUser);
  mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
    user: authenticatedUser,
    apiKey: null,
  });
  mockGetVoices.mockResolvedValue([
    { voice_id: "v1", name: "Premade", category: "premade" },
    { voice_id: "v2", name: "Professional", category: "professional" },
    { voice_id: "v3", name: "Cloned", category: "cloned" },
  ]);
  mockTextToSpeech.mockResolvedValue(new ReadableStream());
  mockSpeechToText.mockResolvedValue("transcript");
  mockCreateVoiceClone.mockResolvedValue({
    userVoice: {
      id: "voice-1",
      elevenlabsVoiceId: "eleven-1",
      name: "Narrator",
      description: "Warm",
      cloneType: "instant",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    job: {
      id: "job-1",
      status: "completed",
      progress: 100,
    },
  });
  mockGetUserVoices.mockResolvedValue([
    {
      id: "voice-1",
      elevenlabsVoiceId: "eleven-1",
      name: "Voice One",
      description: "Warm",
      cloneType: "instant",
      sampleCount: 2,
      totalAudioDurationSeconds: 20,
      audioQualityScore: 0.9,
      usageCount: 4,
      lastUsedAt: null,
      isActive: true,
      isPublic: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    },
    {
      id: "voice-2",
      elevenlabsVoiceId: "eleven-2",
      name: "Voice Two",
      description: null,
      cloneType: "professional",
      sampleCount: 4,
      totalAudioDurationSeconds: 40,
      audioQualityScore: 0.95,
      usageCount: 8,
      lastUsedAt: null,
      isActive: true,
      isPublic: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    },
  ]);
  mockGetVoiceById.mockResolvedValue({
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Voice One",
  });
  mockUpdateVoice.mockResolvedValue({ id: "voice-1", name: "Updated Voice" });
  mockDeleteVoice.mockResolvedValue(undefined);
  mockIncrementUsageCount.mockResolvedValue(undefined);
  mockUsageCreate.mockResolvedValue({ id: "usage-1" });
  mockCreditsReserve.mockResolvedValue(reservationFactory());
  mockFileTypeFromBuffer.mockResolvedValue({ mime: "audio/mpeg" });
});

afterEach(() => {
  mock.restore();
});

describe("Voice listing APIs", () => {
  test("public voice listing filters out cloned voices", async () => {
    const response = await listPublicVoices();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.voices).toHaveLength(2);
    expect(body.voices.map((voice: { name: string }) => voice.name)).toEqual([
      "Premade",
      "Professional",
    ]);
  });

  test("user voice listing validates query parameters", async () => {
    const response = await listUserVoices(
      jsonRequest("http://localhost:3000/api/elevenlabs/voices/user?cloneType=weird", "GET"),
    );

    expect(response.status).toBe(400);
  });

  test("user voice listing paginates and reports hasMore", async () => {
    const response = await listUserVoices(
      jsonRequest("http://localhost:3000/api/elevenlabs/voices/user?limit=1&offset=0", "GET"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.voices).toHaveLength(1);
    expect(body.hasMore).toBe(true);
  });
});

describe("Single voice APIs", () => {
  test("GET rejects non-UUID voice IDs", async () => {
    const response = await getVoice(
      jsonRequest("http://localhost:3000/api/elevenlabs/voices/not-a-uuid", "GET"),
      routeParams({ id: "not-a-uuid" }),
    );

    expect(response.status).toBe(400);
  });

  test("PATCH now rejects non-UUID voice IDs as well", async () => {
    const response = await patchVoice(
      jsonRequest("http://localhost:3000/api/elevenlabs/voices/not-a-uuid", "PATCH", {
        name: "Updated",
      }),
      routeParams({ id: "not-a-uuid" }),
    );

    expect(response.status).toBe(400);
  });

  test("DELETE maps missing voices to 404", async () => {
    mockDeleteVoice.mockRejectedValue(new Error("voice not found"));

    const response = await deleteVoice(
      jsonRequest(
        "http://localhost:3000/api/elevenlabs/voices/550e8400-e29b-41d4-a716-446655440000",
        "DELETE",
      ),
      routeParams({ id: "550e8400-e29b-41d4-a716-446655440000" }),
    );

    expect(response.status).toBe(404);
  });
});

describe("Voice cloning API", () => {
  test("clone endpoint requires at least one file", async () => {
    const formData = new FormData();
    formData.set("name", "Narrator");
    formData.set("cloneType", "instant");

    const response = await cloneVoice(
      formDataRequest("http://localhost:3000/api/elevenlabs/voices/clone", formData),
    );

    expect(response.status).toBe(400);
  });

  test("clone endpoint validates settings JSON", async () => {
    const formData = new FormData();
    formData.set("name", "Narrator");
    formData.set("cloneType", "instant");
    formData.set("settings", "{oops");
    formData.set("file0", createFile("sample.mp3", "audio/mpeg"));

    const response = await cloneVoice(
      formDataRequest("http://localhost:3000/api/elevenlabs/voices/clone", formData),
    );

    expect(response.status).toBe(400);
  });

  test("clone endpoint returns 402 on insufficient credits", async () => {
    mockCreditsReserve.mockRejectedValue(new MockInsufficientCreditsError(3));

    const formData = new FormData();
    formData.set("name", "Narrator");
    formData.set("cloneType", "instant");
    formData.set("file0", createFile("sample.mp3", "audio/mpeg"));

    const response = await cloneVoice(
      formDataRequest("http://localhost:3000/api/elevenlabs/voices/clone", formData),
    );

    expect(response.status).toBe(402);
  });

  test("clone endpoint creates voices successfully", async () => {
    const response = await cloneVoice(
      formDataRequest(
        "http://localhost:3000/api/elevenlabs/voices/clone",
        (() => {
          const formData = new FormData();
          formData.set("name", "Narrator");
          formData.set("cloneType", "instant");
          formData.set("file0", createFile("sample.mp3", "audio/mpeg"));
          return formData;
        })(),
      ),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.voice.name).toBe("Narrator");
  });
});

describe("TTS and STT APIs", () => {
  test("tts requires text", async () => {
    const response = await tts(
      jsonRequest("http://localhost:3000/api/elevenlabs/tts", "POST", {
        voiceId: "voice-1",
      }),
    );

    expect(response.status).toBe(400);
  });

  test("tts applies custom voice markup for organization-owned voices", async () => {
    const reservation = reservationFactory();
    mockCreditsReserve.mockResolvedValue(reservation);
    voiceLookupRows = [
      {
        id: "user-voice-1",
        name: "Custom Voice",
        organizationId: "org-1",
      },
    ];

    const response = await tts(
      jsonRequest("http://localhost:3000/api/elevenlabs/tts", "POST", {
        text: "Hello world",
        voiceId: "eleven-custom",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(mockCreditsReserve).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2.4,
      }),
    );
  });

  test("stt requires an uploaded audio file", async () => {
    const response = await stt(
      formDataRequest("http://localhost:3000/api/elevenlabs/stt", new FormData()),
    );

    expect(response.status).toBe(400);
  });

  test("stt rejects file signature mismatches", async () => {
    mockFileTypeFromBuffer.mockResolvedValue({ mime: "application/pdf" });

    const formData = new FormData();
    formData.set("audio", createFile("sample.mp3", "audio/mpeg"));

    const response = await stt(
      formDataRequest("http://localhost:3000/api/elevenlabs/stt", formData),
    );

    expect(response.status).toBe(400);
  });

  test("stt accepts Safari video/webm containers and normalizes them to audio/webm", async () => {
    mockFileTypeFromBuffer.mockResolvedValue({ mime: "video/webm" });

    const formData = new FormData();
    formData.set("audio", createFile("sample.webm", "audio/webm"));

    const response = await stt(
      formDataRequest("http://localhost:3000/api/elevenlabs/stt", formData),
    );

    expect(response.status).toBe(200);
    expect(mockSpeechToText).toHaveBeenCalled();
    const call = mockSpeechToText.mock.calls[0]?.[0];
    expect(call.audioFile.type).toBe("audio/webm");
  });
});
