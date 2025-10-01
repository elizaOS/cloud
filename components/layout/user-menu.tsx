/**
 * User Menu Component
 * Displays authentication state and user actions
 */

'use client';

import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { getSignInUrl, getSignUpUrl } from '@workos-inc/authkit-nextjs';
import { Button } from '@/components/ui/button';
import { LogOut, User, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { handleSignOut } from '@/app/actions/auth';

export default function UserMenu() {
  const { user, loading } = useAuth();
  const [signInUrl, setSignInUrl] = useState<string | null>(null);
  const [signUpUrl, setSignUpUrl] = useState<string | null>(null);

  useEffect(() => {
    // Get sign in/up URLs on mount
    async function getAuthUrls() {
      const [signIn, signUp] = await Promise.all([
        getSignInUrl(),
        getSignUpUrl(),
      ]);
      setSignInUrl(signIn);
      setSignUpUrl(signUp);
    }
    if (!user && !loading) {
      getAuthUrls();
    }
  }, [user, loading]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  // Signed out state
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        {signInUrl && (
          <Button variant="ghost" size="sm" asChild>
            <a href={signInUrl}>Log in</a>
          </Button>
        )}
        {signUpUrl && (
          <Button size="sm" asChild>
            <a href={signUpUrl}>Sign Up</a>
          </Button>
        )}
      </div>
    );
  }

  // Handle sign out using server action
  const onSignOut = async () => {
    await handleSignOut();
  };

  // Signed in state
  return (
    <div className="flex items-center gap-3">
      {/* User info */}
      <div className="flex items-center gap-2 text-sm">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="hidden sm:inline-block font-medium">
          {user.firstName 
            ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
            : user.email
          }
        </span>
      </div>

      {/* Logout button */}
      <Button 
        onClick={onSignOut}
        variant="outline" 
        size="sm"
        className="gap-2"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline-block">Sign out</span>
      </Button>
    </div>
  );
}

