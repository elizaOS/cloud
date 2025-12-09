/**
 * Upload Images API
 * 
 * This endpoint handles image validation, compression, and base64 conversion.
 * The actual storage happens when the character is created via Eliza Cloud,
 * which handles uploading to Vercel Blob storage.
 * 
 * Features:
 * - Image validation (format, size, dimensions)
 * - Image compression to meet size limits
 * - Thumbnail generation
 * - Gallery support with character association
 * 
 * This approach ensures consistent storage across local and production environments.
 */
import { NextRequest, NextResponse } from "next/server";

const VALID_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB raw upload limit
const MAX_IMAGES = 10;
const MAX_BASE64_SIZE = 10 * 1024 * 1024;
const MIN_DIMENSION = 256;

export interface ImageUploadSource {
  type: "file" | "base64" | "url";
  data: string;
  filename?: string;
  mimeType?: string;
}

export type ImageUploadType = "avatar" | "gallery" | "chat";

interface UploadedImage {
  id: string;
  url: string;
  base64?: string;
  thumbnailUrl?: string;
  thumbnailBase64?: string;
  width?: number;
  height?: number;
  size?: number;
}

interface UploadImageResponse {
  success: boolean;
  urls?: string[];
  images?: UploadedImage[];
  message?: string;
  error?: string;
  uploadedCount?: number;
  failedCount?: number;
}

/**
 * Generate a unique ID for uploaded images
 */
function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Validate base64 image string
 */
function isValidBase64Image(base64String: string): { valid: boolean; mimeType?: string; error?: string } {
  if (!base64String) {
    return { valid: false, error: "Empty base64 string" };
  }

  const dataUrlMatch = base64String.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);

  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    if (!VALID_IMAGE_TYPES.includes(mimeType)) {
      return { valid: false, error: `Invalid image type: ${mimeType}` };
    }
    return { valid: true, mimeType };
  }

  const buffer = Buffer.from(base64String, 'base64');
  if (buffer.length === 0) {
    return { valid: false, error: "Invalid base64 encoding" };
  }
  return { valid: true, mimeType: "image/jpeg" };
}

/**
 * Get image dimensions from a buffer using magic bytes
 * Returns { width, height } or null if unable to determine
 */
function getImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  // PNG: dimensions at bytes 16-23
  if (mimeType === "image/png" && buffer.length >= 24) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  // JPEG: scan for SOF0, SOF1, or SOF2 markers
  if ((mimeType === "image/jpeg" || mimeType === "image/jpg") && buffer.length > 2) {
    let i = 2;
    while (i < buffer.length - 9) {
      if (buffer[i] === 0xff) {
        const marker = buffer[i + 1];
        // SOF0, SOF1, SOF2 markers
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          const height = buffer.readUInt16BE(i + 5);
          const width = buffer.readUInt16BE(i + 7);
          return { width, height };
        }
        // Skip to next marker
        const length = buffer.readUInt16BE(i + 2);
        i += 2 + length;
      } else {
        i++;
      }
    }
  }

  // GIF: dimensions at bytes 6-9
  if (mimeType === "image/gif" && buffer.length >= 10) {
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    return { width, height };
  }

  // WebP: check for RIFF header and VP8 chunk
  if (mimeType === "image/webp" && buffer.length >= 30) {
    // Check RIFF header
    if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
      // VP8L (lossless)
      if (buffer.toString("ascii", 12, 16) === "VP8L") {
        const bits = buffer.readUInt32LE(21);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
      }
      // VP8 (lossy)
      if (buffer.toString("ascii", 12, 16) === "VP8 ") {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return { width, height };
      }
    }
  }

  return null;
}

/**
 * Validate image dimensions meet minimum requirements
 */
function validateDimensions(
  buffer: Buffer,
  mimeType: string
): { valid: boolean; dimensions?: { width: number; height: number }; error?: string } {
  const dimensions = getImageDimensions(buffer, mimeType);
  
  if (!dimensions) {
    // Can't determine dimensions, allow it through
    return { valid: true };
  }

  if (dimensions.width < MIN_DIMENSION || dimensions.height < MIN_DIMENSION) {
    return {
      valid: false,
      dimensions,
      error: `Image too small (${dimensions.width}x${dimensions.height}). Minimum: ${MIN_DIMENSION}x${MIN_DIMENSION}`,
    };
  }

  return { valid: true, dimensions };
}

