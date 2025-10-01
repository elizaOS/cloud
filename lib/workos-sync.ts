import { createOrganization, getOrganizationBySlug, getOrganizationById } from '@/lib/queries/organizations';
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
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36).substring(-4);
  return `${sanitized}-${timestamp}${random}`;
}

export async function syncWorkOSUser(
  workosUser: WorkOSUser
): Promise<UserWithOrganization> {
  const email = workosUser.email.toLowerCase().trim();
  const name =
    workosUser.firstName && workosUser.lastName
      ? `${workosUser.firstName} ${workosUser.lastName}`.trim()
      : workosUser.firstName || workosUser.email;

  let user = await getUserByEmail(email);

  if (user) {
    const shouldUpdate = user.name !== name;

    if (shouldUpdate) {
      user = await updateUser(user.id, {
        name,
        updated_at: new Date(),
      }) || user;
    }

    const org = await getOrganizationById(user.organization_id);

    if (!org) {
      throw new Error(`Organization ${user.organization_id} not found for user ${user.id}`);
    }

    return {
      ...user,
      organization: org,
    };
  }

  let orgSlug = generateSlugFromEmail(email);
  let org = await getOrganizationBySlug(orgSlug);

  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  while (org && attempts < MAX_ATTEMPTS) {
    orgSlug = generateSlugFromEmail(email);
    org = await getOrganizationBySlug(orgSlug);
    attempts++;
  }

  if (org) {
    throw new Error(`Failed to generate unique organization slug after ${MAX_ATTEMPTS} attempts`);
  }

  org = await createOrganization({
    name: name || email,
    slug: orgSlug,
    credit_balance: 10000,
    subscription_tier: 'free',
    is_active: true,
    allowed_models: [],
    allowed_providers: [],
    settings: {
      created_via: 'workos_oauth',
      initial_login: new Date().toISOString(),
    },
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
