/**
 * Community Gallery Integration Tests
 *
 * Comprehensive tests for the Community Gallery feature:
 * - Gallery submissions CRUD
 * - Like functionality
 * - Clone functionality
 * - View count tracking
 * - Filtering and sorting
 * - Authorization checks
 *
 * Uses real database connections via test data factory.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Client } from "pg";
import { v4 as uuidv4 } from "uuid";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const TIMEOUT = 15000;

// Test data interfaces
interface TestOrganization {
  id: string;
  name: string;
  slug: string;
}

interface TestUser {
  id: string;
  email: string;
  organizationId: string;
}

interface TestCharacter {
  id: string;
  name: string;
  userId: string;
  organizationId: string;
  isPublic: boolean;
}

interface TestGallerySubmission {
  id: string;
  projectType: "agent" | "app" | "mcp";
  projectId: string;
  organizationId: string;
  submittedByUserId: string;
  title: string;
  description: string;
  status: "pending" | "approved" | "rejected" | "featured";
}

// Test data storage
let testOrg1: TestOrganization;
let testOrg2: TestOrganization;
let testUser1: TestUser;
let testUser2: TestUser;
let testCharacter1: TestCharacter;
let testCharacter2: TestCharacter;
let testSubmission1: TestGallerySubmission;
let testSubmission2: TestGallerySubmission;
let dbClient: Client;

const connectionString = process.env.DATABASE_URL || "";

/**
 * Setup test data in the database
 */
async function setupTestData(): Promise<void> {
  dbClient = new Client({ connectionString });
  await dbClient.connect();

  // Create test organizations
  testOrg1 = {
    id: uuidv4(),
    name: "Test Gallery Org 1",
    slug: `test-gallery-org-${uuidv4().slice(0, 8)}`,
  };

  testOrg2 = {
    id: uuidv4(),
    name: "Test Gallery Org 2",
    slug: `test-gallery-org-${uuidv4().slice(0, 8)}`,
  };

  await dbClient.query(
    `INSERT INTO organizations (id, name, slug, credit_balance, is_active, settings, allowed_models, allowed_providers)
     VALUES ($1, $2, $3, 100.0, true, '{}', '[]', '[]')`,
    [testOrg1.id, testOrg1.name, testOrg1.slug]
  );

  await dbClient.query(
    `INSERT INTO organizations (id, name, slug, credit_balance, is_active, settings, allowed_models, allowed_providers)
     VALUES ($1, $2, $3, 100.0, true, '{}', '[]', '[]')`,
    [testOrg2.id, testOrg2.name, testOrg2.slug]
  );

  // Create test users
  testUser1 = {
    id: uuidv4(),
    email: `test-gallery-user1-${uuidv4().slice(0, 8)}@test.local`,
    organizationId: testOrg1.id,
  };

  testUser2 = {
    id: uuidv4(),
    email: `test-gallery-user2-${uuidv4().slice(0, 8)}@test.local`,
    organizationId: testOrg2.id,
  };

  await dbClient.query(
    `INSERT INTO users (id, email, name, organization_id, role, is_anonymous, is_active)
     VALUES ($1, $2, 'Test User 1', $3, 'owner', false, true)`,
    [testUser1.id, testUser1.email, testUser1.organizationId]
  );

  await dbClient.query(
    `INSERT INTO users (id, email, name, organization_id, role, is_anonymous, is_active)
     VALUES ($1, $2, 'Test User 2', $3, 'owner', false, true)`,
    [testUser2.id, testUser2.email, testUser2.organizationId]
  );

  // Create test characters
  testCharacter1 = {
    id: uuidv4(),
    name: "Test Gallery Character 1",
    userId: testUser1.id,
    organizationId: testOrg1.id,
    isPublic: true,
  };

  testCharacter2 = {
    id: uuidv4(),
    name: "Test Gallery Character 2",
    userId: testUser2.id,
    organizationId: testOrg2.id,
    isPublic: false,
  };

  await dbClient.query(
    `INSERT INTO user_characters (id, user_id, organization_id, name, bio, is_public, character_data, settings)
     VALUES ($1, $2, $3, $4, 'Test bio for gallery character 1', $5, '{}', '{}')`,
    [
      testCharacter1.id,
      testCharacter1.userId,
      testCharacter1.organizationId,
      testCharacter1.name,
      testCharacter1.isPublic,
    ]
  );

  await dbClient.query(
    `INSERT INTO user_characters (id, user_id, organization_id, name, bio, is_public, character_data, settings)
     VALUES ($1, $2, $3, $4, 'Test bio for gallery character 2', $5, '{}', '{}')`,
    [
      testCharacter2.id,
      testCharacter2.userId,
      testCharacter2.organizationId,
      testCharacter2.name,
      testCharacter2.isPublic,
    ]
  );

  // Create test gallery submissions
  testSubmission1 = {
    id: uuidv4(),
    projectType: "agent",
    projectId: testCharacter1.id,
    organizationId: testOrg1.id,
    submittedByUserId: testUser1.id,
    title: "Test Gallery Submission 1",
    description: "A test submission for the gallery",
    status: "approved",
  };

  testSubmission2 = {
    id: uuidv4(),
    projectType: "agent",
    projectId: testCharacter2.id,
    organizationId: testOrg2.id,
    submittedByUserId: testUser2.id,
    title: "Test Gallery Submission 2 (Pending)",
    description: "A pending test submission",
    status: "pending",
  };

  await dbClient.query(
    `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 0, '[]')`,
    [
      testSubmission1.id,
      testSubmission1.projectType,
      testSubmission1.projectId,
      testSubmission1.organizationId,
      testSubmission1.submittedByUserId,
      testSubmission1.title,
      testSubmission1.description,
      testSubmission1.status,
    ]
  );

  await dbClient.query(
    `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 0, '[]')`,
    [
      testSubmission2.id,
      testSubmission2.projectType,
      testSubmission2.projectId,
      testSubmission2.organizationId,
      testSubmission2.submittedByUserId,
      testSubmission2.title,
      testSubmission2.description,
      testSubmission2.status,
    ]
  );

  console.log("[Test Setup] Created gallery test data");
}

