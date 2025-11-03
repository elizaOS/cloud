import type { StructuredDataOptions } from "./types";
import { SEO_CONSTANTS } from "./constants";

function getBaseUrl(): string {
  // Priority 1: Explicitly set app URL (recommended for production)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Priority 2: Vercel automatic URL (for deployments without explicit URL)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Priority 3: Local development fallback
  return "http://localhost:3000";
}

export function generateOrganizationSchema() {
  const baseUrl = getBaseUrl();

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SEO_CONSTANTS.siteName,
    description: SEO_CONSTANTS.defaultDescription,
    url: baseUrl,
    logo: `${baseUrl}/og/default.png`,
    sameAs: [
      "https://twitter.com/elizaos",
      "https://github.com/elizaos",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "Customer Support",
      url: `${baseUrl}/dashboard/account`,
    },
  };
}

export function generateWebApplicationSchema() {
  const baseUrl = getBaseUrl();

  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SEO_CONSTANTS.siteName,
    description: SEO_CONSTANTS.defaultDescription,
    url: baseUrl,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Pay-as-you-go credit system",
    },
    featureList: [
      "AI Text Generation",
      "AI Image Generation",
      "AI Video Generation",
      "Voice Cloning",
      "ElizaOS Agent Runtime",
      "Container Deployment",
      "API Access",
    ],
  };
}

export function generateProductSchema(
  name: string,
  description: string,
  imageUrl: string,
  category: string = "AI Agent",
) {
  const baseUrl = getBaseUrl();

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image: imageUrl,
    brand: {
      "@type": "Brand",
      name: SEO_CONSTANTS.siteName,
    },
    category,
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      price: "0",
      priceCurrency: "USD",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: "120",
    },
  };
}

export function generateArticleSchema(
  title: string,
  description: string,
  url: string,
  imageUrl: string,
  datePublished: string,
  dateModified?: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    image: imageUrl,
    url,
    datePublished,
    dateModified: dateModified || datePublished,
    author: {
      "@type": "Organization",
      name: SEO_CONSTANTS.siteName,
    },
    publisher: {
      "@type": "Organization",
      name: SEO_CONSTANTS.siteName,
      logo: {
        "@type": "ImageObject",
        url: `${getBaseUrl()}/og/default.png`,
      },
    },
  };
}

export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  const baseUrl = getBaseUrl();

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${baseUrl}${item.url}`,
    })),
  };
}

export function generateStructuredData(
  options: StructuredDataOptions,
): Record<string, unknown> {
  const baseUrl = getBaseUrl();

  switch (options.type) {
    case "Organization":
      return generateOrganizationSchema();

    case "WebApplication":
    case "SoftwareApplication":
      return generateWebApplicationSchema();

    case "Product":
      return generateProductSchema(
        options.name,
        options.description || "",
        options.image || `${baseUrl}/og/default.png`,
      );

    case "Article":
      return generateArticleSchema(
        options.name,
        options.description || "",
        options.url || baseUrl,
        options.image || `${baseUrl}/og/default.png`,
        new Date().toISOString(),
      );

    default:
      return generateOrganizationSchema();
  }
}
