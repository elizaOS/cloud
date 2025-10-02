import { withAuth } from '@workos-inc/authkit-nextjs';
import { getUserByEmailWithOrganization } from '@/lib/queries/users';
import type { UserWithOrganization } from '@/lib/types';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { redirect } from 'next/navigation';

const getUserFromDB = unstable_cache(
  async (email: string) => {
    return await getUserByEmailWithOrganization(email);
  },
  ['user-by-email'],
  {
    revalidate: 300,
    tags: ['user-auth'],
  }
);

export const getCurrentUser = cache(
  async (): Promise<UserWithOrganization | null> => {
    try {
      const { user: workosUser } = await withAuth();

      if (!workosUser) {
        return null;
      }

      const user = await getUserFromDB(workosUser.email);

      if (!user) {
        return redirect('/login');
      }

      return user;
    } catch (error) {
      console.error('[AUTH] Error getting current user:', error);
      return null;
    }
  }
);

export async function requireAuth(): Promise<UserWithOrganization> {
  const user = await getCurrentUser();

  if (!user) {
    return redirect('/login');
  }

  if (!user.is_active) {
    throw new Error('Forbidden: User account is inactive');
  }

  return user;
}

export async function requireOrganization(
  organizationId: string
): Promise<UserWithOrganization> {
  const user = await requireAuth();

  if (user.organization_id !== organizationId) {
    throw new Error(
      `Forbidden: User does not have access to organization ${organizationId}`
    );
  }

  if (!user.organization.is_active) {
    throw new Error('Forbidden: Organization is inactive');
  }

  return user;
}

export async function requireRole(
  allowedRoles: string[]
): Promise<UserWithOrganization> {
  const user = await requireAuth();

  if (!allowedRoles.includes(user.role)) {
    throw new Error(
      `Forbidden: User role '${user.role}' not in allowed roles: ${allowedRoles.join(', ')}`
    );
  }

  return user;
}
