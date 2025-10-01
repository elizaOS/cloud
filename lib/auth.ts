import { withAuth } from '@workos-inc/authkit-nextjs';
import { syncWorkOSUser } from '@/lib/workos-sync';
import { getUserByEmailWithOrganization, updateUser } from '@/lib/queries/users';
import type { UserWithOrganization } from '@/lib/types';
import { cache } from 'react';

export const getCurrentUser = cache(
  async (): Promise<UserWithOrganization | null> => {
    try {
      console.log('[AUTH] Getting current user...');
      const { user: workosUser } = await withAuth();

      console.log('[AUTH] WorkOS user:', workosUser ? workosUser.email : 'null');

      if (!workosUser) {
        console.log('[AUTH] No WorkOS user found');
        return null;
      }

      let user = await getUserByEmailWithOrganization(workosUser.email);
      console.log('[AUTH] Database user:', user ? user.email : 'null');

      if (!user) {
        console.log('[AUTH] User not in database, syncing:', workosUser.email);
        user = await syncWorkOSUser(workosUser);
        console.log('[AUTH] User synced successfully:', user.email);
      } else {
        console.log('[AUTH] User found in database:', user.email);
        updateUser(user.id, {
          updated_at: new Date(),
        }).catch(error => {
          console.error('[AUTH] Failed to update last activity:', error);
        });
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
    throw new Error('Unauthorized: No authenticated user');
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
