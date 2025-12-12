import { z } from "zod";
import { mediaCollectionsService } from "@/lib/services/media-collections";
import { mediaUploadsService } from "@/lib/services/media-uploads";
import type { ToolResponse, AuthResultWithOrg } from "./types";

// ============================================
// Schemas
// ============================================

const CreateCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  purpose: z.enum(["advertising", "app_assets", "general"]).optional(),
  tags: z.array(z.string()).optional(),
});

const UpdateCollectionSchema = z.object({
  collectionId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  coverImageId: z.string().uuid().optional(),
});

const CollectionIdSchema = z.object({
  collectionId: z.string().uuid(),
});

const AddItemsSchema = z.object({
  collectionId: z.string().uuid(),
  items: z.array(
    z.object({
      sourceType: z.enum(["generation", "upload"]),
      sourceId: z.string().uuid(),
    })
  ),
});

const RemoveItemsSchema = z.object({
  collectionId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()),
});

const ListCollectionsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// ============================================
// Helpers
// ============================================

function ok(data: unknown): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// ============================================
// Handlers
// ============================================

export async function handleListCollections(
  params: z.infer<typeof ListCollectionsSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const collections = await mediaCollectionsService.listByOrganization(
    auth.user.organization_id,
    {
      userId: auth.user.id,
      limit: params.limit,
      offset: params.offset,
    }
  );

  return ok({
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      itemCount: c.item_count,
      purpose: (c.metadata as Record<string, unknown>)?.purpose,
      createdAt: c.created_at.toISOString(),
    })),
    count: collections.length,
  });
}

export async function handleCreateCollection(
  params: z.infer<typeof CreateCollectionSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const collection = await mediaCollectionsService.create({
    organizationId: auth.user.organization_id,
    userId: auth.user.id,
    name: params.name,
    description: params.description,
    purpose: params.purpose,
    tags: params.tags,
  });

  return ok({
    success: true,
    collection: {
      id: collection.id,
      name: collection.name,
      description: collection.description,
    },
  });
}

export async function handleGetCollection(
  params: z.infer<typeof CollectionIdSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const isOwner = await mediaCollectionsService.validateOwnership(
    params.collectionId,
    auth.user.organization_id
  );

  if (!isOwner) {
    return ok({ error: "Collection not found" });
  }

  const collection = await mediaCollectionsService.getByIdWithItems(
    params.collectionId
  );

  if (!collection) {
    return ok({ error: "Collection not found" });
  }

  return ok({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    itemCount: collection.item_count,
    items: collection.items.map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      type: item.type,
    })),
  });
}

export async function handleUpdateCollection(
  params: z.infer<typeof UpdateCollectionSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const isOwner = await mediaCollectionsService.validateOwnership(
    params.collectionId,
    auth.user.organization_id
  );

  if (!isOwner) {
    return ok({ error: "Collection not found" });
  }

  const updated = await mediaCollectionsService.update(params.collectionId, {
    name: params.name,
    description: params.description,
    coverImageId: params.coverImageId,
  });

  return ok({
    success: true,
    collection: updated
      ? {
          id: updated.id,
          name: updated.name,
          description: updated.description,
        }
      : null,
  });
}

export async function handleDeleteCollection(
  params: z.infer<typeof CollectionIdSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const isOwner = await mediaCollectionsService.validateOwnership(
    params.collectionId,
    auth.user.organization_id
  );

  if (!isOwner) {
    return ok({ error: "Collection not found" });
  }

  await mediaCollectionsService.delete(params.collectionId);

  return ok({ success: true });
}

export async function handleAddItemsToCollection(
  params: z.infer<typeof AddItemsSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const isOwner = await mediaCollectionsService.validateOwnership(
    params.collectionId,
    auth.user.organization_id
  );

  if (!isOwner) {
    return ok({ error: "Collection not found" });
  }

  const added = await mediaCollectionsService.addItems(
    params.collectionId,
    params.items
  );

  return ok({ success: true, added });
}

export async function handleRemoveItemsFromCollection(
  params: z.infer<typeof RemoveItemsSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const isOwner = await mediaCollectionsService.validateOwnership(
    params.collectionId,
    auth.user.organization_id
  );

  if (!isOwner) {
    return ok({ error: "Collection not found" });
  }

  await mediaCollectionsService.removeItems(params.collectionId, params.itemIds);

  return ok({ success: true });
}

export async function handleListGalleryItems(
  params: {
    type?: "image" | "video" | "audio";
    source?: "generation" | "upload";
    limit?: number;
  },
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  // List uploads
  const uploads = await mediaUploadsService.listByOrganization(
    auth.user.organization_id,
    {
      userId: auth.user.id,
      type: params.type,
      limit: params.limit,
    }
  );

  return ok({
    items: uploads.map((u) => ({
      id: u.id,
      source: "upload",
      type: u.type,
      url: u.storage_url,
      thumbnailUrl: u.thumbnail_url,
      filename: u.original_filename,
      mimeType: u.mime_type,
      createdAt: u.created_at.toISOString(),
    })),
    count: uploads.length,
  });
}

// ============================================
// Tool Definitions
// ============================================

export const collectionTools = [
  {
    name: "collections_list",
    description: "List media collections for organizing generated and uploaded media.",
    inputSchema: ListCollectionsSchema,
    handler: handleListCollections,
  },
  {
    name: "collections_create",
    description:
      "Create a new media collection for organizing images/videos for ads or apps.",
    inputSchema: CreateCollectionSchema,
    handler: handleCreateCollection,
  },
  {
    name: "collections_get",
    description: "Get a collection with all its media items.",
    inputSchema: CollectionIdSchema,
    handler: handleGetCollection,
  },
  {
    name: "collections_update",
    description: "Update a collection's name, description, or cover image.",
    inputSchema: UpdateCollectionSchema,
    handler: handleUpdateCollection,
  },
  {
    name: "collections_delete",
    description: "Delete a collection (items are not deleted).",
    inputSchema: CollectionIdSchema,
    handler: handleDeleteCollection,
  },
  {
    name: "collections_add_items",
    description: "Add media items (generations or uploads) to a collection.",
    inputSchema: AddItemsSchema,
    handler: handleAddItemsToCollection,
  },
  {
    name: "collections_remove_items",
    description: "Remove items from a collection.",
    inputSchema: RemoveItemsSchema,
    handler: handleRemoveItemsFromCollection,
  },
  {
    name: "gallery_list_uploads",
    description: "List uploaded media files from the gallery.",
    inputSchema: z.object({
      type: z.enum(["image", "video", "audio"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    handler: handleListGalleryItems,
  },
];
