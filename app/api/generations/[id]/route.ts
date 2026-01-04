import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { generationsRepository } from "@/db/repositories/generations";

/**
 * PATCH /api/generations/[id]
 * Updates a generation's metadata (e.g., custom name)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthWithOrg();
  const { id } = await params;

  const body = await request.json();
  const { name } = body;

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Name is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  // Find the generation and verify ownership
  const generation = await generationsRepository.findById(id);

  if (!generation) {
    return NextResponse.json(
      { error: "Generation not found" },
      { status: 404 }
    );
  }

  if (generation.organization_id !== user.organization_id) {
    return NextResponse.json(
      { error: "Not authorized to update this generation" },
      { status: 403 }
    );
  }

  // Update the metadata with the new name
  const existingMetadata = (generation.metadata || {}) as Record<string, unknown>;
  const updatedGeneration = await generationsRepository.update(id, {
    metadata: {
      ...existingMetadata,
      name: name.trim(),
    },
  });

  return NextResponse.json({ 
    success: true, 
    generation: updatedGeneration 
  });
}
