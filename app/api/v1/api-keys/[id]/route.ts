import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getApiKeyById,
  deleteApiKey,
  updateApiKey,
} from "@/lib/queries/api-keys";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const existingKey = await getApiKeyById(id);

    if (!existingKey) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    if (existingKey.organization_id !== user.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await deleteApiKey(id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error deleting API key:", error);
    return NextResponse.json(
      { error: "Failed to delete API key" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const existingKey = await getApiKeyById(id);

    if (!existingKey) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    if (existingKey.organization_id !== user.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      permissions,
      rate_limit,
      is_active,
      expires_at,
    } = body;

    const updatedKey = await updateApiKey(id, {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(permissions !== undefined && { permissions }),
      ...(rate_limit !== undefined && { rate_limit }),
      ...(is_active !== undefined && { is_active }),
      ...(expires_at !== undefined && {
        expires_at: expires_at ? new Date(expires_at) : null,
      }),
    });

    if (!updatedKey) {
      return NextResponse.json(
        { error: "Failed to update API key" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        apiKey: {
          id: updatedKey.id,
          name: updatedKey.name,
          description: updatedKey.description,
          key_prefix: updatedKey.key_prefix,
          created_at: updatedKey.created_at,
          permissions: updatedKey.permissions,
          rate_limit: updatedKey.rate_limit,
          is_active: updatedKey.is_active,
          expires_at: updatedKey.expires_at,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error updating API key:", error);
    return NextResponse.json(
      { error: "Failed to update API key" },
      { status: 500 },
    );
  }
}