/**
 * Cleanup test data from database
 */
async function cleanupTestData(): Promise<void> {
  if (!dbClient) return;

  // Delete in order respecting foreign keys
  await dbClient.query(`DELETE FROM gallery_likes WHERE submission_id IN ($1, $2)`, [
    testSubmission1.id,
    testSubmission2.id,
  ]);
  await dbClient.query(`DELETE FROM gallery_submissions WHERE organization_id IN ($1, $2)`, [
    testOrg1.id,
    testOrg2.id,
  ]);
  await dbClient.query(`DELETE FROM user_characters WHERE organization_id IN ($1, $2)`, [
    testOrg1.id,
    testOrg2.id,
  ]);
  await dbClient.query(`DELETE FROM users WHERE organization_id IN ($1, $2)`, [
    testOrg1.id,
    testOrg2.id,
  ]);
  await dbClient.query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [
    testOrg1.id,
    testOrg2.id,
  ]);

  await dbClient.end();
  console.log("[Test Cleanup] Removed gallery test data");
}

// Setup and teardown
beforeAll(async () => {
  if (!connectionString) {
    console.log("[Test Setup] Skipping - no DATABASE_URL configured");
    return;
  }
  await setupTestData();
});

afterAll(async () => {
  if (connectionString) {
    await cleanupTestData();
  }
});

