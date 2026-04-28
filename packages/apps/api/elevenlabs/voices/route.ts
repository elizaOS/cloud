/**
 * GET /api/elevenlabs/voices
 * Lists ElevenLabs public/premade voices.
 */

import { Hono } from "hono";
import { requireUser } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";
import { getElevenLabsService } from "@/lib/services/elevenlabs";
import { logger } from "@/lib/utils/logger";

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
