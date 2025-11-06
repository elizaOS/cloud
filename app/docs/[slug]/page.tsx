/**
 * Dynamic Documentation Page
 * Renders individual documentation pages
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getAllDocSlugs,
  getSectionBySlug,
  getDocMetadataBySlug,
} from "@/lib/docs";
import { getDocBySlug } from "@/lib/docs/markdown";
import { MarkdownRenderer, TableOfContents, Breadcrumb } from "@/components/docs";
import { BrandCard, CornerBrackets } from "@/components/brand";

interface DocPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  const slugs = getAllDocSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: DocPageProps): Promise<Metadata> {
  const { slug } = await params;
  const docMetadata = getDocMetadataBySlug(slug);

  if (!docMetadata) {
    return {
      title: "Not Found",
    };
  }

  return {
    title: docMetadata.title,
    description: docMetadata.description,
    openGraph: {
      title: `${docMetadata.title} - elizaOS Platform Docs`,
      description: docMetadata.description,
      type: "article",
    },
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const doc = getDocBySlug(slug);

  if (!doc) {
    notFound();
  }

  const section = getSectionBySlug(doc.metadata.section);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <Breadcrumb section={section} doc={doc.metadata} className="mb-6" />

      <div className="flex gap-8">
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <BrandCard className="mb-8">
            <CornerBrackets size="sm" className="opacity-30" />
            <div className="relative z-10">
              <h1 className="text-3xl font-bold text-white mb-3">
                {doc.metadata.title}
              </h1>
              <p className="text-base text-white/70">
                {doc.metadata.description}
              </p>
            </div>
          </BrandCard>

          <BrandCard>
            <CornerBrackets size="sm" className="opacity-30" />
            <div className="relative z-10">
              <MarkdownRenderer content={doc.content} />
            </div>
          </BrandCard>
        </div>

        {/* Table of Contents */}
        {doc.tableOfContents.length > 0 && (
          <div className="w-64 shrink-0">
            <TableOfContents items={doc.tableOfContents} />
          </div>
        )}
      </div>
    </div>
  );
}

