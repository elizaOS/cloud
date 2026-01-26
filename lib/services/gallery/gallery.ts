/**
 * Gallery Service
 *
 * Business logic for managing community gallery submissions.
 * Handles submission, approval, likes, and statistics.
 */

import {
  gallerySubmissionsRepository,
  type GallerySubmission,
  type NewGallerySubmission,
  type GalleryFilters,
} from "@/db/repositories/gallery-submissions";
import type {
  GalleryProjectType,
  GallerySubmissionStatus,
} from "@/db/schemas/gallery-submissions";
import { logger } from "@/lib/utils/logger";

export interface SubmitProjectInput {
  projectType: GalleryProjectType;
  projectId: string;
  organizationId: string;
  userId: string;
  title: string;
  description: string;
  previewImageUrl?: string;
  category?: string;
  tags?: string[];
}

export interface GalleryServiceFilters {
  status?: GallerySubmissionStatus | GallerySubmissionStatus[];
  projectType?: GalleryProjectType | GalleryProjectType[];
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "newest" | "popular" | "likes" | "views" | "clones";
}

/**
 * Service for gallery operations.
 */
export class GalleryService {
  /**
   * Submits a project to the gallery.
   * Auto-approves by default (can be changed to require review).
   */
  async submitProject(input: SubmitProjectInput): Promise<GallerySubmission> {
    // Check if project is already submitted
    const existing = await gallerySubmissionsRepository.findByProject(
      input.projectType,
      input.projectId
    );

    if (existing) {
      throw new Error("This project has already been submitted to the gallery");
    }

    const submission: NewGallerySubmission = {
      project_type: input.projectType,
      project_id: input.projectId,
      organization_id: input.organizationId,
      submitted_by_user_id: input.userId,
      title: input.title,
      description: input.description,
      preview_image_url: input.previewImageUrl,
      category: input.category,
      tags: input.tags ?? [],
      // Auto-approve for now (can change to "pending" for moderation)
      status: "approved",
    };

    const created = await gallerySubmissionsRepository.create(submission);

    logger.info(
      `[Gallery] Project submitted: ${created.id} (${input.projectType}/${input.projectId})`
    );

    return created;
  }

  /**
   * Gets a submission by ID.
   */
  async getById(id: string): Promise<GallerySubmission | null> {
    const submission = await gallerySubmissionsRepository.findById(id);
    return submission ?? null;
  }

  /**
   * Gets a submission by project reference.
   */
  async getByProject(
    projectType: GalleryProjectType,
    projectId: string
  ): Promise<GallerySubmission | null> {
    const submission = await gallerySubmissionsRepository.findByProject(
      projectType,
      projectId
    );
    return submission ?? null;
  }

  /**
   * Lists approved submissions (public gallery).
   */
  async listApproved(
    filters: GalleryServiceFilters = {}
  ): Promise<GallerySubmission[]> {
    return await gallerySubmissionsRepository.list({
      ...filters,
      status: ["approved", "featured"],
    });
  }

  /**
   * Lists featured submissions.
   */
  async listFeatured(limit = 10): Promise<GallerySubmission[]> {
    return await gallerySubmissionsRepository.listFeatured(limit);
  }

  /**
   * Lists submissions by organization (for dashboard).
   */
  async listByOrganization(
    organizationId: string,
    filters: GalleryServiceFilters = {}
  ): Promise<GallerySubmission[]> {
    return await gallerySubmissionsRepository.list({
      ...filters,
      organizationId,
    });
  }

  /**
   * Lists submissions by user.
   */
  async listByUser(
    userId: string,
    filters: GalleryServiceFilters = {}
  ): Promise<GallerySubmission[]> {
    return await gallerySubmissionsRepository.list({
      ...filters,
      userId,
    });
  }

  /**
   * Updates a submission.
   */
  async updateSubmission(
    id: string,
    data: {
      title?: string;
      description?: string;
      previewImageUrl?: string;
      category?: string;
      tags?: string[];
    }
  ): Promise<GallerySubmission | null> {
    const updated = await gallerySubmissionsRepository.update(id, {
      title: data.title,
      description: data.description,
      preview_image_url: data.previewImageUrl,
      category: data.category,
      tags: data.tags,
    });
    return updated ?? null;
  }

  /**
   * Updates submission status (for admin moderation).
   */
  async updateStatus(
    id: string,
    status: GallerySubmissionStatus,
    rejectionReason?: string
  ): Promise<GallerySubmission | null> {
    const updated = await gallerySubmissionsRepository.updateStatus(
      id,
      status,
      rejectionReason
    );

    if (updated) {
      logger.info(`[Gallery] Submission ${id} status updated to: ${status}`);
    }

    return updated ?? null;
  }

  /**
   * Increments view count for a submission.
   */
  async incrementViews(id: string): Promise<void> {
    await gallerySubmissionsRepository.incrementViews(id);
  }

  /**
   * Increments clone count for a submission.
   */
  async incrementClones(id: string): Promise<void> {
    await gallerySubmissionsRepository.incrementClones(id);
  }

  /**
   * Toggles like status for a user on a submission.
   * Returns the new like state.
   */
  async toggleLike(
    submissionId: string,
    userId: string
  ): Promise<{ liked: boolean; likeCount: number }> {
    const hasLiked = await gallerySubmissionsRepository.hasLiked(
      submissionId,
      userId
    );

    if (hasLiked) {
      await gallerySubmissionsRepository.removeLike(submissionId, userId);
    } else {
      await gallerySubmissionsRepository.addLike(submissionId, userId);
    }

    const likeCount =
      await gallerySubmissionsRepository.getLikeCount(submissionId);

    return {
      liked: !hasLiked,
      likeCount,
    };
  }

  /**
   * Checks if a user has liked a submission.
   */
  async hasLiked(submissionId: string, userId: string): Promise<boolean> {
    return await gallerySubmissionsRepository.hasLiked(submissionId, userId);
  }

  /**
   * Gets all submission IDs that a user has liked.
   */
  async getUserLikedIds(userId: string): Promise<string[]> {
    return await gallerySubmissionsRepository.getUserLikedIds(userId);
  }

  /**
   * Deletes a submission (owner or admin only).
   */
  async deleteSubmission(id: string): Promise<boolean> {
    const deleted = await gallerySubmissionsRepository.delete(id);

    if (deleted) {
      logger.info(`[Gallery] Submission deleted: ${id}`);
    }

    return deleted;
  }

  /**
   * Checks if a project is already submitted to the gallery.
   */
  async isProjectSubmitted(
    projectType: GalleryProjectType,
    projectId: string
  ): Promise<boolean> {
    const submission = await gallerySubmissionsRepository.findByProject(
      projectType,
      projectId
    );
    return !!submission;
  }
}

export const galleryService = new GalleryService();
