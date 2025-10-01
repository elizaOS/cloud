'use server';

import { signOut } from '@workos-inc/authkit-nextjs';

/**
 * Server action to handle user sign out
 */
export async function handleSignOut() {
  await signOut();
}

