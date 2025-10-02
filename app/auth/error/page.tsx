import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { getSignInUrl } from '@workos-inc/authkit-nextjs';

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const signInUrl = await getSignInUrl();
  const params = await searchParams;
  const reason = params.reason || 'unknown';

  const errorMessages: Record<string, { title: string; description: string }> = {
    sync_failed: {
      title: 'Authentication Sync Failed',
      description: 'We could not sync your account information. Please try signing in again.',
    },
    unknown: {
      title: 'Authentication Error',
      description: 'An unexpected error occurred during authentication. Please try again.',
    },
  };

  const error = errorMessages[reason] || errorMessages.unknown;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>{error.title}</CardTitle>
          <CardDescription>{error.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href={signInUrl}>Try Again</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Go Home</Link>
            </Button>
          </div>
          <div className="text-center text-xs text-muted-foreground">
            If this problem persists, please contact support.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
