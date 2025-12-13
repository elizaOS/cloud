import { group, sleep } from "k6";
import { getConfig } from "../../config/environments";
import { httpGet, httpPost } from "../../helpers/http";
import { Counter, Trend } from "k6/metrics";

const config = getConfig();
const voiceOps = new Counter("voice_operations");
const ttsLatency = new Trend("tts_latency");

interface Voice { id: string; name: string }

export function listVoices(): Voice[] {
  const body = httpGet<{ voices: Voice[] }>("/api/elevenlabs/voices", { tags: { endpoint: "voice" } });
  if (!body) return [];
  voiceOps.add(1);
  return body.voices ?? [];
}

export function listUserVoices(): unknown[] {
  const body = httpGet<{ voices: unknown[] }>("/api/elevenlabs/voices/user", { tags: { endpoint: "voice" } });
  if (!body) return [];
  voiceOps.add(1);
  return body.voices ?? [];
}

export function getVoice(voiceId: string): Voice | null {
  const body = httpGet<Voice>(`/api/elevenlabs/voices/${voiceId}`, { tags: { endpoint: "voice" } });
  if (!body) return null;
  voiceOps.add(1);
  return body;
}

export function textToSpeech(text: string, voiceId = "EXAVITQu4vr4xnSDxMaL"): boolean {
  const start = Date.now();
  const body = httpPost("/api/elevenlabs/tts", { text, voiceId }, { tags: { endpoint: "voice" }, timeout: "30s" });
  ttsLatency.add(Date.now() - start);
  if (!body) return false;
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
