import type { Metadata } from "next";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Login",
  description: "Sign in to Eliza Cloud to create, provision, and manage Eliza agents.",
  path: "/login",
  keywords: ["login", "sign in", "authentication", "Eliza", "Eliza Cloud"],
  noIndex: true,
});

/**
 * Layout component for the login page.
 * Provides SEO metadata for the login route.
 *
 * @param children - The login page content.
 */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
