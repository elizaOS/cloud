import { put, del, list } from "@vercel/blob";

export interface BlobUploadOptions {
  filename: string;
  contentType?: string;
  folder?: string;
  userId?: string;
}

export interface BlobUploadResult {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
}

/**
 * Upload a file to Vercel Blob storage
 */
export async function uploadToBlob(
  content: Buffer | string,
  options: BlobUploadOptions,
): Promise<BlobUploadResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  const { filename, contentType, folder = "media", userId } = options;

  // Create a hierarchical pathname: folder/userId/timestamp-filename
  const timestamp = Date.now();
  const pathname = userId
    ? `${folder}/${userId}/${timestamp}-${filename}`
    : `${folder}/${timestamp}-${filename}`;

  const blob = await put(pathname, content, {
    access: "public",
    contentType,
    addRandomSuffix: false, // We're already adding timestamp for uniqueness
  });

  // Calculate size from the content
  const size = Buffer.isBuffer(content)
    ? content.length
    : Buffer.byteLength(content);

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType || contentType || "application/octet-stream",
    size,
  };
}

/**
 * Upload base64 image data to Vercel Blob
 */
export async function uploadBase64Image(
  base64Data: string,
  options: Omit<BlobUploadOptions, "contentType">,
): Promise<BlobUploadResult> {
  // Extract the base64 data and mime type
  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid base64 data format");
  }

  const mimeType = matches[1];
  const base64Content = matches[2];
  const buffer = Buffer.from(base64Content, "base64");

  return uploadToBlob(buffer, {
    ...options,
    contentType: mimeType,
  });
}

/**
 * Download content from a URL and upload to Vercel Blob
 */
export async function uploadFromUrl(
  sourceUrl: string,
  options: BlobUploadOptions,
): Promise<BlobUploadResult> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType =
    options.contentType || response.headers.get("content-type") || undefined;

  return uploadToBlob(buffer, {
    ...options,
    contentType,
  });
}

/**
 * Delete a blob from storage
 */
export async function deleteBlob(url: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  await del(url);
}

/**
 * List blobs with optional prefix filter
 */
export async function listBlobs(prefix?: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  return await list({
    prefix,
    limit: 1000,
  });
}

