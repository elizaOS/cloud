import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl, getConfig } from "../../config/environments";
import { getAuthHeaders } from "../../helpers/auth";
import { parseBody } from "../../helpers/assertions";
import { recordHttpError } from "../../helpers/metrics";
import { Counter, Trend } from "k6/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();
const config = getConfig();

const voiceOps = new Counter("voice_operations");
const ttsLatency = new Trend("tts_latency");

interface Voice { id: string; name: string }

export function listVoices(): Voice[] {
  const res = http.get(`${baseUrl}/api/elevenlabs/voices`, { headers, tags: { endpoint: "voice" } });
  if (!check(res, { "list 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  voiceOps.add(1);
  return parseBody<{ voices: Voice[] }>(res).voices || [];
}

export function listUserVoices(): unknown[] {
  const res = http.get(`${baseUrl}/api/elevenlabs/voices/user`, { headers, tags: { endpoint: "voice" } });
  if (!check(res, { "user voices 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  voiceOps.add(1);
  return parseBody<{ voices: unknown[] }>(res).voices || [];
}

export function getVoice(voiceId: string): Voice | null {
  const res = http.get(`${baseUrl}/api/elevenlabs/voices/${voiceId}`, { headers, tags: { endpoint: "voice" } });
  if (!check(res, { "get 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  voiceOps.add(1);
  return parseBody<Voice>(res);
}

export function textToSpeech(text: string, voiceId = "EXAVITQu4vr4xnSDxMaL"): boolean {
  const start = Date.now();
  const res = http.post(
    `${baseUrl}/api/elevenlabs/tts`,
    JSON.stringify({ text, voiceId }),
    { headers, tags: { endpoint: "voice" }, timeout: "30s" }
  );
  ttsLatency.add(Date.now() - start);

  if (!check(res, { "tts 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return false;
  }
  voiceOps.add(1);
  return true;
}

export function voiceReadOperations() {
  group("Voice Read", () => {
    const voices = listVoices();
    sleep(0.3);
    listUserVoices();
    sleep(0.3);
    if (voices.length > 0) getVoice(voices[0].id);
  });
  sleep(1);
}

export function voiceWithTts() {
  group("Voice TTS", () => {
    if (config.safeMode) {
      voiceReadOperations();
      return;
    }
    const voices = listVoices();
    if (voices.length === 0) return;
    sleep(0.5);
    textToSpeech("Test", voices[0].id);
  });
  sleep(2);
}

export default function () {
  voiceReadOperations();
}
