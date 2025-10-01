import { createOrganization, getOrganizationBySlug } from '@/lib/queries/organizations';
import { createUser, getUserByEmail, updateUser } from '@/lib/queries/users';
import type { UserWithOrganization } from '@/lib/types';

interface WorkOSUser {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

function generateSlugFromEmail(email: string): string {
  const username = email.split('@')[0];
  const sanitized = username.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const random = Math.random().toString(36).substring(2, 6);
  return `${sanitized}-${random}`;
}

export async function syncWorkOSUser(
  workosUser: WorkOSUser
): Promise<UserWithOrganization> {
  const email = workosUser.email;
  const name =
    workosUser.firstName && workosUser.lastName
      ? `${workosUser.firstName} ${workosUser.lastName}`
      : workosUser.firstName || workosUser.email;

  let user = await getUserByEmail(email);

  if (user) {
    if (user.name !== name && user) {
      user = await updateUser(user.id, { name }) || user;
    }

    const org = await getOrganizationBySlug(user.organization_id);

    if (!org) {
      throw new Error('Organization not found for user');
    }

    return {
      ...user,
      organization: org,
    };
  }

  let orgSlug = generateSlugFromEmail(email);
  let org = await getOrganizationBySlug(orgSlug);

  while (org) {
    orgSlug = generateSlugFromEmail(email);
    org = await getOrganizationBySlug(orgSlug);
  }

  org = await createOrganization({
    name: name || email,
    slug: orgSlug,
    credit_balance: 10000,
    subscription_tier: 'free',
    is_active: true,
  });

  user = await createUser({
    email,
    name,
    organization_id: org.id,
    role: 'owner',
    email_verified: true,
    is_active: true,
  });

  return {
    ...user,
    organization: org,
  };
}
