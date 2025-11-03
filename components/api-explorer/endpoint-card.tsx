"use client";

import { type ApiEndpoint } from "@/lib/swagger/endpoint-discovery";
import { ShieldIcon } from "lucide-react";
import { BrandCard, BrandButton } from "@/components/brand";

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
  return (
    <BrandCard 
      hover
      corners={false}
      className="cursor-pointer transition-all hover:-translate-y-0.5"
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {getCategoryIcon(endpoint.category)}
              <h3 className="text-lg font-bold text-white">{endpoint.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              {endpoint.requiresAuth && (
                <ShieldIcon className="h-4 w-4 text-amber-400" />
              )}
              {endpoint.deprecated && (
                <span className="rounded-none bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-400 border border-rose-500/40">
                  DEPRECATED
                </span>
              )}
            </div>
          </div>
          <p className="text-sm text-white/60">
            {endpoint.description}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={getMethodColor(endpoint.method)}>
            {endpoint.method}
          </span>
          <code className="flex-1 rounded-none bg-black/60 border border-white/10 px-2 py-1 font-mono text-xs text-white">
            {endpoint.path}
          </code>
        </div>

        {endpoint.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {endpoint.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-none bg-white/10 px-2 py-0.5 text-xs text-white/70"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {endpoint.rateLimit && (
          <div className="text-xs text-white/50">
            Rate limit: {endpoint.rateLimit.requests} requests per{" "}
            {endpoint.rateLimit.window}
          </div>
        )}

        <BrandButton 
          variant="primary"
          className="w-full" 
          onClick={() => onSelect(endpoint)}
        >
          Test Endpoint
        </BrandButton>
      </div>
    </BrandCard>
  );
}
