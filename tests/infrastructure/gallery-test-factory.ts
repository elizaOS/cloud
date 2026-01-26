/**
 * Gallery Test Data Factory
 *
 * Creates test data specifically for Community Gallery testing.
 * Builds on the base test data factory with gallery-specific entities.
 */

import { v4 as uuidv4 } from "uuid";
import { Client } from "pg";

export interface TestGallerySubmission {
  id: string;
  projectType: "agent" | "app" | "mcp";
  projectId: string;
  organizationId: string;
  submittedByUserId: string;
  title: string;
  description: string;
  previewImageUrl?: string;
  category?: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  cloneCount: number;
  status: "pending" | "approved" | "rejected" | "featured";
  rejectionReason?: string;
  featuredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestGalleryLike {
  id: string;
  submissionId: string;
  userId: string;
  createdAt: Date;
}

export interface GalleryTestDataSet {
  submissions: TestGallerySubmission[];
  likes: TestGalleryLike[];
  cleanup: () => Promise<void>;
}

/**
 * Create a single gallery submission
 */
export async function createGallerySubmission(
  connectionString: string,
  options: {
    projectType?: "agent" | "app" | "mcp";
    projectId: string;
    organizationId: string;
    submittedByUserId: string;
    title?: string;
    description?: string;
    previewImageUrl?: string;
    category?: string;
    tags?: string[];
    status?: "pending" | "approved" | "rejected" | "featured";
    viewCount?: number;
    likeCount?: number;
    cloneCount?: number;
  }
): Promise<TestGallerySubmission> {
  const {
    projectType = "agent",
    projectId,
    organizationId,
    submittedByUserId,
    title = `Test Submission ${uuidv4().slice(0, 8)}`,
    description = "A test submission created by the gallery test factory",
    previewImageUrl,
    category,
    tags = [],
    status = "pending",
    viewCount = 0,
    likeCount = 0,
    cloneCount = 0,
  } = options;

  const client = new Client({ connectionString });
  await client.connect();

  const id = uuidv4();
  const now = new Date();

  await client.query(
    `INSERT INTO gallery_submissions (
      id, project_type, project_id, organization_id, submitted_by_user_id,
      title, description, preview_image_url, category, tags,
      view_count, like_count, clone_count, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      projectType,
      projectId,
      organizationId,
      submittedByUserId,
      title,
      description,
      previewImageUrl || null,
      category || null,
      JSON.stringify(tags),
      viewCount,
      likeCount,
      cloneCount,
      status,
      now,
      now,
    ]
  );

  await client.end();

  console.log(`[GalleryTestFactory] Created submission: ${title} (${id})`);

  return {
    id,
    projectType,
    projectId,
    organizationId,
    submittedByUserId,
    title,
    description,
    previewImageUrl,
    category,
    tags,
    viewCount,
    likeCount,
    cloneCount,
    status,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a gallery like
 */
export async function createGalleryLike(
  connectionString: string,
  options: {
    submissionId: string;
    userId: string;
  }
): Promise<TestGalleryLike> {
  const { submissionId, userId } = options;

  const client = new Client({ connectionString });
  await client.connect();

  const id = uuidv4();
  const now = new Date();

  await client.query(
    `INSERT INTO gallery_likes (id, submission_id, user_id, created_at)
     VALUES ($1, $2, $3, $4)`,
    [id, submissionId, userId, now]
  );

  // Update like count on submission
  await client.query(
    `UPDATE gallery_submissions SET like_count = like_count + 1 WHERE id = $1`,
    [submissionId]
  );

  await client.end();

  console.log(`[GalleryTestFactory] Created like: user ${userId.slice(0, 8)}... -> submission ${submissionId.slice(0, 8)}...`);

  return {
    id,
    submissionId,
    userId,
    createdAt: now,
  };
}

/**
 * Delete a gallery submission and its likes
 */
export async function deleteGallerySubmission(
  connectionString: string,
  submissionId: string
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  await client.query(`DELETE FROM gallery_likes WHERE submission_id = $1`, [submissionId]);
  await client.query(`DELETE FROM gallery_submissions WHERE id = $1`, [submissionId]);

  await client.end();

  console.log(`[GalleryTestFactory] Deleted submission: ${submissionId}`);
}

/**
 * Delete a gallery like
 */
export async function deleteGalleryLike(
  connectionString: string,
  likeId: string,
  submissionId: string
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  await client.query(`DELETE FROM gallery_likes WHERE id = $1`, [likeId]);
  await client.query(
    `UPDATE gallery_submissions SET like_count = GREATEST(0, like_count - 1) WHERE id = $1`,
    [submissionId]
  );

  await client.end();

  console.log(`[GalleryTestFactory] Deleted like: ${likeId}`);
}

/**
 * Create a complete gallery test data set
 */
export async function createGalleryTestDataSet(
  connectionString: string,
  options: {
    organizationId: string;
    userId: string;
    characterIds: string[];
    includeApproved?: boolean;
    includePending?: boolean;
    includeRejected?: boolean;
    includeFeatured?: boolean;
    includeLikes?: boolean;
    likerUserIds?: string[];
  }
): Promise<GalleryTestDataSet> {
  const {
    organizationId,
    userId,
    characterIds,
    includeApproved = true,
    includePending = true,
    includeRejected = false,
    includeFeatured = false,
    includeLikes = false,
    likerUserIds = [],
  } = options;

  const submissions: TestGallerySubmission[] = [];
  const likes: TestGalleryLike[] = [];

  // Create approved submission
  if (includeApproved && characterIds.length > 0) {
    const submission = await createGallerySubmission(connectionString, {
      projectType: "agent",
      projectId: characterIds[0],
      organizationId,
      submittedByUserId: userId,
      title: "Approved Test Submission",
      description: "An approved submission for testing",
      status: "approved",
      tags: ["test", "approved"],
      viewCount: 100,
      likeCount: includeLikes ? likerUserIds.length : 50,
      cloneCount: 10,
    });
    submissions.push(submission);

    // Add likes
    if (includeLikes) {
      for (const likerUserId of likerUserIds) {
        const like = await createGalleryLike(connectionString, {
          submissionId: submission.id,
          userId: likerUserId,
        });
        likes.push(like);
      }
    }
  }

  // Create pending submission
  if (includePending && characterIds.length > 1) {
    const submission = await createGallerySubmission(connectionString, {
      projectType: "agent",
      projectId: characterIds[1] || characterIds[0],
      organizationId,
      submittedByUserId: userId,
      title: "Pending Test Submission",
      description: "A pending submission for testing",
      status: "pending",
      tags: ["test", "pending"],
    });
    submissions.push(submission);
  }

  // Create rejected submission
  if (includeRejected && characterIds.length > 2) {
    const submission = await createGallerySubmission(connectionString, {
      projectType: "agent",
      projectId: characterIds[2] || characterIds[0],
      organizationId,
      submittedByUserId: userId,
      title: "Rejected Test Submission",
      description: "A rejected submission for testing",
      status: "rejected",
      tags: ["test", "rejected"],
    });
    submissions.push(submission);
  }

  // Create featured submission
  if (includeFeatured && characterIds.length > 3) {
    const submission = await createGallerySubmission(connectionString, {
      projectType: "agent",
      projectId: characterIds[3] || characterIds[0],
      organizationId,
      submittedByUserId: userId,
      title: "Featured Test Submission",
      description: "A featured submission for testing",
      status: "featured",
      tags: ["test", "featured"],
      viewCount: 1000,
      likeCount: 500,
      cloneCount: 100,
    });
    submissions.push(submission);
  }

  // Cleanup function
  const cleanup = async (): Promise<void> => {
    const client = new Client({ connectionString });
    await client.connect();

    // Delete likes first
    for (const like of likes) {
      await client.query(`DELETE FROM gallery_likes WHERE id = $1`, [like.id]);
    }

    // Delete submissions
    for (const submission of submissions) {
      await client.query(`DELETE FROM gallery_submissions WHERE id = $1`, [submission.id]);
    }

    await client.end();
    console.log(`[GalleryTestFactory] Cleaned up ${submissions.length} submissions and ${likes.length} likes`);
  };

  console.log(`[GalleryTestFactory] Created test data set with ${submissions.length} submissions and ${likes.length} likes`);

  return {
    submissions,
    likes,
    cleanup,
  };
}

/**
 * Update submission status
 */
export async function updateSubmissionStatus(
  connectionString: string,
  submissionId: string,
  status: "pending" | "approved" | "rejected" | "featured",
  rejectionReason?: string
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  if (status === "rejected" && rejectionReason) {
    await client.query(
      `UPDATE gallery_submissions SET status = $2, rejection_reason = $3, updated_at = NOW() WHERE id = $1`,
      [submissionId, status, rejectionReason]
    );
  } else if (status === "featured") {
    await client.query(
      `UPDATE gallery_submissions SET status = $2, featured_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [submissionId, status]
    );
  } else {
    await client.query(
      `UPDATE gallery_submissions SET status = $2, updated_at = NOW() WHERE id = $1`,
      [submissionId, status]
    );
  }

