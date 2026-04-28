/**
 * DELETE /api/v1/gallery/:id
 *
 * Soft-deletes a media item from the gallery. Verifies ownership, removes
 * the blob if hosted on Vercel Blob storage, then marks the generation
 * record as `deleted`.
 *
 * Mirrors `_legacy_actions/gallery.ts → deleteMedia`.
 */

import { Hono } from "hono";
import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse, NotFoundError } from "@/api-lib/errors";
import { generationsService } from "@/lib/services/generations";
import { logger } from "@/lib/utils/logger";

const app = new Hono<AppEnv>();

app.delete("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const id = c.req.param("id") ?? "";

    const generation = await generationsService.getById(id);
    if (!generation || generation.user_id !== user.id) {
      throw NotFoundError("Media not found or access denied");
    }

    if (generation.storage_url && generation.storage_url.includes("blob.vercel-storage.com")) {
      // TODO(node-only): @vercel/blob `del()` is Node-only. Blob cleanup
      // must happen via a Node sidecar or Workers-friendly R2 client. For
      // now we mark the generation deleted so the gallery hides it; the
      // blob will be cleaned up out-of-band.
      logger.warn(
        "[GALLERY API] Skipping Vercel Blob delete (Node-only @vercel/blob); marking generation deleted only",
        { id, storageUrl: generation.storage_url },
      );
    }

    await generationsService.updateStatus(id, "deleted");

    return c.json({ success: true });
  } catch (error) {
    return failureResponse(c, error);
  }
});

export default app;
