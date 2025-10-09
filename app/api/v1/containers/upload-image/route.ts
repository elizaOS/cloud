import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getCloudflareService } from "@/lib/services/cloudflare";
import { deductCredits } from "@/lib/queries/credits";
import { createUsageRecord } from "@/lib/queries/usage";
import { CONTAINER_PRICING } from "@/lib/constants/pricing";

export const dynamic = "force-dynamic";

// Increase body size limit for image uploads (100MB)
export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for large uploads

/**
 * POST /api/v1/containers/upload-image
 * Upload a Docker image tarball to Cloudflare
 */
export async function POST(request: NextRequest) {
  try {
    const { user, apiKey } = await requireAuthOrApiKey(request);

    // Get image name from header or query
    const imageName =
      request.headers.get("x-image-name") ||
      request.nextUrl.searchParams.get("name");

    if (!imageName) {
      return NextResponse.json(
        {
          success: false,
          error: "Image name is required (x-image-name header or ?name query param)",
        },
        { status: 400 },
      );
    }

    // Get image tarball from request body
    const imageBuffer = Buffer.from(await request.arrayBuffer());

    if (!imageBuffer || imageBuffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Image tarball is required in request body",
        },
        { status: 400 },
      );
    }

    // Validate image size (max 2GB)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (imageBuffer.length > maxSize) {
      return NextResponse.json(
        {
          success: false,
          error: `Image size exceeds maximum (${maxSize / 1024 / 1024 / 1024}GB)`,
        },
        { status: 413 },
      );
    }

    console.log(
      `📤 Uploading image ${imageName} (${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB) for organization ${user.organization_id}`,
    );

    // Deduct credits for image upload
    const uploadCost = CONTAINER_PRICING.IMAGE_UPLOAD;
    const creditResult = await deductCredits(
      user.organization_id,
      uploadCost,
      `Container image upload: ${imageName}`,
      user.id,
    );

    if (!creditResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient credits. Required: ${uploadCost}, Available: ${creditResult.newBalance}`,
          requiredCredits: uploadCost,
          availableCredits: creditResult.newBalance,
        },
        { status: 402 }, // Payment Required
      );
    }

    // Upload to Cloudflare (with error handling for refund)
    let uploadResult;
    let uploadSuccessful = false;

    try {
      const cloudflare = getCloudflareService();
      uploadResult = await cloudflare.uploadImage(imageName, imageBuffer);
      uploadSuccessful = true;
    } catch (uploadError) {
      console.error("Cloudflare upload failed:", uploadError);

      // Refund credits since upload failed
      try {
        const { addCredits } = await import("@/lib/queries/credits");
        await addCredits(
          user.organization_id,
          uploadCost,
          "refund",
          `Image upload failed refund: ${imageName}`,
          user.id,
        );
        console.log(`Refunded ${uploadCost} credits for failed upload`);
      } catch (refundError) {
        console.error("Failed to refund credits:", refundError);
      }

      // Re-throw to trigger outer catch
      throw uploadError;
    }

    // Create usage record for successful upload
    await createUsageRecord({
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      type: "container_image_upload",
      provider: "cloudflare",
      input_cost: uploadCost,
      output_cost: 0,
      is_successful: uploadSuccessful,
      metadata: {
        image_name: imageName,
        image_size: imageBuffer.length,
        image_id: uploadResult.imageId,
        digest: uploadResult.digest,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          imageId: uploadResult.imageId,
          digest: uploadResult.digest,
          size: uploadResult.size,
          name: imageName,
        },
        message: "Image uploaded successfully",
        creditsDeducted: uploadCost,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error uploading image:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to upload image",
      },
      { status: 500 },
    );
  }
}

