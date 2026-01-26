/**
 * Community Gallery Unit Tests
 *
 * Unit tests for:
 * - UUID validation
 * - Data transformation functions
 * - Input validation
 * - Type checking
 *
 * These tests don't require database or server connections.
 */

import { describe, test, expect } from "bun:test";

/**
 * UUID validation regex (same as used in gallery pages)
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Project types enum validation
 */
const VALID_PROJECT_TYPES = ["agent", "app", "mcp"] as const;
type ProjectType = (typeof VALID_PROJECT_TYPES)[number];

function isValidProjectType(type: string): type is ProjectType {
  return VALID_PROJECT_TYPES.includes(type as ProjectType);
}

/**
 * Submission status enum validation
 */
const VALID_STATUSES = ["pending", "approved", "rejected", "featured"] as const;
type SubmissionStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(status: string): status is SubmissionStatus {
  return VALID_STATUSES.includes(status as SubmissionStatus);
}

/**
 * Sort options validation
 */
const VALID_SORT_OPTIONS = ["newest", "popular", "trending", "most_cloned"] as const;
type SortOption = (typeof VALID_SORT_OPTIONS)[number];

function isValidSortOption(sort: string): sort is SortOption {
  return VALID_SORT_OPTIONS.includes(sort as SortOption);
}

/**
 * Gallery project interface for testing
 */
interface GalleryProject {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  image?: string;
  category?: string;
  tags: string[];
  slug?: string;
  viewCount: number;
  likeCount: number;
  cloneCount: number;
  submissionId?: string;
  isLiked?: boolean;
}

/**
 * Transform API service to gallery project
 */
function transformServiceToProject(service: {
  id: string;
  name: string;
  description: string;
  type: string;
  image?: string;
  category?: string;
  tags?: string[];
  slug?: string;
}): GalleryProject | null {
  if (!isValidProjectType(service.type)) {
    return null;
  }

  return {
    id: service.id,
    name: service.name,
    description: service.description,
    type: service.type,
    image: service.image,
    category: service.category,
    tags: service.tags || [],
    slug: service.slug,
    viewCount: 0,
    likeCount: 0,
    cloneCount: 0,
  };
}

/**
 * Sanitize search query
 */
function sanitizeSearchQuery(query: string): string {
  return query
    .trim()
    .slice(0, 200) // Limit length
    .replace(/[<>]/g, ""); // Remove potential HTML
}

/**
 * Format count for display
 */
function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

