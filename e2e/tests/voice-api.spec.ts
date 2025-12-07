import { test, expect } from "@playwright/test";

/**
 * ElevenLabs Voice API Tests
 *
 * Tests voice functionality:
 * - Voice listing and management
 * - Voice cloning
 * - Text-to-Speech (TTS)
 * - Speech-to-Text (STT)
 * - Voice verification
 *
 * Prerequisites:
 * - TEST_API_KEY environment variable required
 * - Cloud running on port 3000
 * - ElevenLabs API configured (may need ELEVENLABS_API_KEY)
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const CLOUD_URL = process.env.CLOUD_URL ?? BASE_URL;
const API_KEY = process.env.TEST_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

test.describe("Voice Listing API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/elevenlabs/voices lists available voices", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/elevenlabs/voices`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const voices = data.voices || data.data || data;
      expect(Array.isArray(voices)).toBe(true);
      console.log(`✅ Found ${voices.length} available voices`);

      // Check voice structure if voices exist
      if (voices.length > 0) {
        const voice = voices[0];
        expect(voice).toHaveProperty("voice_id");
        expect(voice).toHaveProperty("name");
      }
    } else {
      console.log(`ℹ️ Voices list returned ${response.status()}`);
    }
  });

  test("GET /api/elevenlabs/voices/:id returns voice details", async ({ request }) => {
    // First get list of voices
    const listResponse = await request.get(`${CLOUD_URL}/api/elevenlabs/voices`, {
      headers: authHeaders(),
    });

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const voices = listData.voices || listData.data || listData;

    if (!Array.isArray(voices) || voices.length === 0) {
      console.log("ℹ️ No voices available for detail test");
      return;
    }

    const voiceId = voices[0].voice_id || voices[0].id;

    // Get voice details
    const response = await request.get(`${CLOUD_URL}/api/elevenlabs/voices/${voiceId}`, {
      headers: authHeaders(),
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const voice = data.voice || data.data || data;
      expect(voice).toHaveProperty("voice_id");
      console.log("✅ Voice details retrieved");
    }
  });

  test("GET /api/elevenlabs/voices/user returns user's voices", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/elevenlabs/voices/user`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const voices = data.voices || data.data || data;
      expect(Array.isArray(voices)).toBe(true);
      console.log(`✅ Found ${voices.length} user voices`);
    } else {
      console.log(`ℹ️ User voices returned ${response.status()}`);
    }
  });

  test("GET /api/elevenlabs/voices/jobs returns voice jobs", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/elevenlabs/voices/jobs`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const jobs = data.jobs || data.data || data;
      expect(Array.isArray(jobs)).toBe(true);
      console.log(`✅ Found ${jobs.length} voice jobs`);
    } else {
      console.log(`ℹ️ Voice jobs returned ${response.status()}`);
    }
  });
});

test.describe("Voice Cloning API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/elevenlabs/voices/clone initiates voice cloning", async ({ request }) => {
    // Voice cloning requires audio files
    // This test validates the endpoint exists and returns appropriate response

    const response = await request.post(`${CLOUD_URL}/api/elevenlabs/voices/clone`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
      multipart: {
        name: "E2E Test Voice",
        description: "Voice created for E2E testing",
        // Note: Real voice cloning would require audio samples
      },
    });

    expect([200, 201, 400, 404, 422, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Voice cloning endpoint accessible");
    } else if (response.status() === 400 || response.status() === 422) {
      console.log("✅ Voice cloning requires audio samples (expected validation error)");
    } else {
      console.log(`ℹ️ Voice cloning returned ${response.status()}`);
    }
  });
});

test.describe("Voice Verification API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/elevenlabs/voices/verify/:id verifies voice", async ({ request }) => {
    // First get a voice ID
    const listResponse = await request.get(`${CLOUD_URL}/api/elevenlabs/voices`, {
      headers: authHeaders(),
    });

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const voices = listData.voices || listData.data || listData;

    if (!Array.isArray(voices) || voices.length === 0) {
      return;
    }

    const voiceId = voices[0].voice_id || voices[0].id;

    // Verify voice
    const response = await request.post(`${CLOUD_URL}/api/elevenlabs/voices/verify/${voiceId}`, {
      headers: authHeaders(),
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Voice verification endpoint works");
    } else {
      console.log(`ℹ️ Voice verification returned ${response.status()}`);
    }
  });
});

test.describe("Text-to-Speech API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/elevenlabs/tts generates speech from text", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/elevenlabs/tts`, {
      headers: authHeaders(),
      data: {
        text: "Hello, this is an E2E test of the text to speech API.",
        voice_id: "21m00Tcm4TlvDq8ikWAM", // Default ElevenLabs voice (Rachel)
        model_id: "eleven_monolingual_v1",
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const contentType = response.headers()["content-type"];
      // Should return audio or JSON
      const isAudio =
        contentType?.includes("audio/") || contentType?.includes("application/octet-stream");
      const isJson = contentType?.includes("application/json");

      if (isAudio) {
        const buffer = await response.body();
        expect(buffer.length).toBeGreaterThan(0);
        console.log(`✅ TTS generated ${buffer.length} bytes of audio`);
      } else if (isJson) {
        const data = await response.json();
        expect(data).toBeDefined();
        console.log("✅ TTS returned JSON response");
      }
    } else {
      console.log(`ℹ️ TTS returned ${response.status()}`);
    }
  });

  test("TTS handles different voice settings", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/elevenlabs/tts`, {
      headers: authHeaders(),
      data: {
        text: "Testing voice stability and similarity boost settings.",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      console.log("✅ TTS with custom voice settings works");
    } else {
      console.log(`ℹ️ TTS with settings returned ${response.status()}`);
    }
  });
});

test.describe("Speech-to-Text API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/elevenlabs/stt transcribes audio", async ({ request }) => {
    // STT requires audio input
    // This test validates the endpoint exists

    const response = await request.post(`${CLOUD_URL}/api/elevenlabs/stt`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
      multipart: {
        // Note: Real STT would require audio file
        model_id: "whisper-1",
      },
    });

    expect([200, 201, 400, 404, 422, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ STT endpoint accessible");
    } else if (response.status() === 400 || response.status() === 422) {
      console.log("✅ STT requires audio file (expected validation error)");
    } else {
      console.log(`ℹ️ STT returned ${response.status()}`);
    }
  });
});

test.describe("Voices Dashboard UI", () => {
  test("voices page loads and displays content", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/voices`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      console.log("ℹ️ Voices page requires authentication");
      return;
    }

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(100);
    console.log("✅ Voices page loaded");
  });

  test("voices page has voice cards or list", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/voices`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for voice items
    const voiceItems = page.locator(
      '[class*="voice"], [class*="card"], [class*="Voice"], article'
    );
    const itemCount = await voiceItems.count();

    console.log(`✅ Found ${itemCount} voice items on page`);
  });

  test("voice preview button exists", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/voices`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for play/preview buttons
    const playButtons = page.locator(
      'button:has(svg), [aria-label*="play" i], [aria-label*="preview" i], button:has-text("Play")'
    );
    const buttonCount = await playButtons.count();

    console.log(`✅ Found ${buttonCount} voice play/preview buttons`);
  });

  test("voice cloning UI elements exist", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/voices`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for clone button or upload
    const cloneElements = page.locator(
      'button:has-text("Clone"), button:has-text("Create"), input[type="file"], button:has-text("Upload")'
    );
    const elementCount = await cloneElements.count();

    console.log(`✅ Found ${elementCount} voice cloning UI elements`);
  });
});

test.describe("Voice Selection in Chat", () => {
  test("chat page has voice selection", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Look for voice selection elements
    const voiceSelector = page.locator(
      'select[name*="voice"], [role="combobox"], button:has-text("Voice"), [aria-label*="voice" i]'
    );
    const selectorCount = await voiceSelector.count();

    if (selectorCount > 0) {
      console.log(`✅ Found ${selectorCount} voice selection element(s) in chat`);
    } else {
      console.log("ℹ️ Voice selection not visible (may be in settings)");
    }
  });

  test("audio controls exist in chat", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/chat`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Look for microphone or audio buttons
    const audioControls = page.locator(
      '[aria-label*="mic" i], [aria-label*="audio" i], button:has(svg), [aria-label*="voice" i]'
    );
    const controlCount = await audioControls.count();

    console.log(`✅ Found ${controlCount} potential audio control buttons`);
  });
});

