import { MarketplacePreview } from "./marketplace-preview";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Agent Marketplace | Discover Intelligent Characters",
  description:
    "Explore our collection of AI agents including creative assistants, gaming companions, learning tutors, and more. Sign up to interact with intelligent characters powered by elizaOS Cloud.",
  keywords: [
    "AI agents",
    "AI marketplace",
    "AI characters",
    "AI assistants",
    "chatbots",
    "elizaOS",
    "AI companions",
  ],
  openGraph: {
    title: "AI Agent Marketplace | elizaOS Cloud",
    description: "Discover and interact with intelligent AI characters",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Agent Marketplace",
    description: "Discover intelligent AI characters",
  },
};

export const dynamic = "force-dynamic";

export default function PublicMarketplacePage() {
  return <MarketplacePreview />;
}