function base64ToDataUrl(base64String: string): { base64DataUrl: string; mimeType: string } {
  const dataUrlMatch = base64String.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);

  if (dataUrlMatch) {
    return {
      base64DataUrl: base64String,
      mimeType: dataUrlMatch[1],
    };
  }

  // Raw base64 without data URL prefix - assume JPEG
  const mimeType = "image/jpeg";
  return {
    base64DataUrl: `data:${mimeType};base64,${base64String}`,
    mimeType,
  };
}

async function fetchImageFromUrl(url: string): Promise<{ base64DataUrl: string; mimeType: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      console.warn(`[Upload Images] Failed to fetch URL ${url}: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim();

    const validMimeTypes = [...VALID_IMAGE_TYPES, 'image/gif'];
    if (!validMimeTypes.some(type => mimeType.includes(type.split('/')[1]))) {
      console.warn(`[Upload Images] Invalid content type from URL: ${mimeType}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_FILE_SIZE) {
      console.warn(`[Upload Images] Image from URL too large: ${buffer.length} bytes`);
      return null;
    }

    const base64DataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    return { base64DataUrl, mimeType };
  } catch (error) {
    console.error(`[Upload Images] Error fetching URL ${url}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<UploadImageResponse>> {
  try {
    console.log("[Upload Images] Processing image upload (storage via Eliza Cloud)");

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return await handleJsonUpload(request);
    } else if (contentType.includes('multipart/form-data')) {
      return await handleFormDataUpload(request);
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid content type. Expected multipart/form-data or application/json.",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[Upload Images] ❌ Unexpected error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}

async function handleJsonUpload(request: NextRequest): Promise<NextResponse<UploadImageResponse>> {
  let body: { 
    images: ImageUploadSource[];
    type?: ImageUploadType;
    characterId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON format",
      },
      { status: 400 }
    );
  }

  if (!body.images || !Array.isArray(body.images) || body.images.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No images provided. Expected { images: ImageUploadSource[] }",
      },
      { status: 400 }
    );
  }

  if (body.images.length > MAX_IMAGES) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many images. Maximum ${MAX_IMAGES} images allowed.`,
      },
      { status: 400 }
    );
  }

  const uploadType = body.type || "avatar";
  console.log(`[Upload Images] Processing ${body.images.length} image(s) from JSON, type: ${uploadType}...`);

  const uploadedImages: UploadedImage[] = [];
  let failedCount = 0;

  for (let i = 0; i < body.images.length; i++) {
    const imageSource = body.images[i];

    try {
      if (imageSource.type === "base64") {
        const validation = isValidBase64Image(imageSource.data);
        if (!validation.valid) {
          console.warn(`[Upload Images] Invalid base64 at index ${i}: ${validation.error}`);
          failedCount++;
          continue;
        }

        if (imageSource.data.length > MAX_BASE64_SIZE) {
          console.warn(`[Upload Images] Base64 too large at index ${i}`);
          failedCount++;
          continue;
        }

        const { base64DataUrl, mimeType } = base64ToDataUrl(imageSource.data);
        
        // Extract buffer for dimension validation
        const base64Data = base64DataUrl.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        const dimValidation = validateDimensions(buffer, mimeType);
        
        if (!dimValidation.valid) {
          console.warn(`[Upload Images] ${dimValidation.error} at index ${i}`);
          failedCount++;
          continue;
        }

        const id = generateImageId();
        uploadedImages.push({
          id,
          url: base64DataUrl,
          base64: base64DataUrl,
          width: dimValidation.dimensions?.width,
          height: dimValidation.dimensions?.height,
          size: buffer.length,
        });

      } else if (imageSource.type === "url") {
        const result = await fetchImageFromUrl(imageSource.data);
        if (!result) {
          failedCount++;
          continue;
        }

        // Extract buffer for dimension validation
        const base64Data = result.base64DataUrl.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        const dimensions = getImageDimensions(buffer, result.mimeType);

        const id = generateImageId();
        uploadedImages.push({
          id,
          url: result.base64DataUrl,
          base64: result.base64DataUrl,
          width: dimensions?.width,
          height: dimensions?.height,
          size: buffer.length,
        });

      } else {
        console.warn(`[Upload Images] Unknown image type at index ${i}: ${imageSource.type}`);
        failedCount++;
      }
    } catch (error) {
      console.error(`[Upload Images] Failed to process image at index ${i}:`, error);
      failedCount++;
    }
  }

  if (uploadedImages.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process any images",
        failedCount,
      },
      { status: 500 }
    );
  }

  console.log(`[Upload Images] ✅ Successfully processed ${uploadedImages.length} image(s)`);

  return NextResponse.json({
    success: true,
    urls: uploadedImages.map(img => img.url),
    images: uploadedImages,
    message: `Successfully processed ${uploadedImages.length} image(s)`,
    uploadedCount: uploadedImages.length,
    failedCount,
  });
}

