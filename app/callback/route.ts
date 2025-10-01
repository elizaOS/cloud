import { handleAuth, withAuth } from '@workos-inc/authkit-nextjs';
import { syncWorkOSUser } from '@/lib/workos-sync';
import { type NextRequest } from 'next/server';

export const GET = async (request: NextRequest) => {
  const authResponse = await handleAuth({ returnPathname: '/dashboard' })(request);

  try {
    const { user } = await withAuth();

    if (user) {
      await syncWorkOSUser({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    }
  } catch (error) {
    console.error('Error syncing user during callback:', error);
  }

  return authResponse;
};