import {
  getSignInUrl,
  getSignUpUrl,
  withAuth,
} from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";

export default async function Home() {
  // Check if user is already signed in
  const { user } = await withAuth();

  // If signed in, redirect to dashboard
  if (user) {
    redirect("/dashboard");
  }

  // Get auth URLs for sign in/up
  const signInUrl = await getSignInUrl();
  const signUpUrl = await getSignUpUrl();

  return <LandingPage signInUrl={signInUrl} signUpUrl={signUpUrl} />;
}