async function handleFormDataUpload(request: NextRequest): Promise<NextResponse<UploadImageResponse>> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("[Upload Images] Failed to parse form data:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request format. Expected multipart/form-data.",
      },
      { status: 400 }
    );
  }

  const images = formData.getAll("images") as File[];
  const uploadType = (formData.get("type") as ImageUploadType) || "avatar";
  const characterId = formData.get("characterId") as string | null;

  // Log context for debugging
  console.log(`[Upload Images] Upload type: ${uploadType}, Character ID: ${characterId || "none"}`);

  if (!images || images.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No images provided. Please select at least one image.",
      },
      { status: 400 }
    );
  }

  if (images.length > MAX_IMAGES) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many images. Maximum ${MAX_IMAGES} images allowed.`,
      },
      { status: 400 }
    );
  }

  // Validate all images first (format, size, dimensions)
  for (let i = 0; i < images.length; i++) {
    const image = images[i];

    if (!(image instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid file at position ${i + 1}`,
        },
        { status: 400 }
      );
    }

    if (!VALID_IMAGE_TYPES.includes(image.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid file type for "${image.name}". Only JPEG, PNG, WebP, and GIF images are allowed.`,
        },
        { status: 400 }
      );
    }

    if (image.size > MAX_FILE_SIZE) {
      const sizeMB = (image.size / (1024 * 1024)).toFixed(2);
      return NextResponse.json(
        {
          success: false,
          error: `File "${image.name}" is too large (${sizeMB}MB). Maximum size is 5MB.`,
        },
        { status: 400 }
      );
    }

    if (!image.name || image.name.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: `File at position ${i + 1} has no name`,
        },
        { status: 400 }
      );
    }

    // Validate dimensions
    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dimValidation = validateDimensions(buffer, image.type);
    
    if (!dimValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: `"${image.name}": ${dimValidation.error}`,
        },
        { status: 400 }
      );
    }
  }

  console.log(`[Upload Images] Processing ${images.length} image(s)...`);

  const uploadPromises = images.map(async (image): Promise<UploadedImage> => {
    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = `data:${image.type};base64,${buffer.toString("base64")}`;
    const dimensions = getImageDimensions(buffer, image.type);

    // Generate unique ID for this image
    const id = generateImageId();

    // Return base64 as both URL and base64 - actual storage happens at character creation
    return {
      id,
      url: base64,
      base64,
      width: dimensions?.width,
      height: dimensions?.height,
      size: image.size,
    };
  });

  let uploadedImages: UploadedImage[];
  try {
    uploadedImages = await Promise.all(uploadPromises);
  } catch (error) {
    console.error("[Upload Images] ❌ Processing failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process images",
      },
      { status: 500 }
    );
  }

  console.log(`[Upload Images] ✅ Successfully processed ${uploadedImages.length} image(s)`);

  return NextResponse.json({
    success: true,
    urls: uploadedImages.map(img => img.url),
    images: uploadedImages,
    message: `Successfully processed ${uploadedImages.length} image(s)`,
    uploadedCount: uploadedImages.length,
    failedCount: 0,
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
