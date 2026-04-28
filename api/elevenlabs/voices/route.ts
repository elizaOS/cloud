/**
 * GET /api/elevenlabs/voices
 * Lists ElevenLabs public/premade voices.
 */

import { Hono } from "hono";

import { getElevenLabsService } from "@/lib/services/elevenlabs";
import { logger } from "@/lib/utils/logger";
import { requireUser } from "../../../src/lib/auth";
import type { AppEnv } from "../../../src/lib/context";
import { failureResponse } from "../../../src/lib/errors";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  try {
    const user = await requireUser(c);
    logger.info(`[Voices API] Fetching public voices for user ${user.id}`);

    const elevenlabs = getElevenLabsService();
    const allVoices = await elevenlabs.getVoices();
    const publicVoices = allVoices.filter(
      (voice) => voice.category === "premade" || voice.category === "professional",
    );

    return c.json({ voices: publicVoices });
  } catch (error) {
    logger.error("[Voices API] Error:", error);
    if (error instanceof Error && error.message.includes("ELEVENLABS_API_KEY")) {
      return c.json({ error: "Service not configured" }, 500);
    }
    return failureResponse(c, error);
  }
});

export default app;
