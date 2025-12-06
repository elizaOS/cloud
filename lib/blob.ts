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
 * Check if a URL is from Fal.ai CDN (should be proxied through our storage)
 */
export function isFalAiUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname.includes("fal.media") ||
      urlObj.hostname.includes("fal.ai")
    );
  } catch {
    return false;
  }
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
 * Ensure a URL is from our storage, not Fal.ai.
 * If the URL is from Fal.ai, download and upload it to our storage.
 * Returns our storage URL or the original URL if it's already ours or upload fails.
 */
export async function ensureElizaCloudUrl(
  sourceUrl: string,
  options: BlobUploadOptions & { fallbackToOriginal?: boolean },
): Promise<string> {
  // If it's not a Fal.ai URL, return as-is
  if (!isFalAiUrl(sourceUrl)) {
    return sourceUrl;
  }

  // It's a Fal.ai URL - download and upload to our storage
  try {
    const result = await uploadFromUrl(sourceUrl, options);
    return result.url;
  } catch (error) {
    console.error(
      "[ensureElizaCloudUrl] Failed to upload Fal.ai URL to our storage:",
      error,
    );

    // If fallback is allowed, return original URL
    if (options.fallbackToOriginal !== false) {
      console.warn("[ensureElizaCloudUrl] Falling back to original Fal.ai URL");
      return sourceUrl;
    }

    // Otherwise, throw the error
    throw error;
  }
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
