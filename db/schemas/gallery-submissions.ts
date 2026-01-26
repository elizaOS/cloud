/**
 * Gallery Submissions Schema
 *
 * Stores projects submitted to the public community gallery.
 * Projects can be agents, apps, or MCPs that users want to showcase.
 */

import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Project type enum for gallery submissions.
 */
export const galleryProjectTypeEnum = pgEnum("gallery_project_type", [
  "agent",
  "app",
  "mcp",
]);

export type GalleryProjectType = "agent" | "app" | "mcp";

/**
 * Submission status enum.
 * - pending: Awaiting review
 * - approved: Visible in gallery
 * - rejected: Not shown (with reason)
 * - featured: Highlighted in gallery
 */
export const gallerySubmissionStatusEnum = pgEnum("gallery_submission_status", [
  "pending",
  "approved",
  "rejected",
  "featured",
]);

export type GallerySubmissionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "featured";

/**
 * Gallery submissions table.
 *
 * Represents a project submission to the community gallery.
 * Each submission links to an underlying project (agent, app, or MCP)
 * and includes gallery-specific metadata like title, description, and preview image.
 */
export const gallerySubmissions = pgTable(
  "gallery_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Reference to the actual project
    project_type: galleryProjectTypeEnum("project_type").notNull(),
    project_id: uuid("project_id").notNull(),

    // Submitter info
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    submitted_by_user_id: uuid("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Gallery metadata (can differ from project)
    title: text("title").notNull(),
    description: text("description").notNull(),
    preview_image_url: text("preview_image_url"),
    category: text("category"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),

    // Stats (denormalized for performance)
    view_count: integer("view_count").default(0).notNull(),
    like_count: integer("like_count").default(0).notNull(),
    clone_count: integer("clone_count").default(0).notNull(),

    // Status
    status: gallerySubmissionStatusEnum("status").default("pending").notNull(),
    rejection_reason: text("rejection_reason"),
    featured_at: timestamp("featured_at"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    // Prevent duplicate submissions for the same project
    project_unique_idx: uniqueIndex("gallery_submissions_project_unique_idx").on(
      table.project_type,
      table.project_id
    ),
    // Query by organization
    organization_idx: index("gallery_submissions_organization_idx").on(
      table.organization_id
    ),
    // Query by submitter
    submitter_idx: index("gallery_submissions_submitter_idx").on(
      table.submitted_by_user_id
    ),
    // Query by status (approved, featured, etc.)
    status_idx: index("gallery_submissions_status_idx").on(table.status),
    // Query featured items by time
    featured_idx: index("gallery_submissions_featured_idx").on(
      table.featured_at
    ),
    // Query by category
    category_idx: index("gallery_submissions_category_idx").on(table.category),
    // Sort by popularity
    popularity_idx: index("gallery_submissions_popularity_idx").on(
      table.like_count,
      table.view_count
    ),
    // Sort by creation date
    created_idx: index("gallery_submissions_created_idx").on(table.created_at),
  })
);

/**
 * Gallery likes table.
 *
 * Tracks which users have liked which gallery submissions.
 * Used for like/unlike functionality and calculating like_count.
 */
export const galleryLikes = pgTable(
  "gallery_likes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submission_id: uuid("submission_id")
      .notNull()
      .references(() => gallerySubmissions.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Each user can only like a submission once
    unique_like_idx: uniqueIndex("gallery_likes_unique_idx").on(
      table.submission_id,
      table.user_id
    ),
    // Query likes by submission
    submission_idx: index("gallery_likes_submission_idx").on(
      table.submission_id
    ),
    // Query likes by user
    user_idx: index("gallery_likes_user_idx").on(table.user_id),
  })
);

// Type inference
export type GallerySubmission = InferSelectModel<typeof gallerySubmissions>;
export type NewGallerySubmission = InferInsertModel<typeof gallerySubmissions>;
export type GalleryLike = InferSelectModel<typeof galleryLikes>;
export type NewGalleryLike = InferInsertModel<typeof galleryLikes>;
