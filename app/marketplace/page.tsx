import { MarketplacePreview } from "./marketplace-preview";
import type { Metadata } from "next";

import { generatePageMetadata, generateOGImageUrl } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
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
  path: "/marketplace",
  ogImage: generateOGImageUrl({ type: "marketplace" }),
});

export const dynamic = "force-dynamic";

/**
 * Public marketplace page displaying available AI agents and characters.
 * Accessible without authentication.
 */
export default function PublicMarketplacePage() {
  return <MarketplacePreview />;
}
