/**
 * Client-side API module.
 *
 * This module provides typed functions for calling API routes from client components.
 * It replaces the "use server" server actions with client-side fetch calls.
 */

import { api, ApiError } from "./mobile-client";

// ============================================================================
// Types
// ============================================================================

export interface DashboardAgentStats {
  roomCount: number;
  messageCount: number;
  deploymentStatus: string;
  lastActiveAt: Date | null;
}

export interface DashboardData {
  user: { name: string };
  stats: {
    totalGenerations: number;
    apiCalls24h: number;
    imageGenerations: number;
    videoGenerations: number;
  };
  onboarding: {
    hasAgents: boolean;
    hasApiKey: boolean;
    hasChatHistory: boolean;
  };
  agents: Array<{
    id: string;
    name: string;
    bio: string | null;
    avatarUrl: string | null;
    category: string | null;
    isPublic: boolean;
    stats?: DashboardAgentStats;
  }>;
  containers: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    ecs_service_arn: string | null;
    load_balancer_url: string | null;
    port: number | null;
    desired_count: number | null;
    cpu: number | null;
    memory: number | null;
    last_deployed_at: Date | null;
    created_at: Date;
    error_message: string | null;
  }>;
}

export interface AnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  granularity?: "hour" | "day" | "week" | "month";
  timeRange?: "daily" | "weekly" | "monthly";
}

export interface GalleryItem {
  id: string;
  type: "image" | "video" | "audio";
  source: "generation" | "upload";
  url: string;
  thumbnailUrl?: string;
  prompt?: string;
  filename?: string;
  model?: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  dimensions?: { width?: number; height?: number; duration?: number };
  mimeType?: string;
  fileSize?: string;
}

export interface GalleryStats {
  totalImages: number;
  totalVideos: number;
  totalUploads: number;
  totalSize: number;
}

export interface CollectionSummary {
  id: string;
  name: string;
  description?: string;
  itemCount: number;
  coverImageUrl?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ElizaCharacter {
  id?: string;
  name: string;
  username?: string;
  system?: string;
  bio: string | string[];
  messageExamples?: Array<Array<Record<string, unknown>>>;
  postExamples?: string[];
  topics?: string[];
  adjectives?: string[];
  knowledge?: string[];
  plugins?: string[];
  settings?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  style?: Record<string, unknown>;
  avatarUrl?: string;
  category?: string;
  isPublic?: boolean;
}

export interface UserProfile {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  nickname: string | null;
  work_function: string | null;
  preferences: string | null;
  response_notifications: boolean;
  email_notifications: boolean;
  role: string;
  email_verified: boolean;
  wallet_address: string | null;
  wallet_chain_type: string | null;
  wallet_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    credit_balance: number;
  };
}

export interface AnonymousSession {
  id: string;
  message_count: number;
  messages_limit: number;
  messages_remaining: number;
  is_active: boolean;
  expires_at: string;
}

// ============================================================================
// Dashboard API
// ============================================================================

export const dashboardApi = {
  /**
   * Gets dashboard data for the current user's organization.
   */
  async getData(): Promise<DashboardData> {
    return api.get<DashboardData>("/api/v1/dashboard");
  },
};

// ============================================================================
// Analytics API
// ============================================================================

export const analyticsApi = {
  /**
   * Gets analytics overview for the current organization.
   */
  async getOverview(timeRange: "daily" | "weekly" | "monthly" = "daily") {
    return api.get<{ success: boolean; data: Record<string, unknown> }>(
      `/api/analytics/overview?timeRange=${timeRange}`,
    );
  },

  /**
   * Gets cost breakdown by dimension.
   */
  async getBreakdown(options: {
    dimension?: "model" | "provider" | "user" | "apiKey";
    sortBy?: "cost" | "requests" | "tokens";
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}) {
    const params = new URLSearchParams();
    if (options.dimension) params.set("dimension", options.dimension);
    if (options.sortBy) params.set("sortBy", options.sortBy);
    if (options.startDate) params.set("startDate", options.startDate.toISOString());
    if (options.endDate) params.set("endDate", options.endDate.toISOString());
    if (options.limit) params.set("limit", String(options.limit));
    if (options.offset) params.set("offset", String(options.offset));

    return api.get<{ success: boolean; data: Array<Record<string, unknown>> }>(
      `/api/analytics/breakdown?${params}`,
    );
  },

  /**
   * Gets usage projections.
   */
  async getProjections(options: {
    timeRange?: "daily" | "weekly" | "monthly";
    periods?: number;
  } = {}) {
    const params = new URLSearchParams();
    if (options.timeRange) params.set("timeRange", options.timeRange);
    if (options.periods) params.set("periods", String(options.periods));

    return api.get<{ success: boolean; data: Record<string, unknown> }>(
      `/api/analytics/projections?${params}`,
    );
  },
};

