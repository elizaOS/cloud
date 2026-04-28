import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/containers/credentials  (DEPRECATED)
 *
 * The Hetzner-Docker container backend pulls images directly from
 * GHCR / Docker Hub / any public-or-token-accessible registry. There is
 * no per-tenant ECR repository to vend credentials for.
 *
 * Callers should:
 * 1. Push the image to a public-or-already-authenticated registry
 *    (`ghcr.io/<org>/<repo>:<tag>`, `docker.io/<org>/<repo>:<tag>`).
 * 2. Pass the full image reference as `image` to POST /api/v1/containers.
 *
 * This route remains as a documented 410 so old CLI versions get a
 * clear migration message instead of 404.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error:
        "ECR credential vending was removed when the container backend moved off AWS. Push your image to GHCR (or any public registry) and pass `image: 'ghcr.io/owner/repo:tag'` to POST /api/v1/containers.",
      code: "ecr_credentials_removed",
    },
    { status: 410 },
  );
}
