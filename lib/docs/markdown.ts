/**
 * Markdown Processing Utilities
 * Handles parsing, processing, and caching of documentation markdown files
 * SERVER-SIDE ONLY - Uses Node.js fs module
 */

import "server-only";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { DOCS, type DocMetadata } from "./metadata";

export interface TableOfContentsItem {
  id: string;
  text: string;
  level: number;
}

export interface ProcessedDoc {
  metadata: DocMetadata;
  content: string;
  frontmatter: Record<string, string>;
  tableOfContents: TableOfContentsItem[];
}

const DOCS_DIR = path.join(process.cwd(), "user-docs");

/**
 * Read and parse a markdown file
 */
function readMarkdownFile(filename: string): { content: string; data: Record<string, string> } {
  const filePath = path.join(DOCS_DIR, filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`Documentation file not found: ${filename}`);
  }

  const fileContents = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(fileContents);

  return { content, data: data as Record<string, string> };
}

/**
 * Extract table of contents from markdown content
 */
function extractTableOfContents(markdown: string): TableOfContentsItem[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const toc: TableOfContentsItem[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    
    // Generate ID from heading text (GitHub-style)
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Skip h1 headings (usually the title)
    if (level > 1) {
      toc.push({ id, text, level });
    }
  }

  return toc;
}

/**
 * Get a processed documentation page by slug
 */
export function getDocBySlug(slug: string): ProcessedDoc | null {
  const docMetadata = DOCS.find((doc) => doc.slug === slug);
  
  if (!docMetadata) {
    return null;
  }

  try {
    const { content, data } = readMarkdownFile(docMetadata.file);
    const tableOfContents = extractTableOfContents(content);

    return {
      metadata: docMetadata,
      content,
      frontmatter: data,
      tableOfContents,
    };
  } catch (error) {
    console.error(`Error reading doc ${slug}:`, error);
    return null;
  }
}

/**
 * Get all documentation pages
 */
export function getAllDocs(): ProcessedDoc[] {
  const docs: ProcessedDoc[] = [];

  for (const docMetadata of DOCS) {
    try {
      const { content, data } = readMarkdownFile(docMetadata.file);
      const tableOfContents = extractTableOfContents(content);

      docs.push({
        metadata: docMetadata,
        content,
        frontmatter: data,
        tableOfContents,
      });
    } catch (error) {
      console.error(`Error reading doc ${docMetadata.slug}:`, error);
    }
  }

  return docs;
}

/**
 * Check if a documentation file exists
 */
export function docExists(slug: string): boolean {
  const docMetadata = DOCS.find((doc) => doc.slug === slug);
  if (!docMetadata) return false;

  const filePath = path.join(DOCS_DIR, docMetadata.file);
  return fs.existsSync(filePath);
}