  await client.end();
  console.log(`[GalleryTestFactory] Updated submission ${submissionId} status to ${status}`);
}

/**
 * Increment submission stats
 */
export async function incrementSubmissionStats(
  connectionString: string,
  submissionId: string,
  stat: "view_count" | "like_count" | "clone_count",
  amount = 1
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  await client.query(
    `UPDATE gallery_submissions SET ${stat} = ${stat} + $2, updated_at = NOW() WHERE id = $1`,
    [submissionId, amount]
  );

  await client.end();
  console.log(`[GalleryTestFactory] Incremented ${stat} by ${amount} for submission ${submissionId}`);
}

/**
 * Get submission by ID
 */
export async function getSubmissionById(
  connectionString: string,
  submissionId: string
): Promise<TestGallerySubmission | null> {
  const client = new Client({ connectionString });
  await client.connect();

  const result = await client.query(
    `SELECT * FROM gallery_submissions WHERE id = $1`,
    [submissionId]
  );

  await client.end();

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    projectType: row.project_type,
    projectId: row.project_id,
    organizationId: row.organization_id,
    submittedByUserId: row.submitted_by_user_id,
    title: row.title,
    description: row.description,
    previewImageUrl: row.preview_image_url,
    category: row.category,
    tags: row.tags || [],
    viewCount: row.view_count,
    likeCount: row.like_count,
    cloneCount: row.clone_count,
    status: row.status,
    rejectionReason: row.rejection_reason,
    featuredAt: row.featured_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Check if user has liked a submission
 */
export async function hasUserLikedSubmission(
  connectionString: string,
  submissionId: string,
  userId: string
): Promise<boolean> {
  const client = new Client({ connectionString });
  await client.connect();

  const result = await client.query(
    `SELECT id FROM gallery_likes WHERE submission_id = $1 AND user_id = $2`,
    [submissionId, userId]
  );

  await client.end();

  return result.rows.length > 0;
}

export default {
  createGallerySubmission,
  createGalleryLike,
  deleteGallerySubmission,
  deleteGalleryLike,
  createGalleryTestDataSet,
  updateSubmissionStatus,
  incrementSubmissionStats,
  getSubmissionById,
  hasUserLikedSubmission,
};