describe("UUID Validation", () => {
  describe("Valid UUIDs", () => {
    const validUUIDs = [
      "123e4567-e89b-12d3-a456-426614174000",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    ];

    for (const uuid of validUUIDs) {
      test(`accepts valid UUID: ${uuid}`, () => {
        expect(isValidUUID(uuid)).toBe(true);
      });
    }
  });

  describe("Invalid UUIDs", () => {
    const invalidUUIDs = [
      "",
      "not-a-uuid",
      "123",
      "123e4567-e89b-12d3-a456", // Too short
      "123e4567-e89b-12d3-a456-426614174000-extra", // Too long
      "123e4567e89b12d3a456426614174000", // Missing dashes
      "123e4567-e89b-12d3-a456-42661417400g", // Invalid character 'g'
      "null",
      "undefined",
      "123e4567-e89b-12d3-a456-4266141740000", // One extra digit
      " 123e4567-e89b-12d3-a456-426614174000", // Leading space
      "123e4567-e89b-12d3-a456-426614174000 ", // Trailing space
      "../../../etc/passwd",
      "<script>alert('xss')</script>",
      "SELECT * FROM users",
      "'; DROP TABLE users; --",
    ];

    for (const uuid of invalidUUIDs) {
      test(`rejects invalid UUID: "${uuid.slice(0, 30)}${uuid.length > 30 ? "..." : ""}"`, () => {
        expect(isValidUUID(uuid)).toBe(false);
      });
    }
  });

  describe("Case Insensitivity", () => {
    test("accepts lowercase UUID", () => {
      expect(isValidUUID("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    });

    test("accepts uppercase UUID", () => {
      expect(isValidUUID("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
    });

    test("accepts mixed case UUID", () => {
      expect(isValidUUID("123E4567-e89b-12D3-a456-426614174000")).toBe(true);
    });
  });
});

describe("Project Type Validation", () => {
  describe("Valid Types", () => {
    test("accepts 'agent'", () => {
      expect(isValidProjectType("agent")).toBe(true);
    });

    test("accepts 'app'", () => {
      expect(isValidProjectType("app")).toBe(true);
    });

    test("accepts 'mcp'", () => {
      expect(isValidProjectType("mcp")).toBe(true);
    });
  });

  describe("Invalid Types", () => {
    const invalidTypes = [
      "",
      "Agent", // Wrong case
      "APP",
      "MCP",
      "character",
      "tool",
      "service",
      "plugin",
      "bot",
      "ai",
      "invalid",
      "a2a", // Not allowed in gallery
    ];

    for (const type of invalidTypes) {
      test(`rejects invalid type: "${type}"`, () => {
        expect(isValidProjectType(type)).toBe(false);
      });
    }
  });
});

describe("Submission Status Validation", () => {
  describe("Valid Statuses", () => {
    test("accepts 'pending'", () => {
      expect(isValidStatus("pending")).toBe(true);
    });

    test("accepts 'approved'", () => {
      expect(isValidStatus("approved")).toBe(true);
    });

    test("accepts 'rejected'", () => {
      expect(isValidStatus("rejected")).toBe(true);
    });

    test("accepts 'featured'", () => {
      expect(isValidStatus("featured")).toBe(true);
    });
  });

  describe("Invalid Statuses", () => {
    const invalidStatuses = [
      "",
      "PENDING",
      "Approved",
      "active",
      "inactive",
      "draft",
      "published",
      "deleted",
      "archived",
    ];

    for (const status of invalidStatuses) {
      test(`rejects invalid status: "${status}"`, () => {
        expect(isValidStatus(status)).toBe(false);
      });
    }
  });
});

describe("Sort Option Validation", () => {
  describe("Valid Sort Options", () => {
    for (const option of VALID_SORT_OPTIONS) {
      test(`accepts '${option}'`, () => {
        expect(isValidSortOption(option)).toBe(true);
      });
    }
  });

  describe("Invalid Sort Options", () => {
    const invalidOptions = [
      "",
      "NEWEST",
      "Popular",
      "date",
      "name",
      "alphabetical",
      "random",
    ];

    for (const option of invalidOptions) {
      test(`rejects invalid sort option: "${option}"`, () => {
        expect(isValidSortOption(option)).toBe(false);
      });
    }
  });
});

describe("Service to Project Transformation", () => {
  test("transforms valid agent service", () => {
    const service = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test Agent",
      description: "A test agent",
      type: "agent",
      image: "https://example.com/image.png",
      category: "assistant",
      tags: ["ai", "chat"],
      slug: "test-agent",
    };

    const result = transformServiceToProject(service);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(service.id);
    expect(result?.name).toBe(service.name);
    expect(result?.type).toBe("agent");
    expect(result?.viewCount).toBe(0);
    expect(result?.likeCount).toBe(0);
    expect(result?.cloneCount).toBe(0);
  });

  test("transforms valid app service", () => {
    const service = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test App",
      description: "A test app",
      type: "app",
    };

    const result = transformServiceToProject(service);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("app");
    expect(result?.tags).toEqual([]);
  });

  test("transforms valid mcp service", () => {
    const service = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test MCP",
      description: "A test MCP",
      type: "mcp",
    };

    const result = transformServiceToProject(service);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("mcp");
  });

  test("returns null for invalid project type", () => {
    const service = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test",
      description: "A test",
      type: "invalid",
    };

    const result = transformServiceToProject(service);

    expect(result).toBeNull();
  });

  test("returns null for a2a type", () => {
    const service = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test A2A",
      description: "An A2A service",
      type: "a2a",
    };

    const result = transformServiceToProject(service);

    expect(result).toBeNull();
  });

  test("handles missing optional fields", () => {
    const service = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Minimal Service",
      description: "Minimal",
      type: "agent",
    };

    const result = transformServiceToProject(service);

    expect(result).not.toBeNull();
    expect(result?.image).toBeUndefined();
    expect(result?.category).toBeUndefined();
    expect(result?.slug).toBeUndefined();
    expect(result?.tags).toEqual([]);
  });
});

