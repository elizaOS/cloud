/**
 * FAQ Page
 * Custom page with accordion-based FAQ instead of markdown
 */

import type { Metadata } from "next";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Breadcrumb } from "@/components/docs";
import { getSectionBySlug, getDocMetadataBySlug } from "@/lib/docs";
import { FAQAccordion } from "@/components/docs/faq-accordion";
import { faqData } from "@/lib/docs/faq-data";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to frequently asked questions about elizaOS Platform",
  openGraph: {
    title: "FAQ - elizaOS Platform Docs",
    description: "Answers to frequently asked questions about elizaOS Platform",
    type: "article",
  },
};

export default function FAQPage() {
  const docMetadata = getDocMetadataBySlug("faq");
  const section = docMetadata ? getSectionBySlug(docMetadata.section) : undefined;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      {docMetadata && (
        <Breadcrumb section={section} doc={docMetadata} className="mb-6" />
      )}

      {/* Header */}
      <BrandCard className="mb-8">
        <CornerBrackets size="sm" className="opacity-30" />
        <div className="relative z-10">
          <h1 className="text-3xl font-bold text-white mb-3">
            Frequently Asked Questions
          </h1>
          <p className="text-base text-white/70">
            Find answers to common questions about elizaOS Platform. Can't find
            what you're looking for? Contact our support team.
          </p>
        </div>
      </BrandCard>

      {/* FAQ Accordions */}
      <BrandCard>
        <CornerBrackets size="sm" className="opacity-30" />
        <div className="relative z-10">
          <FAQAccordion sections={faqData} />
        </div>
      </BrandCard>

      {/* Contact Support */}
      <BrandCard className="mt-8">
        <CornerBrackets size="sm" className="opacity-30" />
        <div className="relative z-10">
          <h2 className="text-xl font-bold text-white mb-3">
            Still Have Questions?
          </h2>
          <p className="text-white/70 mb-4">
            Can't find what you're looking for? We're here to help!
          </p>
          <div className="flex flex-wrap gap-4">
            <a
              href="mailto:support@elizaos.com"
              className="text-[#FF5800] hover:underline"
            >
              Email Support
            </a>
            <span className="text-white/30">•</span>
            <a
              href="https://discord.gg/elizaos"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#FF5800] hover:underline"
            >
              Join Discord
            </a>
            <span className="text-white/30">•</span>
            <a
              href="/dashboard"
              className="text-[#FF5800] hover:underline"
            >
              Dashboard
            </a>
          </div>
        </div>
      </BrandCard>
    </div>
  );
}

