import { getCurrentUser } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        email_verified: user.email_verified,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
        credit_balance: user.organization.credit_balance,
        subscription_tier: user.organization.subscription_tier,
        is_active: user.organization.is_active,
        created_at: user.organization.created_at,
      },
    });
  } catch (error) {
    console.error('[DEBUG] Error fetching user:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