// ============================================================================
// User API
// ============================================================================

export const userApi = {
  /**
   * Gets the current user's profile.
   */
  async getProfile(): Promise<{ success: boolean; data: UserProfile }> {
    return api.get("/api/v1/user");
  },

  /**
   * Updates the current user's profile.
   */
  async updateProfile(data: {
    name?: string;
    avatar?: string;
    nickname?: string;
    work_function?: string;
    preferences?: string;
    response_notifications?: boolean;
    email_notifications?: boolean;
  }): Promise<{ success: boolean; data: Partial<UserProfile>; message?: string }> {
    return api.patch("/api/v1/user", data);
  },

  /**
   * Uploads a user avatar.
   */
  async uploadAvatar(file: File): Promise<{ success: boolean; data: { avatarUrl: string }; message?: string }> {
    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch("/api/v1/user/avatar", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.error ?? "Failed to upload avatar",
        response.status,
      );
    }

    return response.json();
  },

  /**
   * Updates the user's email address.
   */
  async updateEmail(email: string): Promise<{ success: boolean; message?: string }> {
    return api.patch("/api/v1/user/email", { email });
  },
};

// ============================================================================
// Gallery API
// ============================================================================

export const galleryApi = {
  /**
   * Lists gallery items.
   */
  async listItems(options: {
    type?: "image" | "video" | "audio";
    source?: "generation" | "upload";
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: GalleryItem[]; count: number; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (options.type) params.set("type", options.type);
    if (options.source) params.set("source", options.source);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.offset) params.set("offset", String(options.offset));

    return api.get(`/api/v1/gallery?${params}`);
  },

  /**
   * Gets gallery statistics.
   */
  async getStats(): Promise<{ success: boolean; data: GalleryStats }> {
    return api.get("/api/v1/gallery/stats");
  },

  /**
   * Uploads a media file to the gallery.
   */
  async upload(file: File, metadata?: { altText?: string; tags?: string }): Promise<GalleryItem> {
    const formData = new FormData();
    formData.set("file", file);
    if (metadata?.altText) formData.set("altText", metadata.altText);
    if (metadata?.tags) formData.set("tags", metadata.tags);

    const response = await fetch("/api/v1/gallery/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.error ?? "Failed to upload media",
        response.status,
      );
    }

    return response.json();
  },

  /**
   * Deletes a media item.
   */
  async delete(id: string, source?: "generation" | "upload"): Promise<{ success: boolean }> {
    const params = source ? `?source=${source}` : "";
    return api.delete(`/api/v1/gallery/${id}${params}`);
  },
};

// ============================================================================
// Collections API
// ============================================================================

export const collectionsApi = {
  /**
   * Lists all collections.
   */
  async list(options: { limit?: number; offset?: number } = {}): Promise<{
    collections: CollectionSummary[];
    count: number;
  }> {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    if (options.offset) params.set("offset", String(options.offset));

    return api.get(`/api/v1/collections?${params}`);
  },

  /**
   * Creates a new collection.
   */
  async create(data: {
    name: string;
    description?: string;
    purpose?: "advertising" | "app_assets" | "general";
  }): Promise<CollectionSummary> {
    return api.post("/api/v1/collections", data);
  },

  /**
   * Gets a collection with its items.
   */
  async get(id: string): Promise<CollectionSummary & { items: Array<Record<string, unknown>> }> {
    return api.get(`/api/v1/collections/${id}`);
  },

  /**
   * Updates a collection.
   */
  async update(id: string, data: { name?: string; description?: string }): Promise<CollectionSummary> {
    return api.patch(`/api/v1/collections/${id}`, data);
  },

  /**
   * Deletes a collection.
   */
  async delete(id: string): Promise<{ success: boolean }> {
    return api.delete(`/api/v1/collections/${id}`);
  },

  /**
   * Adds items to a collection.
   */
  async addItems(
    collectionId: string,
    items: Array<{ sourceType: "generation" | "upload"; sourceId: string }>,
  ): Promise<{ added: number }> {
    return api.post(`/api/v1/collections/${collectionId}/items`, { items });
  },

  /**
   * Removes items from a collection.
   */
  async removeItems(collectionId: string, itemIds: string[]): Promise<{ success: boolean }> {
    return api.delete(`/api/v1/collections/${collectionId}/items`, {
      body: { itemIds },
    });
  },
};

