"use client";

import { type ApiEndpoint } from "@/lib/swagger/endpoint-discovery";
import { ChevronRight } from "lucide-react";
import { BrandCard } from "@/components/brand";

interface EndpointCardProps {
  endpoint: ApiEndpoint;
  onSelect: (endpoint: ApiEndpoint) => void;
  getMethodColor: (method: string) => string;
  getCategoryIcon: (category: string) => React.ReactNode;
}

export function EndpointCard({
  endpoint,
  onSelect,
  getMethodColor,
  getCategoryIcon,
}: EndpointCardProps) {
  const paramCount =
    (endpoint.parameters?.path?.length || 0) +
    (endpoint.parameters?.query?.length || 0) +
    (endpoint.parameters?.body?.length || 0);

  return (
    <BrandCard
      hover
      corners={false}
      className="group relative cursor-pointer transition-all hover:-translate-y-0.5 hover:border-[#FF5800]/50"
      onClick={() => onSelect(endpoint)}
    >
      <div className="absolute right-4 top-4 opacity-0 transition-all duration-300 group-hover:opacity-100">
        <div className="flex items-center gap-2 text-xs font-bold text-[#FF5800]">
          TEST ENDPOINT <ChevronRight className="h-4 w-4" />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {getCategoryIcon(endpoint.category)}
              <h3 className="text-lg font-bold text-white group-hover:text-[#FF5800] transition-colors">
                {endpoint.name}
              </h3>
            </div>
            <div className="flex items-center gap-2 pr-8">
              {endpoint.deprecated && (
                <span className="rounded-none bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-400 border border-rose-500/40">
                  DEPRECATED
                </span>
              )}
            </div>
          </div>
          <p className="text-sm text-white/60 line-clamp-2">
            {endpoint.description}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={getMethodColor(endpoint.method)}>
            {endpoint.method}
          </span>
          <code className="flex-1 rounded-none bg-black/60 border border-white/10 px-2 py-1 font-mono text-xs text-white truncate">
            {endpoint.path}
          </code>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-4">
          <div className="flex gap-4 text-xs text-white/40 font-mono">
            <span>{paramCount} params</span>
            {endpoint.rateLimit && (
              <span>
                {endpoint.rateLimit.requests}/{endpoint.rateLimit.window}
              </span>
            )}
          </div>
          
          {endpoint.tags.length > 0 && (
            <div className="flex gap-1.5">
              {endpoint.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded-none bg-white/5 px-1.5 py-0.5 text-xs text-white/50 uppercase tracking-wider"
                >
                  {tag}
                </span>
              ))}
              {endpoint.tags.length > 2 && (
                <span className="text-[10px] text-white/50 py-0.5">
                  +{endpoint.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </BrandCard>
  );
}
