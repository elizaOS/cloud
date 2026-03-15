import type { Metadata } from "next";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Login",
  description: "Sign in to Milady Cloud to create, provision, and manage Milady agents.",
  path: "/login",
  keywords: ["login", "sign in", "authentication", "Milady", "Milady Cloud"],
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
