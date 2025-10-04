import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createApiKey, listApiKeys } from "@/lib/queries/api-keys";

export async function GET() {
  try {
    const user = await requireAuth();

    const keys = await listApiKeys(user.organization_id);

    return NextResponse.json({ keys });
  } catch (error) {
    console.error("Error fetching API keys:", error);
    return NextResponse.json(
      { error: "Failed to fetch API keys" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await request.json();
    const { name, description, permissions, rate_limit, expires_at } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const { apiKey, plainKey } = await createApiKey({
      name: name.trim(),
      description: description?.trim() || null,
      organization_id: user.organization_id,
      user_id: user.id,
      permissions: permissions || [],
      rate_limit: rate_limit || 1000,
      expires_at: expires_at ? new Date(expires_at) : null,
      is_active: true,
    });

    return NextResponse.json(
      {
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          description: apiKey.description,
          key_prefix: apiKey.key_prefix,
          created_at: apiKey.created_at,
          permissions: apiKey.permissions,
          rate_limit: apiKey.rate_limit,
          expires_at: apiKey.expires_at,
        },
        plainKey,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating API key:", error);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 },
    );
  }
}
