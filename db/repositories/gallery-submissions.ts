/**
 * Gallery Submissions Repository
 *
 * Database access layer for gallery submissions and likes.
 */

import { eq, desc, and, or, sql, inArray } from "drizzle-orm";
import { dbRead, dbWrite } from "../helpers";
import {
  gallerySubmissions,
  galleryLikes,
  type GallerySubmission,
  type NewGallerySubmission,
  type GalleryLike,
  type NewGalleryLike,
  type GalleryProjectType,
  type GallerySubmissionStatus,
} from "../schemas/gallery-submissions";

export type { GallerySubmission, NewGallerySubmission, GalleryLike, NewGalleryLike };

export interface GalleryFilters {
  status?: GallerySubmissionStatus | GallerySubmissionStatus[];
  projectType?: GalleryProjectType | GalleryProjectType[];
  category?: string;
  organizationId?: string;
  userId?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "newest" | "popular" | "likes" | "views" | "clones";
}

/**
 * Repository for gallery submission database operations.
 */
export class GallerySubmissionsRepository {
  /**
   * Creates a new gallery submission.
   */
  async create(data: NewGallerySubmission): Promise<GallerySubmission> {
    const [submission] = await dbWrite
      .insert(gallerySubmissions)
      .values(data)
      .returning();
    return submission;
  }

  /**
   * Finds a submission by ID.
   */
  async findById(id: string): Promise<GallerySubmission | undefined> {
    return await dbRead.query.gallerySubmissions.findFirst({
      where: eq(gallerySubmissions.id, id),
    });
  }

  /**
   * Finds a submission by project reference.
   */
  async findByProject(
    projectType: GalleryProjectType,
    projectId: string
  ): Promise<GallerySubmission | undefined> {
    return await dbRead.query.gallerySubmissions.findFirst({
      where: and(
        eq(gallerySubmissions.project_type, projectType),
        eq(gallerySubmissions.project_id, projectId)
      ),
    });
  }