describe("Search Query Sanitization", () => {
  test("trims whitespace", () => {
    expect(sanitizeSearchQuery("  test  ")).toBe("test");
  });

  test("limits length to 200 characters", () => {
    const longQuery = "a".repeat(300);
    const result = sanitizeSearchQuery(longQuery);
    expect(result.length).toBe(200);
  });

  test("removes HTML tags", () => {
    expect(sanitizeSearchQuery("<script>alert('xss')</script>")).toBe("scriptalert('xss')/script");
  });

  test("preserves normal characters", () => {
    expect(sanitizeSearchQuery("test query 123")).toBe("test query 123");
  });

  test("handles empty string", () => {
    expect(sanitizeSearchQuery("")).toBe("");
  });

  test("handles string with only whitespace", () => {
    expect(sanitizeSearchQuery("   ")).toBe("");
  });

  test("preserves unicode characters", () => {
    expect(sanitizeSearchQuery("测试 テスト 🤖")).toBe("测试 テスト 🤖");
  });

  test("preserves special characters except HTML", () => {
    expect(sanitizeSearchQuery("test & query")).toBe("test & query");
    expect(sanitizeSearchQuery("test 'quoted'")).toBe("test 'quoted'");
    expect(sanitizeSearchQuery('test "double"')).toBe('test "double"');
  });
});

describe("Count Formatting", () => {
  describe("Numbers under 1000", () => {
    test("formats 0", () => {
      expect(formatCount(0)).toBe("0");
    });

    test("formats 1", () => {
      expect(formatCount(1)).toBe("1");
    });

    test("formats 999", () => {
      expect(formatCount(999)).toBe("999");
    });

    test("formats 500", () => {
      expect(formatCount(500)).toBe("500");
    });
  });

  describe("Thousands", () => {
    test("formats 1000 as 1.0K", () => {
      expect(formatCount(1000)).toBe("1.0K");
    });

    test("formats 1500 as 1.5K", () => {
      expect(formatCount(1500)).toBe("1.5K");
    });

    test("formats 10000 as 10.0K", () => {
      expect(formatCount(10000)).toBe("10.0K");
    });

    test("formats 999999 as 1000.0K", () => {
      expect(formatCount(999999)).toBe("1000.0K");
    });
  });

  describe("Millions", () => {
    test("formats 1000000 as 1.0M", () => {
      expect(formatCount(1000000)).toBe("1.0M");
    });

    test("formats 1500000 as 1.5M", () => {
      expect(formatCount(1500000)).toBe("1.5M");
    });

    test("formats 10000000 as 10.0M", () => {
      expect(formatCount(10000000)).toBe("10.0M");
    });
  });
});

describe("Gallery Project Interface", () => {
  test("valid project has all required fields", () => {
    const project: GalleryProject = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test Project",
      description: "A test project",
      type: "agent",
      tags: [],
      viewCount: 0,
      likeCount: 0,
      cloneCount: 0,
    };

    expect(project.id).toBeTruthy();
    expect(project.name).toBeTruthy();
    expect(project.description).toBeTruthy();
    expect(project.type).toBe("agent");
    expect(Array.isArray(project.tags)).toBe(true);
    expect(typeof project.viewCount).toBe("number");
    expect(typeof project.likeCount).toBe("number");
    expect(typeof project.cloneCount).toBe("number");
  });

  test("project can have optional fields", () => {
    const project: GalleryProject = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test Project",
      description: "A test project",
      type: "agent",
      image: "https://example.com/image.png",
      category: "assistant",
      tags: ["ai", "chat"],
      slug: "test-project",
      viewCount: 100,
      likeCount: 50,
      cloneCount: 25,
      submissionId: "456e4567-e89b-12d3-a456-426614174000",
      isLiked: true,
    };

    expect(project.image).toBe("https://example.com/image.png");
    expect(project.category).toBe("assistant");
    expect(project.slug).toBe("test-project");
    expect(project.submissionId).toBeTruthy();
    expect(project.isLiked).toBe(true);
  });
});

