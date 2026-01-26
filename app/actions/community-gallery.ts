/**
 * Community Gallery Server Actions
 *
 * Server-side actions for managing gallery submissions, likes, and engagement.
 */
"use server";

import { requireAuthWithOrg, getCurrentUser } from "@/lib/auth";
import { galleryService } from "@/lib/services/gallery";
import { charactersService } from "@/lib/services/characters";
import { appsService } from "@/lib/services/apps";
import { userMcpsService } from "@/lib/services/user-mcps";
import { revalidatePath } from "next/cache";
import type { GalleryProjectType } from "@/db/schemas/gallery-submissions";

// ============================================================================
// Types
// ============================================================================

export interface SubmitToGalleryInput {
  projectType: GalleryProjectType;
  projectId: string;
  title: string;
  description: string;
  previewImageUrl?: string;
  category?: string;
  tags?: string[];
}

export interface GalleryFilterInput {
  projectType?: GalleryProjectType | GalleryProjectType[];
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "newest" | "popular" | "likes" | "views" | "clones";
}

// ============================================================================
// Submission Actions
// ============================================================================

/**
 * Submits a project to the community gallery.
 * Requires authentication and project ownership verification.
 */
export async function submitToGallery(input: SubmitToGalleryInput) {
  const user = await requireAuthWithOrg();
  const { organization_id } = user;

  // Verify project ownership based on type
  const isOwner = await verifyProjectOwnership(
    input.projectType,
    input.projectId,
    organization_id
  );

  if (!isOwner) {
    throw new Error("You do not have permission to submit this project");
  }

  const submission = await galleryService.submitProject({
    projectType: input.projectType,
    projectId: input.projectId,
    organizationId: organization_id,
    userId: user.id,
    title: input.title,
    description: input.description,
    previewImageUrl: input.previewImageUrl,
    category: input.category,
    tags: input.tags,
  });

  revalidatePath("/gallery");

  return submission;
}

/**
 * Lists approved gallery projects (public).
 * No authentication required.
 */
export async function listGalleryProjects(filters: GalleryFilterInput = {}) {
  return await galleryService.listApproved(filters);
}

/**
 * Lists featured gallery projects (public).
 */
export async function listFeaturedProjects(limit = 10) {
  return await galleryService.listFeatured(limit);
}

/**
 * Gets a single gallery submission by ID (public).
 */
export async function getGalleryProject(id: string) {
  return await galleryService.getById(id);
}

/**
 * Gets a submission by project reference.
 */
export async function getGalleryProjectByRef(
  projectType: GalleryProjectType,
  projectId: string
) {
  return await galleryService.getByProject(projectType, projectId);
}

/**
 * Lists the current user's submitted projects.
 */
export async function listMyGallerySubmissions(filters: GalleryFilterInput = {}) {
  const user = await requireAuthWithOrg();
  return await galleryService.listByOrganization(user.organization_id, filters);
}

/**
 * Updates a gallery submission.
 * Requires authentication and submission ownership.
 */
export async function updateGallerySubmission(
  id: string,
  data: {
    title?: string;
    description?: string;
    previewImageUrl?: string;
    category?: string;
    tags?: string[];
  }
) {
  const user = await requireAuthWithOrg();

  const submission = await galleryService.getById(id);
  if (!submission) {
    throw new Error("Submission not found");
  }

  if (submission.organization_id !== user.organization_id) {
    throw new Error("You do not have permission to update this submission");
  }

  const updated = await galleryService.updateSubmission(id, data);

  revalidatePath("/gallery");
  revalidatePath(`/gallery/${id}`);

  return updated;
}

/**
 * Deletes a gallery submission.
 * Requires authentication and submission ownership.
 */
export async function deleteGallerySubmission(id: string) {
  const user = await requireAuthWithOrg();

  const submission = await galleryService.getById(id);
  if (!submission) {
    throw new Error("Submission not found");
  }

  if (submission.organization_id !== user.organization_id) {
    throw new Error("You do not have permission to delete this submission");
  }

  await galleryService.deleteSubmission(id);

  revalidatePath("/gallery");

  return { success: true };
}

/**
 * Checks if a project is already submitted to the gallery.
 */
