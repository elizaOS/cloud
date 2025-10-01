import { withAuth } from '@workos-inc/authkit-nextjs';
import { syncWorkOSUser } from '@/lib/workos-sync';
import { getUserByEmailWithOrganization } from '@/lib/queries/users';
import type { UserWithOrganization } from '@/lib/types';
import { cache } from 'react';

export const getCurrentUser = cache(
  async (): Promise<UserWithOrganization | null> => {
    try {
      const { user: workosUser } = await withAuth();

      if (!workosUser) {
        return null;
      }

      let user = await getUserByEmailWithOrganization(workosUser.email);

      if (!user) {
        user = await syncWorkOSUser(workosUser);
      }

      return user;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }
);

export async function requireAuth(): Promise<UserWithOrganization> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}

export async function requireOrganization(organizationId: string): Promise<UserWithOrganization> {
  const user = await requireAuth();

  if (user.organization_id !== organizationId) {
    throw new Error('Forbidden: Access to this organization is not allowed');
  }

  return user;
}
