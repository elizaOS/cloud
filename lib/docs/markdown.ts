/**
 * Markdown Processing Utilities
 * Handles parsing, processing, and caching of documentation markdown files
 * SERVER-SIDE ONLY - Uses Node.js fs module
 */

import "server-only";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import GithubSlugger from "github-slugger";
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
 * Includes path traversal protection
 */
function readMarkdownFile(filename: string): { content: string; data: Record<string, string> } {
  // Validate filename - prevent path traversal
  if (filename.includes("..") || path.isAbsolute(filename)) {
    throw new Error(`Invalid filename: ${filename}`);
  }

  const filePath = path.join(DOCS_DIR, filename);
  const resolvedPath = path.resolve(filePath);
  const resolvedDocsDir = path.resolve(DOCS_DIR);

  // Ensure resolved path is within DOCS_DIR
  if (!resolvedPath.startsWith(resolvedDocsDir)) {
    throw new Error(`Path traversal detected: ${filename}`);
  }
  
  // Check if file exists
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Documentation file not found: ${filename}`);
  }

  const fileContents = fs.readFileSync(resolvedPath, "utf8");
  const { data, content } = matter(fileContents);

  return { content, data: data as Record<string, string> };
}

/**
 * Extract table of contents from markdown content
 * Uses github-slugger to ensure IDs match rehype-slug output
 */
function extractTableOfContents(markdown: string): TableOfContentsItem[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const toc: TableOfContentsItem[] = [];
  const slugger = new GithubSlugger();
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    
    // Generate ID using github-slugger (matches rehype-slug)
    const id = slugger.slug(text);

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
    const errorMessage = `Error reading documentation file: ${slug}`;
    const errorDetails = error instanceof Error ? error.message : String(error);
    
    console.error(errorMessage, {
      slug,
      file: docMetadata.file,
      error: errorDetails,
    });

    // In development, throw to make debugging easier
    if (process.env.NODE_ENV === "development") {
      throw new Error(`${errorMessage}: ${errorDetails}`);
    }

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
      const errorMessage = `Error reading documentation file: ${docMetadata.slug}`;
      const errorDetails = error instanceof Error ? error.message : String(error);
      
      console.error(errorMessage, {
        slug: docMetadata.slug,
        file: docMetadata.file,
        error: errorDetails,
      });

      // In development, throw to make debugging easier
      if (process.env.NODE_ENV === "development") {
        throw new Error(`${errorMessage}: ${errorDetails}`);
      }
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

