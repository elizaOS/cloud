import type { MetadataRoute } from "next";
import { db } from "@/db/client";
import { userCharacters } from "@/db/schemas/user-characters";
import { eq } from "drizzle-orm";
import { getAllDocSlugs } from "@/lib/docs/metadata";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Get base URL with automatic Vercel URL detection as fallback
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/marketplace`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/terms-of-service`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/dashboard`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/dashboard/eliza`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/dashboard/image`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/dashboard/video`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/dashboard/voices`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/dashboard/eliza`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/dashboard/character-creator`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/dashboard/my-agents`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/dashboard/api-explorer`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/dashboard/mcp-playground`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  // Add documentation pages
  const docSlugs = getAllDocSlugs();
  const docPages: MetadataRoute.Sitemap = docSlugs.map((slug) => ({
    url: `${baseUrl}/docs/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  try {
    const publicCharacters = await db
      .select({
        id: userCharacters.id,
        updated_at: userCharacters.updated_at,
      })
      .from(userCharacters)
      .where(eq(userCharacters.is_public, true))
      .limit(1000);

    const characterPages: MetadataRoute.Sitemap = publicCharacters.map(
      (character) => ({
        url: `${baseUrl}/marketplace/characters/${character.id}`,
        lastModified: character.updated_at,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }),
    );

    return [...staticPages, ...docPages, ...characterPages];
  } catch (error) {
    console.error("Error generating sitemap:", error);
    return [...staticPages, ...docPages];
  }
}
