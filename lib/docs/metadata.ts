/**
 * Documentation Metadata
 * Defines the structure and organization of documentation pages
 */

export interface DocMetadata {
  title: string;
  description: string;
  slug: string;
  file: string;
  section: string;
  order: number;
}

export interface DocSection {
  title: string;
  slug: string;
  order: number;
}

export const DOC_SECTIONS: DocSection[] = [
  {
    title: "Getting Started",
    slug: "getting-started",
    order: 1,
  },
  {
    title: "Features",
    slug: "features",
    order: 2,
  },
  {
    title: "API & Development",
    slug: "api",
    order: 3,
  },
  {
    title: "Help & Support",
    slug: "help",
    order: 4,
  },
];

export const DOCS: DocMetadata[] = [
  // Getting Started
  {
    title: "Introduction",
    description: "Learn what elizaOS Platform is and what you can build with it",
    slug: "introduction",
    file: "introduction.md",
    section: "getting-started",
    order: 1,
  },
  {
    title: "Quick Start",
    description: "Get up and running in just a few minutes",
    slug: "quick-start",
    file: "quick-start.md",
    section: "getting-started",
    order: 2,
  },

  // Features
  {
    title: "Character Creator",
    description: "Create and customize AI agent personalities",
    slug: "character-creator",
    file: "character-creator.md",
    section: "features",
    order: 1,
  },
  {
    title: "Pricing & Credits",
    description: "Understand how credits work and manage your spending",
    slug: "pricing",
    file: "pricing.md",
    section: "features",
    order: 2,
  },

  // API & Development
  {
    title: "API Guide",
    description: "Integrate elizaOS into your applications",
    slug: "api-guide",
    file: "api-guide.md",
    section: "api",
    order: 1,
  },

  // Help & Support
  {
    title: "FAQ",
    description: "Answers to frequently asked questions",
    slug: "faq",
    file: "faq.md", // Not used for FAQ, has custom page
    section: "help",
    order: 1,
  },
];

/**
 * Get all documentation organized by sections
 */
export function getDocsBySection(): Map<string, DocMetadata[]> {
  const map = new Map<string, DocMetadata[]>();

  for (const doc of DOCS) {
    const existing = map.get(doc.section) || [];
    existing.push(doc);
    map.set(doc.section, existing);
  }

  // Sort each section by order
  for (const [section, docs] of map.entries()) {
    map.set(
      section,
      docs.sort((a, b) => a.order - b.order),
    );
  }

  return map;
}

/**
 * Get a single doc by slug
 */
export function getDocBySlug(slug: string): DocMetadata | undefined {
  return DOCS.find((doc) => doc.slug === slug);
}

/**
 * Get all doc slugs for static generation
 */
export function getAllDocSlugs(): string[] {
  return DOCS.map((doc) => doc.slug);
}

/**
 * Get section info by slug
 */
export function getSectionBySlug(slug: string): DocSection | undefined {
  return DOC_SECTIONS.find((section) => section.slug === slug);
}

