/**
 * Table of Contents Component
 * Shows on-page navigation for documentation
 */

"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { TableOfContentsItem } from "@/lib/docs";
import { List } from "lucide-react";

interface TableOfContentsProps {
  items: TableOfContentsItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -66%", threshold: 1 },
    );

    // Observe all headings
    items.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="sticky top-6 hidden xl:block">
      <div className="space-y-3 border border-white/10 bg-black/40 p-4 rounded-none">
        <div className="flex items-center gap-2 mb-3">
          <List className="h-4 w-4 text-[#FF5800]" />
          <h4 className="text-xs font-semibold uppercase text-white/50 tracking-wider">
            On This Page
          </h4>
        </div>
        <nav>
          <ul className="space-y-2 text-sm">
            {items.map((item) => {
              const isActive = activeId === item.id;
              const paddingLeft = (item.level - 2) * 12;

              return (
                <li key={item.id} style={{ paddingLeft: `${paddingLeft}px` }}>
                  <a
                    href={`#${item.id}`}
                    className={cn(
                      "block py-1 transition-colors hover:text-white",
                      isActive
                        ? "text-[#FF5800] font-medium"
                        : "text-white/60",
                    )}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(item.id)?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }}
                  >
                    {item.text}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