// ============================================================================
// Conversations API
// ============================================================================

export const conversationsApi = {
  /**
   * Lists all conversations for the current user.
   */
  async list(limit = 50): Promise<{ success: boolean; data: { conversations: Conversation[] } }> {
    return api.get(`/api/v1/conversations?limit=${limit}`);
  },

  /**
   * Creates a new conversation.
   */
  async create(data: { title: string; model: string }): Promise<{
    success: boolean;
    data: { conversation: Conversation };
  }> {
    return api.post("/api/v1/conversations", data);
  },

  /**
   * Gets a conversation with its messages.
   */
  async get(id: string): Promise<{
    success: boolean;
    data: { conversation: Conversation & { messages: Array<Record<string, unknown>> } };
  }> {
    return api.get(`/api/v1/conversations/${id}`);
  },

  /**
   * Updates a conversation's title.
   */
  async updateTitle(id: string, title: string): Promise<{
    success: boolean;
    data: { conversation: Conversation };
  }> {
    return api.patch(`/api/v1/conversations/${id}`, { title });
  },

  /**
   * Deletes a conversation.
   */
  async delete(id: string): Promise<{ success: boolean }> {
    return api.delete(`/api/v1/conversations/${id}`);
  },
};

// ============================================================================
// Characters API
// ============================================================================

export const charactersApi = {
  /**
   * Lists all characters for the current user.
   */
  async list(options: {
    search?: string;
    category?: string;
    sortBy?: "newest" | "name" | "updated";
    order?: "asc" | "desc";
    page?: number;
    limit?: number;
  } = {}): Promise<{
    success: boolean;
    data: {
      characters: Array<Record<string, unknown>>;
      pagination: { page: number; limit: number; totalPages: number; totalCount: number; hasMore: boolean };
    };
  }> {
    const params = new URLSearchParams();
    if (options.search) params.set("search", options.search);
    if (options.category) params.set("category", options.category);
    if (options.sortBy) params.set("sortBy", options.sortBy);
    if (options.order) params.set("order", options.order);
    if (options.page) params.set("page", String(options.page));
    if (options.limit) params.set("limit", String(options.limit));

    return api.get(`/api/my-agents/characters?${params}`);
  },

  /**
   * Gets a specific character.
   */
  async get(id: string): Promise<{ success: boolean; data: { character: ElizaCharacter } }> {
    return api.get(`/api/my-agents/characters/${id}`);
  },

  /**
   * Creates a new character.
   */
  async create(character: ElizaCharacter): Promise<{ success: boolean; data: { character: ElizaCharacter } }> {
    return api.post("/api/my-agents/characters", character as Record<string, unknown>);
  },

  /**
   * Updates an existing character.
   */
  async update(characterId: string, character: ElizaCharacter): Promise<{
    success: boolean;
    data: { character: ElizaCharacter };
  }> {
    return api.put("/api/my-agents/characters", { characterId, ...character } as Record<string, unknown>);
  },

  /**
   * Deletes a character.
   */
  async delete(id: string): Promise<{ success: boolean }> {
    return api.delete(`/api/my-agents/characters/${id}`);
  },

  /**
   * Uploads a character avatar.
   */
  async uploadAvatar(file: File): Promise<{ success: boolean; url: string }> {
    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch("/api/my-agents/characters/avatar", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.error ?? "Failed to upload avatar",
        response.status,
      );
    }

    return response.json();
  },
};

// ============================================================================
// Credits API
// ============================================================================

export const creditsApi = {
  /**
   * Gets the credit balance for the current organization.
   */
  async getBalance(fresh = false): Promise<{ balance: number }> {
    const params = fresh ? "?fresh=true" : "";
    return api.get(`/api/credits/balance${params}`);
  },
};

// ============================================================================
// Anonymous Session API
// ============================================================================

export const anonymousSessionApi = {
  /**
   * Gets the current anonymous session data.
   */
  async get(token: string): Promise<{ success: boolean; session: AnonymousSession }> {
    return api.get(`/api/anonymous-session?token=${encodeURIComponent(token)}`);
  },

  /**
   * Creates a new anonymous session (redirects to the session creation endpoint).
   */
  createUrl(returnUrl = "/"): string {
    return `/api/auth/create-anonymous-session?returnUrl=${encodeURIComponent(returnUrl)}`;
  },
};

// ============================================================================
// Re-export utilities
// ============================================================================

export { ApiError } from "./mobile-client";