export async function isProjectInGallery(
  projectType: GalleryProjectType,
  projectId: string
): Promise<boolean> {
  return await galleryService.isProjectSubmitted(projectType, projectId);
}

// ============================================================================
// Engagement Actions
// ============================================================================

/**
 * Likes or unlikes a gallery project.
 * Requires authentication.
 */
export async function likeGalleryProject(submissionId: string) {
  const user = await requireAuthWithOrg();
  const result = await galleryService.toggleLike(submissionId, user.id);

  revalidatePath("/gallery");
  revalidatePath(`/gallery/${submissionId}`);

  return result;
}

/**
 * Checks if the current user has liked a project.
 */
export async function hasUserLikedProject(submissionId: string) {
  const user = await getCurrentUser();
  if (!user) return false;
  return await galleryService.hasLiked(submissionId, user.id);
}

/**
 * Gets all submission IDs that the current user has liked.
 */
export async function getUserLikedProjectIds() {
  const user = await getCurrentUser();
  if (!user) return [];
  return await galleryService.getUserLikedIds(user.id);
}

/**
 * Increments the view count for a project.
 * No authentication required.
 */
export async function incrementProjectViews(submissionId: string) {
  await galleryService.incrementViews(submissionId);
}

/**
 * Increments the clone count for a project.
 */
export async function incrementProjectClones(submissionId: string) {
  await galleryService.incrementClones(submissionId);
}

// ============================================================================
// Clone Actions
// ============================================================================

export interface CloneResult {
  success: boolean;
  clonedId: string;
  redirectUrl: string;
}

/**
 * Clones a gallery project to the user's account.
 * Creates a copy of the underlying project (agent, app, or MCP).
 */
export async function cloneGalleryProject(
  submissionId: string
): Promise<CloneResult> {
  const user = await requireAuthWithOrg();
  const { organization_id } = user;

  // Get the submission
  const submission = await galleryService.getById(submissionId);
  if (!submission) {
    throw new Error("Submission not found");
  }

  // Clone based on project type
  let clonedId: string;
  let redirectUrl: string;

  switch (submission.project_type) {
    case "agent": {
      // Get the original character
      const original = await charactersService.getById(submission.project_id);
      if (!original) {
        throw new Error("Original character not found");
      }

      // Create a clone
      const clonedCharacter = await charactersService.create({
        user_id: user.id,
        organization_id: organization_id,
        name: `${original.name} (Copy)`,
        bio: original.bio,
        system: original.system,
        topics: original.topics,
        adjectives: original.adjectives,
        knowledge: original.knowledge,
        plugins: original.plugins,
        style: original.style,
        settings: original.settings,
        character_data: original.character_data || {},
        avatar_url: original.avatar_url,
        category: original.category,
        tags: original.tags,
        is_public: false,
        is_template: false,
      });

      clonedId = clonedCharacter.id;
      redirectUrl = "/dashboard/my-agents";
      break;
    }
    case "app": {
      // For apps, we redirect to create a new app based on the template
      // Full app cloning would require more complex logic
      clonedId = submission.project_id;
      redirectUrl = `/dashboard/apps/create?template=${submission.project_id}`;
      break;
    }
    case "mcp": {
      // For MCPs, we redirect to create a new MCP based on the template
      clonedId = submission.project_id;
      redirectUrl = `/dashboard/mcps?clone=${submission.project_id}`;
      break;
    }
    default:
      throw new Error(`Unsupported project type: ${submission.project_type}`);
  }

  // Increment clone count
  await galleryService.incrementClones(submissionId);

  revalidatePath("/gallery");
  revalidatePath(`/gallery/${submissionId}`);

  return {
    success: true,
    clonedId,
    redirectUrl,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Verifies that the organization owns the project.
 */
async function verifyProjectOwnership(
  projectType: GalleryProjectType,
  projectId: string,
  organizationId: string
): Promise<boolean> {
  switch (projectType) {
    case "agent": {
      const character = await charactersService.getById(projectId);
      return character?.organization_id === organizationId;
    }
    case "app": {
      const app = await appsService.getById(projectId);
      return app?.organization_id === organizationId;
    }
    case "mcp": {
      const mcp = await userMcpsService.getById(projectId);
      return mcp?.organization_id === organizationId;
    }
    default:
      return false;
  }
}
