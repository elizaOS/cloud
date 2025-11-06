import type { Metadata } from "next";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Login",
  description:
    "Sign in to elizaOS Platform - Access AI agent development tools, deploy intelligent agents, and manage your account.",
  path: "/login",
  keywords: ["login", "sign in", "authentication", "elizaOS", "AI platform"],
});

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
