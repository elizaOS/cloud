import { LandingPage } from "@/components/landing/landing-page";

/**
 * Landing Page
 * 
 * Authentication is handled entirely client-side by Privy.
 * The LandingPage component uses usePrivy() hook to check auth state
 * and redirects to /dashboard if the user is authenticated.
 * 
 * This approach allows the page to be statically rendered.
 */
export default function Home() {
  return <LandingPage />;
}