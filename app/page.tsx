import { LandingPage } from "@/components/landing/landing-page";
import {
  generateOrganizationSchema,
  generateWebApplicationSchema,
} from "@/lib/seo";

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
  const organizationSchema = generateOrganizationSchema();
  const webAppSchema = generateWebApplicationSchema();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />
      <LandingPage />
    </>
  );
}
