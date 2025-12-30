import fs from "fs";
import path from "path";
import matter from "gray-matter";

const BLOG_DIR = path.join(process.cwd(), "content/blog");

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  author: string;
  description: string;
  category: string;
  image?: string;
  content: string;
  relatedPosts?: string[];
}

export interface BlogPostMeta {
  slug: string;
  title: string;
  date: string;
  author: string;
  description: string;
  category: string;
  image?: string;
}

export function getAllPosts(): BlogPostMeta[] {
  const files = fs.readdirSync(BLOG_DIR);

  const posts = files
    .filter((file) => file.endsWith(".mdx") || file.endsWith(".md"))
    .filter((file) => !file.startsWith("_"))
    .map((file) => {
      const filePath = path.join(BLOG_DIR, file);
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const { data } = matter(fileContent);

      return {
        slug: file.replace(/\.mdx?$/, ""),
        title: data.title || "Untitled",
        date: data.date || "",
        author: data.author || "Anonymous",
        description: data.description || "",
        category: data.category || "uncategorized",
        image: data.image,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return posts;
}

export function getPostBySlug(slug: string): BlogPost | null {
  const mdxPath = path.join(BLOG_DIR, `${slug}.mdx`);
  const mdPath = path.join(BLOG_DIR, `${slug}.md`);

  let filePath = "";
  if (fs.existsSync(mdxPath)) {
    filePath = mdxPath;
  } else if (fs.existsSync(mdPath)) {
    filePath = mdPath;
  } else {
    return null;
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(fileContent);

  return {
    slug,
    title: data.title || "Untitled",
    date: data.date || "",
    author: data.author || "Anonymous",
    description: data.description || "",
    category: data.category || "uncategorized",
    image: data.image,
    content,
    relatedPosts: data.relatedPosts,
  };
}

export function getPostsByCategory(category: string): BlogPostMeta[] {
  const allPosts = getAllPosts();
  return allPosts.filter((post) => post.category === category);
}

export function getCategories(): string[] {
  const allPosts = getAllPosts();
  const categories = new Set(allPosts.map((post) => post.category));
  return Array.from(categories).sort();
}

// Exclude demo posts from public listing
export function getPublicPosts(): BlogPostMeta[] {
  return getAllPosts().filter((post) => post.category !== "demo");
}

// Exclude demo from public category list
export function getPublicCategories(): string[] {
  return getCategories().filter((category) => category !== "demo");
}

export function getAllSlugs(): string[] {
  const files = fs.readdirSync(BLOG_DIR);

  return files
    .filter((file) => file.endsWith(".mdx") || file.endsWith(".md"))
    .filter((file) => !file.startsWith("_"))
    .map((file) => file.replace(/\.mdx?$/, ""));
}

export function getPostsBySlugs(slugs: string[]): BlogPostMeta[] {
  const allPosts = getAllPosts();
  return slugs
    .map((slug) => allPosts.find((post) => post.slug === slug))
    .filter((post): post is BlogPostMeta => post !== undefined);
}
