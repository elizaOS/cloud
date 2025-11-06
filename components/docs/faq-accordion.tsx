/**
 * FAQ Accordion Component
 * Renders FAQ items as collapsible accordions
 */

"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSection {
  title: string;
  items: FAQItem[];
}

interface FAQAccordionProps {
  sections: FAQSection[];
}

export function FAQAccordion({ sections }: FAQAccordionProps) {
  return (
    <div className="space-y-8">
      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          <h2 className="text-2xl font-sans font-bold text-white mb-4 border-b border-white/10 pb-2">
            {section.title}
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {section.items.map((item, itemIndex) => (
              <AccordionItem
                key={`${sectionIndex}-${itemIndex}`}
                value={`item-${sectionIndex}-${itemIndex}`}
                className="border-white/10"
              >
                <AccordionTrigger className="text-left font-sans text-white hover:text-[#FF5800] transition-colors">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-white/80 leading-relaxed">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </div>
  );
}