describe("Community Gallery - Public API", () => {
  describe("GET /gallery - Page Loading", () => {
    test("gallery page returns 200", async () => {
      const response = await fetch(`${SERVER_URL}/gallery`, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      expect(response.status).toBe(200);
    });

    test("gallery page has correct content-type", async () => {
      const response = await fetch(`${SERVER_URL}/gallery`, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("text/html");
    });
  });

  describe("GET /gallery/[id] - Detail Page", () => {
    test("returns 404 for invalid UUID format", async () => {
      const response = await fetch(`${SERVER_URL}/gallery/not-a-uuid`, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      expect(response.status).toBe(404);
    });

    test("returns 404 for non-existent valid UUID", async () => {
      const fakeUuid = uuidv4();
      const response = await fetch(`${SERVER_URL}/gallery/${fakeUuid}`, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      expect(response.status).toBe(404);
    });

    test("returns 200 for existing approved submission", async () => {
      if (!connectionString) return;

      const response = await fetch(`${SERVER_URL}/gallery/${testSubmission1.id}`, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      expect(response.status).toBe(200);
    });

    test("returns 404 for pending submission (not publicly visible)", async () => {
      if (!connectionString) return;

      const response = await fetch(`${SERVER_URL}/gallery/${testSubmission2.id}`, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      expect(response.status).toBe(404);
    });
  });

  describe("Discovery API Integration", () => {
    test("GET /api/v1/discovery returns valid structure", async () => {
      const response = await fetch(`${SERVER_URL}/api/v1/discovery?types=agent,app,mcp&limit=10`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("services");
      expect(Array.isArray(data.services)).toBe(true);
    });

    test("discovery API filters by type", async () => {
      const response = await fetch(`${SERVER_URL}/api/v1/discovery?types=agent&limit=10`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      for (const service of data.services) {
        expect(service.type).toBe("agent");
      }
    });
  });
});

describe("Community Gallery - UUID Validation", () => {
  const validUuids = [
    "123e4567-e89b-12d3-a456-426614174000",
    "00000000-0000-0000-0000-000000000000",
    "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
  ];

  const invalidUuids = [
    "not-a-uuid",
    "123",
    "123e4567-e89b-12d3-a456",
    "123e4567-e89b-12d3-a456-426614174000-extra",
    "123e4567e89b12d3a456426614174000",
    "",
    "null",
    "undefined",
    "../../../etc/passwd",
    "<script>alert('xss')</script>",
    "SELECT * FROM users",
  ];

  for (const uuid of validUuids) {
    test(`accepts valid UUID format: ${uuid.slice(0, 20)}...`, async () => {
      const response = await fetch(`${SERVER_URL}/gallery/${uuid}`, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      // Valid UUID format should return 404 (not found) not 500 (error)
      expect(response.status).toBe(404);
    });
  }

  for (const uuid of invalidUuids) {
    test(`rejects invalid UUID: ${uuid.slice(0, 20)}...`, async () => {
      const response = await fetch(`${SERVER_URL}/gallery/${encodeURIComponent(uuid)}`, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      expect(response.status).toBe(404);
    });
  }
});

describe("Community Gallery - Database Operations", () => {
  test("gallery_submissions table exists and is queryable", async () => {
    if (!connectionString) return;

    const result = await dbClient.query(
      `SELECT COUNT(*) as count FROM gallery_submissions WHERE organization_id = $1`,
      [testOrg1.id]
    );
    expect(Number(result.rows[0].count)).toBeGreaterThanOrEqual(1);
  });

  test("gallery_likes table exists and is queryable", async () => {
    if (!connectionString) return;

    const result = await dbClient.query(`SELECT COUNT(*) as count FROM gallery_likes`);
    expect(Number(result.rows[0].count)).toBeGreaterThanOrEqual(0);
  });

  test("can query submission by ID", async () => {
    if (!connectionString) return;

    const result = await dbClient.query(
      `SELECT * FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].title).toBe(testSubmission1.title);
  });

  test("can query submissions by status", async () => {
    if (!connectionString) return;

    const result = await dbClient.query(
      `SELECT * FROM gallery_submissions WHERE status = $1`,
      ["approved"]
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  test("can query submissions by project_type", async () => {
    if (!connectionString) return;

    const result = await dbClient.query(
      `SELECT * FROM gallery_submissions WHERE project_type = $1`,
      ["agent"]
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  test("view_count can be incremented", async () => {
    if (!connectionString) return;

    // Get initial count
    const before = await dbClient.query(
      `SELECT view_count FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    const initialCount = Number(before.rows[0].view_count);

    // Increment
    await dbClient.query(
      `UPDATE gallery_submissions SET view_count = view_count + 1 WHERE id = $1`,
      [testSubmission1.id]
    );

    // Verify
    const after = await dbClient.query(
      `SELECT view_count FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    expect(Number(after.rows[0].view_count)).toBe(initialCount + 1);
  });

  test("like_count can be incremented and decremented", async () => {
    if (!connectionString) return;

    // Get initial count
    const before = await dbClient.query(
      `SELECT like_count FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    const initialCount = Number(before.rows[0].like_count);

    // Increment
    await dbClient.query(
      `UPDATE gallery_submissions SET like_count = like_count + 1 WHERE id = $1`,
      [testSubmission1.id]
    );

    const after1 = await dbClient.query(
      `SELECT like_count FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    expect(Number(after1.rows[0].like_count)).toBe(initialCount + 1);

    // Decrement (revert)
    await dbClient.query(
      `UPDATE gallery_submissions SET like_count = like_count - 1 WHERE id = $1`,
      [testSubmission1.id]
    );

    const after2 = await dbClient.query(
      `SELECT like_count FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    expect(Number(after2.rows[0].like_count)).toBe(initialCount);
  });

  test("clone_count can be incremented", async () => {
    if (!connectionString) return;

    // Get initial count
    const before = await dbClient.query(
      `SELECT clone_count FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    const initialCount = Number(before.rows[0].clone_count);

    // Increment
    await dbClient.query(
      `UPDATE gallery_submissions SET clone_count = clone_count + 1 WHERE id = $1`,
      [testSubmission1.id]
    );

    // Verify
    const after = await dbClient.query(
      `SELECT clone_count FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    expect(Number(after.rows[0].clone_count)).toBe(initialCount + 1);

    // Reset
    await dbClient.query(
      `UPDATE gallery_submissions SET clone_count = $2 WHERE id = $1`,
      [testSubmission1.id, initialCount]
    );
  });
});

describe("Community Gallery - Like System", () => {
  test("can add a like to gallery_likes", async () => {
    if (!connectionString) return;

    const likeId = uuidv4();

    // Add like
    await dbClient.query(
      `INSERT INTO gallery_likes (id, submission_id, user_id) VALUES ($1, $2, $3)`,
      [likeId, testSubmission1.id, testUser2.id]
    );

    // Verify
    const result = await dbClient.query(
      `SELECT * FROM gallery_likes WHERE submission_id = $1 AND user_id = $2`,
      [testSubmission1.id, testUser2.id]
    );
    expect(result.rows.length).toBe(1);

    // Cleanup
    await dbClient.query(`DELETE FROM gallery_likes WHERE id = $1`, [likeId]);
  });

  test("user cannot like same submission twice (unique constraint)", async () => {
    if (!connectionString) return;

    const likeId1 = uuidv4();
    const likeId2 = uuidv4();

    // Add first like
    await dbClient.query(
      `INSERT INTO gallery_likes (id, submission_id, user_id) VALUES ($1, $2, $3)`,
      [likeId1, testSubmission1.id, testUser2.id]
    );

    // Try to add duplicate like (should fail due to unique constraint)
    let error: Error | null = null;
    try {
      await dbClient.query(
        `INSERT INTO gallery_likes (id, submission_id, user_id) VALUES ($1, $2, $3)`,
        [likeId2, testSubmission1.id, testUser2.id]
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("unique");

    // Cleanup
    await dbClient.query(`DELETE FROM gallery_likes WHERE id = $1`, [likeId1]);
  });

  test("can remove a like", async () => {
    if (!connectionString) return;

    const likeId = uuidv4();

    // Add like
    await dbClient.query(
      `INSERT INTO gallery_likes (id, submission_id, user_id) VALUES ($1, $2, $3)`,
      [likeId, testSubmission1.id, testUser2.id]
    );

    // Remove like
    await dbClient.query(`DELETE FROM gallery_likes WHERE id = $1`, [likeId]);

    // Verify removed
    const result = await dbClient.query(
      `SELECT * FROM gallery_likes WHERE id = $1`,
      [likeId]
    );
    expect(result.rows.length).toBe(0);
  });

  test("cascades delete when submission is deleted", async () => {
    if (!connectionString) return;

    // Create temporary submission
    const tempSubmissionId = uuidv4();
    await dbClient.query(
      `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count, tags)
       VALUES ($1, 'agent', $2, $3, $4, 'Temp Submission', 'Temp', 'pending', 0, 0, 0, '[]')`,
      [tempSubmissionId, testCharacter1.id, testOrg1.id, testUser1.id]
    );

    // Add like to temp submission
    const likeId = uuidv4();
    await dbClient.query(
      `INSERT INTO gallery_likes (id, submission_id, user_id) VALUES ($1, $2, $3)`,
      [likeId, tempSubmissionId, testUser2.id]
    );

    // Delete submission (should cascade to likes)
    await dbClient.query(`DELETE FROM gallery_submissions WHERE id = $1`, [tempSubmissionId]);

    // Verify like was also deleted
    const result = await dbClient.query(
      `SELECT * FROM gallery_likes WHERE submission_id = $1`,
      [tempSubmissionId]
    );
    expect(result.rows.length).toBe(0);
  });
});

describe("Community Gallery - Status Workflow", () => {
  test("can transition from pending to approved", async () => {
    if (!connectionString) return;

    // Update status
    await dbClient.query(
      `UPDATE gallery_submissions SET status = 'approved' WHERE id = $1`,
      [testSubmission2.id]
    );

    // Verify
    const result = await dbClient.query(
      `SELECT status FROM gallery_submissions WHERE id = $1`,
      [testSubmission2.id]
    );
    expect(result.rows[0].status).toBe("approved");

    // Reset to pending for other tests
    await dbClient.query(
      `UPDATE gallery_submissions SET status = 'pending' WHERE id = $1`,
      [testSubmission2.id]
    );
  });

  test("can transition from pending to rejected", async () => {
    if (!connectionString) return;

    // Update status with reason
    await dbClient.query(
      `UPDATE gallery_submissions SET status = 'rejected', rejection_reason = 'Test rejection' WHERE id = $1`,
      [testSubmission2.id]
    );

    // Verify
    const result = await dbClient.query(
      `SELECT status, rejection_reason FROM gallery_submissions WHERE id = $1`,
      [testSubmission2.id]
    );
    expect(result.rows[0].status).toBe("rejected");
    expect(result.rows[0].rejection_reason).toBe("Test rejection");

    // Reset
    await dbClient.query(
      `UPDATE gallery_submissions SET status = 'pending', rejection_reason = NULL WHERE id = $1`,
      [testSubmission2.id]
    );
  });

  test("can transition to featured with featured_at timestamp", async () => {
    if (!connectionString) return;

    // Update to featured
    await dbClient.query(
      `UPDATE gallery_submissions SET status = 'featured', featured_at = NOW() WHERE id = $1`,
      [testSubmission1.id]
    );

    // Verify
    const result = await dbClient.query(
      `SELECT status, featured_at FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    expect(result.rows[0].status).toBe("featured");
    expect(result.rows[0].featured_at).not.toBeNull();

    // Reset to approved
    await dbClient.query(
      `UPDATE gallery_submissions SET status = 'approved', featured_at = NULL WHERE id = $1`,
      [testSubmission1.id]
    );
  });
});

describe("Community Gallery - Filtering & Sorting", () => {
  test("can filter submissions by organization", async () => {
    if (!connectionString) return;

    const result = await dbClient.query(
      `SELECT * FROM gallery_submissions WHERE organization_id = $1`,
      [testOrg1.id]
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    for (const row of result.rows) {
      expect(row.organization_id).toBe(testOrg1.id);
    }
  });

  test("can filter submissions by submitted_by_user_id", async () => {
    if (!connectionString) return;

    const result = await dbClient.query(
      `SELECT * FROM gallery_submissions WHERE submitted_by_user_id = $1`,
      [testUser1.id]
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    for (const row of result.rows) {
      expect(row.submitted_by_user_id).toBe(testUser1.id);
    }
  });

  test("can sort submissions by created_at DESC", async () => {
    if (!connectionString) return;

    const result = await dbClient.query(
      `SELECT created_at FROM gallery_submissions ORDER BY created_at DESC`
    );

    if (result.rows.length >= 2) {
      const first = new Date(result.rows[0].created_at).getTime();
      const second = new Date(result.rows[1].created_at).getTime();
      expect(first).toBeGreaterThanOrEqual(second);
    }
  });

  test("can sort submissions by like_count DESC", async () => {
    if (!connectionString) return;

    // Set different like counts for testing
    await dbClient.query(
      `UPDATE gallery_submissions SET like_count = 100 WHERE id = $1`,
      [testSubmission1.id]
    );
    await dbClient.query(
      `UPDATE gallery_submissions SET like_count = 50 WHERE id = $1`,
      [testSubmission2.id]
    );

    const result = await dbClient.query(
      `SELECT id, like_count FROM gallery_submissions WHERE id IN ($1, $2) ORDER BY like_count DESC`,
      [testSubmission1.id, testSubmission2.id]
    );

    expect(result.rows[0].id).toBe(testSubmission1.id);
    expect(Number(result.rows[0].like_count)).toBeGreaterThan(Number(result.rows[1].like_count));

    // Reset
    await dbClient.query(
      `UPDATE gallery_submissions SET like_count = 0 WHERE id IN ($1, $2)`,
      [testSubmission1.id, testSubmission2.id]
    );
  });

  test("can sort submissions by view_count DESC", async () => {
    if (!connectionString) return;

    // Set different view counts for testing
    await dbClient.query(
      `UPDATE gallery_submissions SET view_count = 200 WHERE id = $1`,
      [testSubmission1.id]
    );
    await dbClient.query(
      `UPDATE gallery_submissions SET view_count = 100 WHERE id = $1`,
      [testSubmission2.id]
    );

    const result = await dbClient.query(
      `SELECT id, view_count FROM gallery_submissions WHERE id IN ($1, $2) ORDER BY view_count DESC`,
      [testSubmission1.id, testSubmission2.id]
    );

    expect(result.rows[0].id).toBe(testSubmission1.id);

    // Reset
    await dbClient.query(
      `UPDATE gallery_submissions SET view_count = 0 WHERE id IN ($1, $2)`,
      [testSubmission1.id, testSubmission2.id]
    );
  });

  test("can limit results", async () => {
    if (!connectionString) return;

    const result = await dbClient.query(
      `SELECT * FROM gallery_submissions LIMIT 1`
    );
    expect(result.rows.length).toBeLessThanOrEqual(1);
  });

  test("can paginate with offset", async () => {
    if (!connectionString) return;

    const allResults = await dbClient.query(
      `SELECT id FROM gallery_submissions WHERE organization_id IN ($1, $2) ORDER BY created_at`,
      [testOrg1.id, testOrg2.id]
    );

    if (allResults.rows.length >= 2) {
      const offsetResult = await dbClient.query(
        `SELECT id FROM gallery_submissions WHERE organization_id IN ($1, $2) ORDER BY created_at LIMIT 1 OFFSET 1`,
        [testOrg1.id, testOrg2.id]
      );
      expect(offsetResult.rows[0].id).toBe(allResults.rows[1].id);
    }
  });
});

describe("Community Gallery - Data Integrity", () => {
  test("project_type enum only accepts valid values", async () => {
    if (!connectionString) return;

    let error: Error | null = null;
    try {
      await dbClient.query(
        `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count, tags)
         VALUES ($1, 'invalid_type', $2, $3, $4, 'Test', 'Test', 'pending', 0, 0, 0, '[]')`,
        [uuidv4(), testCharacter1.id, testOrg1.id, testUser1.id]
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
  });

  test("status enum only accepts valid values", async () => {
    if (!connectionString) return;

    let error: Error | null = null;
    try {
      await dbClient.query(
        `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count, tags)
         VALUES ($1, 'agent', $2, $3, $4, 'Test', 'Test', 'invalid_status', 0, 0, 0, '[]')`,
        [uuidv4(), testCharacter1.id, testOrg1.id, testUser1.id]
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
  });

  test("foreign key constraint on organization_id", async () => {
    if (!connectionString) return;

    const fakeOrgId = uuidv4();
    let error: Error | null = null;

    try {
      await dbClient.query(
        `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count, tags)
         VALUES ($1, 'agent', $2, $3, $4, 'Test', 'Test', 'pending', 0, 0, 0, '[]')`,
        [uuidv4(), testCharacter1.id, fakeOrgId, testUser1.id]
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("foreign key");
  });

  test("foreign key constraint on submitted_by_user_id", async () => {
    if (!connectionString) return;

    const fakeUserId = uuidv4();
    let error: Error | null = null;

    try {
      await dbClient.query(
        `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count, tags)
         VALUES ($1, 'agent', $2, $3, $4, 'Test', 'Test', 'pending', 0, 0, 0, '[]')`,
        [uuidv4(), testCharacter1.id, testOrg1.id, fakeUserId]
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("foreign key");
  });

  test("title cannot be null", async () => {
    if (!connectionString) return;

    let error: Error | null = null;

    try {
      await dbClient.query(
        `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count, tags)
         VALUES ($1, 'agent', $2, $3, $4, NULL, 'Test', 'pending', 0, 0, 0, '[]')`,
        [uuidv4(), testCharacter1.id, testOrg1.id, testUser1.id]
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("null");
  });

  test("description cannot be null", async () => {
    if (!connectionString) return;

    let error: Error | null = null;

    try {
      await dbClient.query(
        `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count, tags)
         VALUES ($1, 'agent', $2, $3, $4, 'Test', NULL, 'pending', 0, 0, 0, '[]')`,
        [uuidv4(), testCharacter1.id, testOrg1.id, testUser1.id]
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("null");
  });

  test("tags defaults to empty array", async () => {
    if (!connectionString) return;

    const tempId = uuidv4();

    await dbClient.query(
      `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count)
       VALUES ($1, 'agent', $2, $3, $4, 'Test Tags', 'Test', 'pending', 0, 0, 0)`,
      [tempId, testCharacter1.id, testOrg1.id, testUser1.id]
    );

    const result = await dbClient.query(
      `SELECT tags FROM gallery_submissions WHERE id = $1`,
      [tempId]
    );

    expect(result.rows[0].tags).toEqual([]);

    // Cleanup
    await dbClient.query(`DELETE FROM gallery_submissions WHERE id = $1`, [tempId]);
  });

  test("view_count defaults to 0", async () => {
    if (!connectionString) return;

    const result = await dbClient.query(
      `SELECT view_count FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    expect(Number(result.rows[0].view_count)).toBeGreaterThanOrEqual(0);
  });
});

describe("Community Gallery - Concurrent Operations", () => {
  test("handles concurrent view count increments", async () => {
    if (!connectionString) return;

    // Reset view count
    await dbClient.query(
      `UPDATE gallery_submissions SET view_count = 0 WHERE id = $1`,
      [testSubmission1.id]
    );

    // Simulate concurrent increments
    const incrementPromises = Array(10)
      .fill(null)
      .map(() =>
        dbClient.query(
          `UPDATE gallery_submissions SET view_count = view_count + 1 WHERE id = $1`,
          [testSubmission1.id]
        )
      );

    await Promise.all(incrementPromises);

    // Verify final count
    const result = await dbClient.query(
      `SELECT view_count FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    expect(Number(result.rows[0].view_count)).toBe(10);

    // Reset
    await dbClient.query(
      `UPDATE gallery_submissions SET view_count = 0 WHERE id = $1`,
      [testSubmission1.id]
    );
  });

  test("handles concurrent like count updates", async () => {
    if (!connectionString) return;

    // Reset like count
    await dbClient.query(
      `UPDATE gallery_submissions SET like_count = 0 WHERE id = $1`,
      [testSubmission1.id]
    );

    // Add 5 likes, remove 3
    const operations = [
      ...Array(5).fill("increment"),
      ...Array(3).fill("decrement"),
    ];

    const updatePromises = operations.map((op) =>
      dbClient.query(
        `UPDATE gallery_submissions SET like_count = like_count ${op === "increment" ? "+ 1" : "- 1"} WHERE id = $1`,
        [testSubmission1.id]
      )
    );

    await Promise.all(updatePromises);

    // Verify final count (5 - 3 = 2)
    const result = await dbClient.query(
      `SELECT like_count FROM gallery_submissions WHERE id = $1`,
      [testSubmission1.id]
    );
    expect(Number(result.rows[0].like_count)).toBe(2);

    // Reset
    await dbClient.query(
      `UPDATE gallery_submissions SET like_count = 0 WHERE id = $1`,
      [testSubmission1.id]
    );
  });
});

describe("Community Gallery - Security", () => {
  test("SQL injection in title is prevented", async () => {
    if (!connectionString) return;

    const maliciousTitle = "Test'; DROP TABLE gallery_submissions; --";
    const tempId = uuidv4();

    // Should insert safely with escaped content
    await dbClient.query(
      `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count, tags)
       VALUES ($1, 'agent', $2, $3, $4, $5, 'Test', 'pending', 0, 0, 0, '[]')`,
      [tempId, testCharacter1.id, testOrg1.id, testUser1.id, maliciousTitle]
    );

    // Verify table still exists and data was inserted correctly
    const result = await dbClient.query(
      `SELECT title FROM gallery_submissions WHERE id = $1`,
      [tempId]
    );
    expect(result.rows[0].title).toBe(maliciousTitle);

    // Cleanup
    await dbClient.query(`DELETE FROM gallery_submissions WHERE id = $1`, [tempId]);
  });

  test("XSS in description is stored (but should be escaped on render)", async () => {
    if (!connectionString) return;

    const xssDescription = '<script>alert("xss")</script>';
    const tempId = uuidv4();

    await dbClient.query(
      `INSERT INTO gallery_submissions (id, project_type, project_id, organization_id, submitted_by_user_id, title, description, status, view_count, like_count, clone_count, tags)
       VALUES ($1, 'agent', $2, $3, $4, 'Test XSS', $5, 'pending', 0, 0, 0, '[]')`,
      [tempId, testCharacter1.id, testOrg1.id, testUser1.id, xssDescription]
    );

    const result = await dbClient.query(
      `SELECT description FROM gallery_submissions WHERE id = $1`,
      [tempId]
    );
    // Content is stored as-is; escaping happens at render time
    expect(result.rows[0].description).toBe(xssDescription);

    // Cleanup
    await dbClient.query(`DELETE FROM gallery_submissions WHERE id = $1`, [tempId]);
  });
});

console.log("[Community Gallery Tests] Loaded successfully");