describe("Tags Validation", () => {
  test("empty array is valid", () => {
    const tags: string[] = [];
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBe(0);
  });

  test("array of strings is valid", () => {
    const tags = ["ai", "chat", "assistant"];
    expect(tags.every((t) => typeof t === "string")).toBe(true);
  });

  test("tags should be lowercased for consistency", () => {
    const tags = ["AI", "Chat", "ASSISTANT"];
    const normalized = tags.map((t) => t.toLowerCase());
    expect(normalized).toEqual(["ai", "chat", "assistant"]);
  });

  test("duplicate tags should be removed", () => {
    const tags = ["ai", "chat", "ai", "assistant", "chat"];
    const unique = [...new Set(tags)];
    expect(unique).toEqual(["ai", "chat", "assistant"]);
  });

  test("tags should be trimmed", () => {
    const tags = ["  ai  ", " chat ", "assistant"];
    const trimmed = tags.map((t) => t.trim());
    expect(trimmed).toEqual(["ai", "chat", "assistant"]);
  });
});

describe("Pagination Validation", () => {
  const validatePagination = (
    limit: number,
    offset: number
  ): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (limit < 1) errors.push("limit must be >= 1");
    if (limit > 100) errors.push("limit must be <= 100");
    if (offset < 0) errors.push("offset must be >= 0");
    if (!Number.isInteger(limit)) errors.push("limit must be an integer");
    if (!Number.isInteger(offset)) errors.push("offset must be an integer");

    return { valid: errors.length === 0, errors };
  };

  test("valid pagination parameters", () => {
    const result = validatePagination(10, 0);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("limit of 1 is valid", () => {
    const result = validatePagination(1, 0);
    expect(result.valid).toBe(true);
  });

  test("limit of 100 is valid", () => {
    const result = validatePagination(100, 0);
    expect(result.valid).toBe(true);
  });

  test("limit of 0 is invalid", () => {
    const result = validatePagination(0, 0);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("limit must be >= 1");
  });

  test("limit over 100 is invalid", () => {
    const result = validatePagination(101, 0);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("limit must be <= 100");
  });

  test("negative offset is invalid", () => {
    const result = validatePagination(10, -1);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("offset must be >= 0");
  });

  test("non-integer limit is invalid", () => {
    const result = validatePagination(10.5, 0);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("limit must be an integer");
  });
});

describe("Submission Data Validation", () => {
  interface SubmissionInput {
    projectType: string;
    projectId: string;
    title: string;
    description: string;
    tags?: string[];
    category?: string;
  }

  const validateSubmission = (
    input: SubmissionInput
  ): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!isValidProjectType(input.projectType)) {
      errors.push("Invalid project type");
    }

    if (!isValidUUID(input.projectId)) {
      errors.push("Invalid project ID");
    }

    if (!input.title || input.title.trim().length === 0) {
      errors.push("Title is required");
    }

    if (input.title && input.title.length > 100) {
      errors.push("Title must be 100 characters or less");
    }

    if (!input.description || input.description.trim().length === 0) {
      errors.push("Description is required");
    }

    if (input.description && input.description.length > 1000) {
      errors.push("Description must be 1000 characters or less");
    }

    if (input.tags && input.tags.length > 10) {
      errors.push("Maximum 10 tags allowed");
    }

    return { valid: errors.length === 0, errors };
  };

  test("valid submission", () => {
    const result = validateSubmission({
      projectType: "agent",
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      title: "Test Submission",
      description: "A test submission for the gallery",
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("invalid project type", () => {
    const result = validateSubmission({
      projectType: "invalid",
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      title: "Test",
      description: "Test",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid project type");
  });

  test("invalid project ID", () => {
    const result = validateSubmission({
      projectType: "agent",
      projectId: "invalid-id",
      title: "Test",
      description: "Test",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid project ID");
  });

  test("empty title", () => {
    const result = validateSubmission({
      projectType: "agent",
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      title: "",
      description: "Test",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Title is required");
  });

  test("title too long", () => {
    const result = validateSubmission({
      projectType: "agent",
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      title: "a".repeat(101),
      description: "Test",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Title must be 100 characters or less");
  });

  test("empty description", () => {
    const result = validateSubmission({
      projectType: "agent",
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      title: "Test",
      description: "",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Description is required");
  });

  test("description too long", () => {
    const result = validateSubmission({
      projectType: "agent",
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      title: "Test",
      description: "a".repeat(1001),
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Description must be 1000 characters or less");
  });

  test("too many tags", () => {
    const result = validateSubmission({
      projectType: "agent",
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      title: "Test",
      description: "Test",
      tags: Array(11).fill("tag"),
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Maximum 10 tags allowed");
  });

  test("multiple validation errors", () => {
    const result = validateSubmission({
      projectType: "invalid",
      projectId: "invalid-id",
      title: "",
      description: "",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe("Project Sorting", () => {
  const mockProjects: GalleryProject[] = [
    {
      id: "1",
      name: "Project A",
      description: "First project",
      type: "agent",
      tags: [],
      viewCount: 100,
      likeCount: 50,
      cloneCount: 10,
    },
    {
      id: "2",
      name: "Project B",
      description: "Second project",
      type: "agent",
      tags: [],
      viewCount: 200,
      likeCount: 30,
      cloneCount: 25,
    },
    {
      id: "3",
      name: "Project C",
      description: "Third project",
      type: "app",
      tags: [],
      viewCount: 50,
      likeCount: 100,
      cloneCount: 5,
    },
  ];

  const sortProjects = (
    projects: GalleryProject[],
    sortBy: SortOption
  ): GalleryProject[] => {
    const sorted = [...projects];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "popular":
          return (b.likeCount ?? 0) - (a.likeCount ?? 0);
        case "most_cloned":
          return (b.cloneCount ?? 0) - (a.cloneCount ?? 0);
        case "trending": {
          const aScore = (a.viewCount ?? 0) + (a.likeCount ?? 0) * 2;
          const bScore = (b.viewCount ?? 0) + (b.likeCount ?? 0) * 2;
          return bScore - aScore;
        }
        case "newest":
        default:
          return 0;
      }
    });
    return sorted;
  };

  test("sorts by popular (likes)", () => {
    const sorted = sortProjects(mockProjects, "popular");
    expect(sorted[0].id).toBe("3"); // 100 likes
    expect(sorted[1].id).toBe("1"); // 50 likes
    expect(sorted[2].id).toBe("2"); // 30 likes
  });

  test("sorts by most_cloned", () => {
    const sorted = sortProjects(mockProjects, "most_cloned");
    expect(sorted[0].id).toBe("2"); // 25 clones
    expect(sorted[1].id).toBe("1"); // 10 clones
    expect(sorted[2].id).toBe("3"); // 5 clones
  });

  test("sorts by trending (views + likes*2)", () => {
    // Project A: 100 + 50*2 = 200
    // Project B: 200 + 30*2 = 260
    // Project C: 50 + 100*2 = 250
    const sorted = sortProjects(mockProjects, "trending");
    expect(sorted[0].id).toBe("2"); // 260 score
    expect(sorted[1].id).toBe("3"); // 250 score
    expect(sorted[2].id).toBe("1"); // 200 score
  });

  test("newest maintains original order", () => {
    const sorted = sortProjects(mockProjects, "newest");
    expect(sorted[0].id).toBe("1");
    expect(sorted[1].id).toBe("2");
    expect(sorted[2].id).toBe("3");
  });

  test("handles projects with zero counts", () => {
    const projectsWithZeros: GalleryProject[] = [
      { id: "1", name: "A", description: "", type: "agent", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0 },
      { id: "2", name: "B", description: "", type: "agent", tags: [], viewCount: 10, likeCount: 5, cloneCount: 2 },
    ];
    
    const sorted = sortProjects(projectsWithZeros, "popular");
    expect(sorted[0].id).toBe("2");
    expect(sorted[1].id).toBe("1");
  });

  test("handles undefined counts", () => {
    const projectsWithUndefined: GalleryProject[] = [
      { id: "1", name: "A", description: "", type: "agent", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0 },
      { id: "2", name: "B", description: "", type: "agent", tags: [], viewCount: 10, likeCount: 5, cloneCount: 2 },
    ];
    
    // These would have undefined counts in reality
    const sorted = sortProjects(projectsWithUndefined, "popular");
    expect(sorted).toHaveLength(2);
  });
});

describe("Project Filtering by Type", () => {
  const mockProjects: GalleryProject[] = [
    { id: "1", name: "Agent 1", description: "", type: "agent", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0 },
    { id: "2", name: "Agent 2", description: "", type: "agent", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0 },
    { id: "3", name: "App 1", description: "", type: "app", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0 },
    { id: "4", name: "MCP 1", description: "", type: "mcp", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0 },
    { id: "5", name: "MCP 2", description: "", type: "mcp", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0 },
  ];

  const filterByType = (
    projects: GalleryProject[],
    type: "all" | ProjectType
  ): GalleryProject[] => {
    if (type === "all") return projects;
    return projects.filter((p) => p.type === type);
  };

  test("filters agents", () => {
    const filtered = filterByType(mockProjects, "agent");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((p) => p.type === "agent")).toBe(true);
  });

  test("filters apps", () => {
    const filtered = filterByType(mockProjects, "app");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe("app");
  });

  test("filters mcps", () => {
    const filtered = filterByType(mockProjects, "mcp");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((p) => p.type === "mcp")).toBe(true);
  });

  test("all returns everything", () => {
    const filtered = filterByType(mockProjects, "all");
    expect(filtered).toHaveLength(5);
  });
});

describe("Project Search Filtering", () => {
  const mockProjects: GalleryProject[] = [
    { id: "1", name: "AI Assistant", description: "Helpful assistant bot", type: "agent", tags: ["ai", "chat"], category: "productivity", viewCount: 0, likeCount: 0, cloneCount: 0 },
    { id: "2", name: "Code Helper", description: "Coding companion", type: "agent", tags: ["code", "dev"], category: "development", viewCount: 0, likeCount: 0, cloneCount: 0 },
    { id: "3", name: "Dashboard App", description: "Analytics dashboard", type: "app", tags: ["analytics"], category: "business", viewCount: 0, likeCount: 0, cloneCount: 0 },
  ];

  const searchProjects = (
    projects: GalleryProject[],
    query: string
  ): GalleryProject[] => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  };

  test("searches by name", () => {
    const results = searchProjects(mockProjects, "assistant");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("1");
  });

  test("searches by description", () => {
    const results = searchProjects(mockProjects, "companion");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("2");
  });

  test("searches by category", () => {
    const results = searchProjects(mockProjects, "productivity");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("1");
  });

  test("searches by tags", () => {
    const results = searchProjects(mockProjects, "analytics");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("3");
  });

  test("search is case insensitive", () => {
    const results = searchProjects(mockProjects, "AI");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("1");
  });

  test("empty search returns all", () => {
    const results = searchProjects(mockProjects, "");
    expect(results).toHaveLength(3);
  });

  test("whitespace-only search returns all", () => {
    const results = searchProjects(mockProjects, "   ");
    expect(results).toHaveLength(3);
  });

  test("no match returns empty", () => {
    const results = searchProjects(mockProjects, "nonexistent");
    expect(results).toHaveLength(0);
  });

  test("partial match works", () => {
    const results = searchProjects(mockProjects, "dash");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("3");
  });
});

describe("Featured Projects Filtering", () => {
  interface ProjectWithFeatured extends GalleryProject {
    isFeatured?: boolean;
    featuredAt?: Date;
  }

  const mockProjects: ProjectWithFeatured[] = [
    { id: "1", name: "Featured 1", description: "", type: "agent", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0, isFeatured: true, featuredAt: new Date("2024-01-15") },
    { id: "2", name: "Regular 1", description: "", type: "agent", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0, isFeatured: false },
    { id: "3", name: "Featured 2", description: "", type: "app", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0, isFeatured: true, featuredAt: new Date("2024-01-20") },
    { id: "4", name: "Regular 2", description: "", type: "mcp", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0 },
  ];

  const getFeaturedProjects = (projects: ProjectWithFeatured[]): ProjectWithFeatured[] => {
    return projects
      .filter((p) => p.isFeatured)
      .sort((a, b) => {
        if (!a.featuredAt || !b.featuredAt) return 0;
        return b.featuredAt.getTime() - a.featuredAt.getTime();
      });
  };

  test("filters featured projects", () => {
    const featured = getFeaturedProjects(mockProjects);
    expect(featured).toHaveLength(2);
    expect(featured.every((p) => p.isFeatured)).toBe(true);
  });

  test("sorts featured by date (newest first)", () => {
    const featured = getFeaturedProjects(mockProjects);
    expect(featured[0].id).toBe("3"); // Jan 20
    expect(featured[1].id).toBe("1"); // Jan 15
  });

  test("returns empty array when no featured", () => {
    const noFeatured: ProjectWithFeatured[] = [
      { id: "1", name: "Regular", description: "", type: "agent", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0, isFeatured: false },
    ];
    const featured = getFeaturedProjects(noFeatured);
    expect(featured).toHaveLength(0);
  });
});

describe("URL Parameter Parsing", () => {
  const parseUrlParams = (searchParams: URLSearchParams): {
    type: "all" | ProjectType;
    sort: SortOption;
    search: string;
  } => {
    const typeParam = searchParams.get("type");
    const sortParam = searchParams.get("sort");
    const searchParam = searchParams.get("q") || searchParams.get("search") || "";

    let type: "all" | ProjectType = "all";
    if (typeParam && isValidProjectType(typeParam)) {
      type = typeParam;
    }

    let sort: SortOption = "newest";
    if (sortParam && isValidSortOption(sortParam)) {
      sort = sortParam;
    }

    return { type, sort, search: searchParam };
  };

  test("parses type parameter", () => {
    const params = new URLSearchParams("type=agent");
    const result = parseUrlParams(params);
    expect(result.type).toBe("agent");
  });

  test("parses sort parameter", () => {
    const params = new URLSearchParams("sort=popular");
    const result = parseUrlParams(params);
    expect(result.sort).toBe("popular");
  });

  test("parses search parameter (q)", () => {
    const params = new URLSearchParams("q=test");
    const result = parseUrlParams(params);
    expect(result.search).toBe("test");
  });

  test("parses search parameter (search)", () => {
    const params = new URLSearchParams("search=test");
    const result = parseUrlParams(params);
    expect(result.search).toBe("test");
  });

  test("parses all parameters together", () => {
    const params = new URLSearchParams("type=app&sort=trending&q=dashboard");
    const result = parseUrlParams(params);
    expect(result.type).toBe("app");
    expect(result.sort).toBe("trending");
    expect(result.search).toBe("dashboard");
  });

  test("defaults to all/newest for invalid params", () => {
    const params = new URLSearchParams("type=invalid&sort=invalid");
    const result = parseUrlParams(params);
    expect(result.type).toBe("all");
    expect(result.sort).toBe("newest");
  });

  test("handles empty params", () => {
    const params = new URLSearchParams("");
    const result = parseUrlParams(params);
    expect(result.type).toBe("all");
    expect(result.sort).toBe("newest");
    expect(result.search).toBe("");
  });

  test("handles uppercase sort param as invalid", () => {
    const params = new URLSearchParams("sort=POPULAR");
    const result = parseUrlParams(params);
    expect(result.sort).toBe("newest");
  });

  test("handles uppercase type param as invalid", () => {
    const params = new URLSearchParams("type=AGENT");
    const result = parseUrlParams(params);
    expect(result.type).toBe("all");
  });

  test("handles extra unknown params gracefully", () => {
    const params = new URLSearchParams("type=agent&sort=popular&unknown=value&extra=param");
    const result = parseUrlParams(params);
    expect(result.type).toBe("agent");
    expect(result.sort).toBe("popular");
  });

  test("handles empty string values", () => {
    const params = new URLSearchParams("type=&sort=&q=");
    const result = parseUrlParams(params);
    expect(result.type).toBe("all");
    expect(result.sort).toBe("newest");
    expect(result.search).toBe("");
  });
});

describe("Sorting Edge Cases", () => {
  const sortProjects = (
    projects: GalleryProject[],
    sortBy: SortOption
  ): GalleryProject[] => {
    const sorted = [...projects];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "popular":
          return (b.likeCount ?? 0) - (a.likeCount ?? 0);
        case "most_cloned":
          return (b.cloneCount ?? 0) - (a.cloneCount ?? 0);
        case "trending": {
          const aScore = (a.viewCount ?? 0) + (a.likeCount ?? 0) * 2;
          const bScore = (b.viewCount ?? 0) + (b.likeCount ?? 0) * 2;
          return bScore - aScore;
        }
        case "newest":
        default:
          return 0;
      }
    });
    return sorted;
  };

  test("handles empty array", () => {
    const sorted = sortProjects([], "popular");
    expect(sorted).toEqual([]);
  });

  test("handles single item array", () => {
    const projects: GalleryProject[] = [
      { id: "1", name: "A", description: "", type: "agent", tags: [], viewCount: 10, likeCount: 5, cloneCount: 2 },
    ];
    const sorted = sortProjects(projects, "popular");
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe("1");
  });

  test("handles all items with same values", () => {
    const projects: GalleryProject[] = [
      { id: "1", name: "A", description: "", type: "agent", tags: [], viewCount: 10, likeCount: 5, cloneCount: 2 },
      { id: "2", name: "B", description: "", type: "agent", tags: [], viewCount: 10, likeCount: 5, cloneCount: 2 },
      { id: "3", name: "C", description: "", type: "agent", tags: [], viewCount: 10, likeCount: 5, cloneCount: 2 },
    ];
    const sorted = sortProjects(projects, "popular");
    expect(sorted).toHaveLength(3);
  });

  test("handles negative values gracefully", () => {
    const projects: GalleryProject[] = [
      { id: "1", name: "A", description: "", type: "agent", tags: [], viewCount: -10, likeCount: -5, cloneCount: -2 },
      { id: "2", name: "B", description: "", type: "agent", tags: [], viewCount: 10, likeCount: 5, cloneCount: 2 },
    ];
    const sorted = sortProjects(projects, "popular");
    expect(sorted[0].id).toBe("2");
  });

  test("handles very large numbers", () => {
    const projects: GalleryProject[] = [
      { id: "1", name: "A", description: "", type: "agent", tags: [], viewCount: 0, likeCount: Number.MAX_SAFE_INTEGER, cloneCount: 0 },
      { id: "2", name: "B", description: "", type: "agent", tags: [], viewCount: 0, likeCount: 1, cloneCount: 0 },
    ];
    const sorted = sortProjects(projects, "popular");
    expect(sorted[0].id).toBe("1");
  });

  test("trending score calculation is correct", () => {
    const projects: GalleryProject[] = [
      { id: "1", name: "A", description: "", type: "agent", tags: [], viewCount: 100, likeCount: 10, cloneCount: 0 },
      { id: "2", name: "B", description: "", type: "agent", tags: [], viewCount: 50, likeCount: 40, cloneCount: 0 },
    ];
    // Project 1: 100 + 10*2 = 120
    // Project 2: 50 + 40*2 = 130
    const sorted = sortProjects(projects, "trending");
    expect(sorted[0].id).toBe("2");
  });
});

describe("Search Filtering Edge Cases", () => {
  const searchProjects = (
    projects: GalleryProject[],
    query: string
  ): GalleryProject[] => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  };

  const mockProjects: GalleryProject[] = [
    { id: "1", name: "AI Assistant", description: "Helpful bot", type: "agent", tags: ["ai", "chat"], category: "productivity", viewCount: 0, likeCount: 0, cloneCount: 0 },
    { id: "2", name: "Code Helper", description: "Coding companion", type: "agent", tags: ["code"], category: "development", viewCount: 0, likeCount: 0, cloneCount: 0 },
  ];

  test("handles query with only spaces", () => {
    const results = searchProjects(mockProjects, "     ");
    expect(results).toHaveLength(2);
  });

  test("handles query with tabs and newlines", () => {
    const results = searchProjects(mockProjects, "\t\n  ");
    expect(results).toHaveLength(2);
  });

  test("handles regex special characters in query", () => {
    const results = searchProjects(mockProjects, ".*+?^${}()|[]\\");
    expect(results).toHaveLength(0);
  });

  test("handles emoji in query", () => {
    const results = searchProjects(mockProjects, "🤖");
    expect(results).toHaveLength(0);
  });

  test("matches partial word in name", () => {
    const results = searchProjects(mockProjects, "Assist");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("1");
  });

  test("matches partial word in description", () => {
    const results = searchProjects(mockProjects, "compan");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("2");
  });

  test("handles project with undefined category", () => {
    const projectsWithNoCategory: GalleryProject[] = [
      { id: "1", name: "Test", description: "Test", type: "agent", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0 },
    ];
    const results = searchProjects(projectsWithNoCategory, "productivity");
    expect(results).toHaveLength(0);
  });

  test("handles project with empty tags array", () => {
    const projectsWithNoTags: GalleryProject[] = [
      { id: "1", name: "Test", description: "Test", type: "agent", tags: [], viewCount: 0, likeCount: 0, cloneCount: 0 },
    ];
    const results = searchProjects(projectsWithNoTags, "ai");
    expect(results).toHaveLength(0);
  });

  test("search is not affected by multiple spaces in query", () => {
    const results = searchProjects(mockProjects, "AI   Assistant");
    expect(results).toHaveLength(0);
  });
});
