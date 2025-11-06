/**
 * Markdown Renderer Component
 * Renders documentation markdown with syntax highlighting and custom styling
 */

"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import "highlight.js/styles/github-dark.css";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "prose prose-invert max-w-none",
        "prose-headings:font-sans prose-headings:font-bold prose-headings:tracking-tight",
        "prose-h1:text-3xl prose-h1:mb-6 prose-h1:text-white",
        "prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-white prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-2",
        "prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3 prose-h3:text-white/90",
        "prose-h4:text-lg prose-h4:mt-5 prose-h4:mb-2 prose-h4:text-white/90",
        "prose-p:text-white/80 prose-p:leading-relaxed prose-p:my-4",
        "prose-a:text-[#FF5800] prose-a:no-underline prose-a:font-normal [&_a:hover]:underline",
        "prose-strong:text-white prose-strong:font-semibold",
        "prose-code:text-white/90 prose-code:bg-black/60 prose-code:border prose-code:border-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-none prose-code:font-mono prose-code:text-sm prose-code:before:content-[''] prose-code:after:content-['']",
        "prose-pre:bg-black/60 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-none prose-pre:p-4 prose-pre:overflow-x-auto",
        "prose-pre>code:bg-transparent prose-pre>code:text-white/90 prose-pre>code:p-0",
        "prose-blockquote:border-l-4 prose-blockquote:border-[#FF5800] prose-blockquote:bg-white/5 prose-blockquote:pl-4 prose-blockquote:py-2 prose-blockquote:my-6 prose-blockquote:text-white/70 prose-blockquote:italic",
        "prose-ul:text-white/80 prose-ul:my-4",
        "prose-ol:text-white/80 prose-ol:my-4",
        "prose-li:my-1",
        "prose-table:border prose-table:border-white/10 prose-table:rounded-none prose-table:my-6",
        "prose-thead:bg-white/5 prose-thead:border-b prose-thead:border-white/10",
        "prose-th:text-white prose-th:font-semibold prose-th:px-4 prose-th:py-2",
        "prose-td:text-white/80 prose-td:px-4 prose-td:py-2 prose-td:border-t prose-td:border-white/10",
        "prose-hr:border-white/10 prose-hr:my-8",
        "prose-img:rounded-none prose-img:border prose-img:border-white/10",
        "[&_.hljs]:bg-transparent",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeHighlight,
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: "wrap",
              properties: {
                className: ["anchor-link"],
              },
            },
          ],
        ]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

