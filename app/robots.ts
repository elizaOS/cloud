import type { MetadataRoute } from "next";

/**
 * Generates robots.txt configuration for search engine crawlers.
 * Allows public pages but blocks API routes, dashboard, and auth pages.
 * Specifically blocks AI crawlers (GPTBot, ChatGPT, Claude, etc.).
 *
 * @returns Robots configuration with rules and sitemap reference.
 */
export default function robots(): MetadataRoute.Robots {
  // Get base URL with automatic Vercel URL detection as fallback
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api/*", "/dashboard/*", "/auth/*", "/actions/*"],
      },
      {
        userAgent: "GPTBot",
        disallow: ["/"],
      },
      {
        userAgent: "ChatGPT-User",
        disallow: ["/"],
      },
      {
        userAgent: "CCBot",
        disallow: ["/"],
      },
      {
        userAgent: "anthropic-ai",
        disallow: ["/"],
      },
      {
        userAgent: "Claude-Web",
        disallow: ["/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
