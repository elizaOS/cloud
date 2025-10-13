import {
  createOrganization,
  getOrganizationBySlug,
  getOrganizationById,
} from "@/lib/queries/organizations";
import { createUser, getUserByEmail, updateUser } from "@/lib/queries/users";
import type { UserWithOrganization } from "@/lib/types";

interface WorkOSUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

function generateSlugFromEmail(email: string): string {
  const username = email.split("@")[0];
  const sanitized = username.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36).slice(-4);
  return `${sanitized}-${timestamp}${random}`;
}

export async function syncWorkOSUser(
  workosUser: WorkOSUser,
): Promise<UserWithOrganization> {
  const email = workosUser.email.toLowerCase().trim();
  const name =
    workosUser.firstName && workosUser.lastName
      ? `${workosUser.firstName} ${workosUser.lastName}`.trim()
      : workosUser.firstName || workosUser.email;

  console.log(`[WorkOS Sync] Looking up user: ${email}`);

  let user = await getUserByEmail(email);

  if (user) {
    console.log(`[WorkOS Sync] User found in database: ${user.id}`);

    const shouldUpdate =
      user.name !== name || user.workos_user_id !== workosUser.id;

    if (shouldUpdate) {
      console.log(`[WorkOS Sync] Updating user: ${user.id}`);
      user =
        (await updateUser(user.id, {
          name,
          workos_user_id: workosUser.id,
          updated_at: new Date(),
        })) || user;
    }

    const org = await getOrganizationById(user.organization_id);

    if (!org) {
      console.error(
        `[WorkOS Sync] Organization not found: ${user.organization_id}`
      );
      throw new Error(
        `Organization ${user.organization_id} not found for user ${user.id}`,
      );
    }

    console.log(`[WorkOS Sync] User org verified: ${org.name}`);

    return {
      ...user,
      organization: org,
    };
  }

  console.log(`[WorkOS Sync] User not found, creating new user and org`);

  let orgSlug = generateSlugFromEmail(email);
  let org = await getOrganizationBySlug(orgSlug);

  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  while (org && attempts < MAX_ATTEMPTS) {
    console.log(
      `[WorkOS Sync] Slug collision, regenerating (attempt ${attempts + 1}/${MAX_ATTEMPTS})`
    );
    orgSlug = generateSlugFromEmail(email);
    org = await getOrganizationBySlug(orgSlug);
    attempts++;
  }

  if (org) {
    console.error(
      `[WorkOS Sync] Failed to generate unique slug after ${MAX_ATTEMPTS} attempts`
    );
    throw new Error(
      `Failed to generate unique organization slug after ${MAX_ATTEMPTS} attempts`,
    );
  }

  console.log(`[WorkOS Sync] Creating organization: ${orgSlug}`);

  try {
    org = await createOrganization({
      name: name || email,
      slug: orgSlug,
      credit_balance: 10000,
      is_active: true,
      allowed_models: [],
      allowed_providers: [],
      settings: {
        created_via: "workos_oauth",
        initial_login: new Date().toISOString(),
      },
    });

    console.log(`[WorkOS Sync] Organization created: ${org.id}`);
  } catch (error) {
    console.error(`[WorkOS Sync] Failed to create organization:`, error);
    throw new Error(
      `Failed to create organization: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }

  console.log(`[WorkOS Sync] Creating user: ${email}`);

  try {
    user = await createUser({
      workos_user_id: workosUser.id,
      email,
      name,
      organization_id: org.id,
      role: "owner",
      email_verified: true,
      is_active: true,
    });

    console.log(`[WorkOS Sync] User created: ${user.id}`);
  } catch (error) {
    console.error(`[WorkOS Sync] Failed to create user:`, error);
    throw new Error(
      `Failed to create user: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }

  console.log(
    `[WorkOS Sync] ✓ Complete - User: ${user.id}, Org: ${org.id}`
  );

  return {
    ...user,
    organization: org,
  };
}
