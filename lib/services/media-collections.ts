import { logger } from "@/lib/utils/logger";
import {
  mediaCollectionsRepository,
  type MediaCollection,
  type NewMediaCollection,
  type MediaItemWithSource,
} from "@/db/repositories";

export interface CreateCollectionInput {
  organizationId: string;
  userId: string;
  name: string;
  description?: string;
  purpose?: "advertising" | "app_assets" | "general";
  tags?: string[];
}

export interface UpdateCollectionInput {
  name?: string;
  description?: string;
  coverImageId?: string;
  metadata?: {
    purpose?: "advertising" | "app_assets" | "general";
    tags?: string[];
  };
}

export interface AddItemsInput {
  items: Array<{
    sourceType: "generation" | "upload";
    sourceId: string;
  }>;
}

export interface CollectionWithItems extends MediaCollection {
  items: MediaItemWithSource[];
}

class MediaCollectionsService {
  async getById(id: string): Promise<MediaCollection | undefined> {
    return await mediaCollectionsRepository.findById(id);
  }

  async getByIdWithItems(id: string): Promise<CollectionWithItems | undefined> {
    const result = await mediaCollectionsRepository.findByIdWithItems(id);
    if (!result) return undefined;
    return { ...result.collection, items: result.items };
  }

  async listByOrganization(
    organizationId: string,
    options?: { userId?: string; limit?: number; offset?: number }
  ): Promise<MediaCollection[]> {
    return await mediaCollectionsRepository.listByOrganization(
      organizationId,
      options
    );
  }

  async create(input: CreateCollectionInput): Promise<MediaCollection> {
    logger.info("[MediaCollections] Creating collection", {
      organizationId: input.organizationId,
      name: input.name,
    });

    const data: NewMediaCollection = {
      organization_id: input.organizationId,
      user_id: input.userId,
      name: input.name,
      description: input.description,
      metadata: {
        purpose: input.purpose || "general",
        tags: input.tags || [],
      },
    };

    return await mediaCollectionsRepository.create(data);
  }

  async update(
    id: string,
    input: UpdateCollectionInput
  ): Promise<MediaCollection | undefined> {
    logger.info("[MediaCollections] Updating collection", { id });

    return await mediaCollectionsRepository.update(id, {
      name: input.name,
      description: input.description,
      cover_image_id: input.coverImageId,
      metadata: input.metadata,
    });
  }

  async delete(id: string): Promise<void> {
    logger.info("[MediaCollections] Deleting collection", { id });
    await mediaCollectionsRepository.delete(id);
  }

  async addItems(
    collectionId: string,
    items: Array<{ sourceType: "generation" | "upload"; sourceId: string }>
  ): Promise<number> {
    logger.info("[MediaCollections] Adding items to collection", {
      collectionId,
      itemCount: items.length,
    });

    const added = await mediaCollectionsRepository.addItems(collectionId, items);
    return added.length;
  }

  async removeItems(collectionId: string, itemIds: string[]): Promise<void> {
    logger.info("[MediaCollections] Removing items from collection", {
      collectionId,
      itemCount: itemIds.length,
    });

    await mediaCollectionsRepository.removeItems(collectionId, itemIds);
  }

  async getItems(collectionId: string): Promise<MediaItemWithSource[]> {
    return await mediaCollectionsRepository.listItems(collectionId);
  }

  async reorderItems(collectionId: string, itemIds: string[]): Promise<void> {
    logger.info("[MediaCollections] Reordering items in collection", {
      collectionId,
    });

    await mediaCollectionsRepository.reorderItems(collectionId, itemIds);
  }

  async setCoverImage(
    collectionId: string,
    generationId: string
  ): Promise<MediaCollection | undefined> {
    return await this.update(collectionId, { coverImageId: generationId });
  }

  async validateOwnership(
    collectionId: string,
    organizationId: string
  ): Promise<boolean> {
    const collection = await this.getById(collectionId);
    return collection?.organization_id === organizationId;
  }
}

export const mediaCollectionsService = new MediaCollectionsService();
