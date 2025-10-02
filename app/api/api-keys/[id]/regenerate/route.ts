import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getApiKeyById, updateApiKey, generateApiKey } from '@/lib/queries/api-keys';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const existingKey = await getApiKeyById(id);

    if (!existingKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    if (existingKey.organization_id !== user.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { key: newKey, hash: newHash, prefix: newPrefix } = generateApiKey();

    const updatedKey = await updateApiKey(id, {
      key: newKey,
      key_hash: newHash,
      key_prefix: newPrefix,
      updated_at: new Date(),
    });

    if (!updatedKey) {
      return NextResponse.json({ error: 'Failed to regenerate API key' }, { status: 500 });
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
          expires_at: updatedKey.expires_at,
        },
        plainKey: newKey,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error regenerating API key:', error);
    return NextResponse.json({ error: 'Failed to regenerate API key' }, { status: 500 });
  }
}