  /**
   * Lists submissions with filters.
   */
  async list(filters: GalleryFilters = {}): Promise<GallerySubmission[]> {
    const conditions = [];

    // Status filter
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(gallerySubmissions.status, filters.status));
      } else {
        conditions.push(eq(gallerySubmissions.status, filters.status));
      }
    }

    // Project type filter
    if (filters.projectType) {
      if (Array.isArray(filters.projectType)) {
        conditions.push(
          inArray(gallerySubmissions.project_type, filters.projectType)
        );
      } else {
        conditions.push(eq(gallerySubmissions.project_type, filters.projectType));
      }
    }

    // Category filter
    if (filters.category) {
      conditions.push(eq(gallerySubmissions.category, filters.category));
    }

    // Organization filter
    if (filters.organizationId) {
      conditions.push(
        eq(gallerySubmissions.organization_id, filters.organizationId)
      );
    }

    // User filter
    if (filters.userId) {
      conditions.push(
        eq(gallerySubmissions.submitted_by_user_id, filters.userId)
      );
    }

    // Search filter
    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      const searchCondition = or(
        sql`${gallerySubmissions.title} ILIKE ${searchPattern}`,
        sql`${gallerySubmissions.description} ILIKE ${searchPattern}`
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    // Build sort order based on filter
    const orderBy = (() => {
      switch (filters.sortBy) {
        case "popular":
          return [
            desc(gallerySubmissions.like_count),
            desc(gallerySubmissions.view_count),
          ];
        case "likes":
          return [desc(gallerySubmissions.like_count)];
        case "views":
          return [desc(gallerySubmissions.view_count)];
        case "clones":
          return [desc(gallerySubmissions.clone_count)];
        default:
          return [desc(gallerySubmissions.created_at)];
      }
    })();

    const query = dbRead
      .select()
      .from(gallerySubmissions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(...orderBy);

    if (filters.limit) {
      query.limit(filters.limit);
    }
    if (filters.offset) {
      query.offset(filters.offset);
    }

    return await query;
  }

  /**
   * Lists featured submissions.
   */
  async listFeatured(limit = 10): Promise<GallerySubmission[]> {
    return await dbRead
      .select()
      .from(gallerySubmissions)
      .where(eq(gallerySubmissions.status, "featured"))
      .orderBy(desc(gallerySubmissions.featured_at))
      .limit(limit);
  }

  /**
   * Updates a submission.
   */
  async update(
    id: string,
    data: Partial<NewGallerySubmission>
  ): Promise<GallerySubmission | undefined> {
    const [updated] = await dbWrite
      .update(gallerySubmissions)
      .set({ ...data, updated_at: new Date() })
      .where(eq(gallerySubmissions.id, id))
      .returning();
    return updated;
  }

  /**
   * Updates submission status.
   */
  async updateStatus(
    id: string,
    status: GallerySubmissionStatus,
    rejectionReason?: string
  ): Promise<GallerySubmission | undefined> {
    const updateData: Partial<GallerySubmission> = {
      status,
      updated_at: new Date(),
    };

    if (status === "featured") {
      updateData.featured_at = new Date();
    }
    if (status === "rejected" && rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    }

    const [updated] = await dbWrite
      .update(gallerySubmissions)
      .set(updateData)
      .where(eq(gallerySubmissions.id, id))
      .returning();
    return updated;
  }

  /**
   * Increments view count.
   */
  async incrementViews(id: string): Promise<void> {
    await dbWrite
      .update(gallerySubmissions)
      .set({
        view_count: sql`${gallerySubmissions.view_count} + 1`,
      })
      .where(eq(gallerySubmissions.id, id));
  }

  /**
   * Increments clone count.
   */
  async incrementClones(id: string): Promise<void> {
    await dbWrite
      .update(gallerySubmissions)
      .set({
        clone_count: sql`${gallerySubmissions.clone_count} + 1`,
      })
      .where(eq(gallerySubmissions.id, id));
  }

  /**
   * Updates like count (used after toggling likes).
   */
  async updateLikeCount(id: string, count: number): Promise<void> {
    await dbWrite
      .update(gallerySubmissions)
      .set({ like_count: count })
      .where(eq(gallerySubmissions.id, id));
  }

  /**
   * Deletes a submission.
   */
  async delete(id: string): Promise<boolean> {
    const result = await dbWrite
      .delete(gallerySubmissions)
      .where(eq(gallerySubmissions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // =========================================================================
  // Likes
  // =========================================================================

  /**
   * Adds a like to a submission.
   */
  async addLike(submissionId: string, userId: string): Promise<GalleryLike> {
    const [like] = await dbWrite
      .insert(galleryLikes)
      .values({ submission_id: submissionId, user_id: userId })
      .returning();

    // Update like count
    const count = await this.getLikeCount(submissionId);
    await this.updateLikeCount(submissionId, count);

    return like;
  }

  /**
   * Removes a like from a submission.
   */
  async removeLike(submissionId: string, userId: string): Promise<boolean> {
    const result = await dbWrite
      .delete(galleryLikes)
      .where(
        and(
          eq(galleryLikes.submission_id, submissionId),
          eq(galleryLikes.user_id, userId)
        )
      );

    // Update like count
    const count = await this.getLikeCount(submissionId);
    await this.updateLikeCount(submissionId, count);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Checks if a user has liked a submission.
   */
  async hasLiked(submissionId: string, userId: string): Promise<boolean> {
    const like = await dbRead.query.galleryLikes.findFirst({
      where: and(
        eq(galleryLikes.submission_id, submissionId),
        eq(galleryLikes.user_id, userId)
      ),
    });
    return !!like;
  }

  /**
   * Gets the like count for a submission.
   */
  async getLikeCount(submissionId: string): Promise<number> {
    const [result] = await dbRead
      .select({ count: sql<number>`count(*)` })
      .from(galleryLikes)
      .where(eq(galleryLikes.submission_id, submissionId));
    return Number(result?.count ?? 0);
  }

  /**
   * Gets all submission IDs that a user has liked.
   */
  async getUserLikedIds(userId: string): Promise<string[]> {
    const likes = await dbRead
      .select({ submission_id: galleryLikes.submission_id })
      .from(galleryLikes)
      .where(eq(galleryLikes.user_id, userId));
    return likes.map((l) => l.submission_id);
  }
}

export const gallerySubmissionsRepository = new GallerySubmissionsRepository();
