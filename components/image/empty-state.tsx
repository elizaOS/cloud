"use client";

import { Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function EmptyState() {
  return (
    <div className="rounded-none border border-dashed border-white/10 p-12 text-center bg-black/20 hover:border-[#FF5800]/30 transition-colors duration-300">
      <div className="flex flex-col items-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#FF5800]/10 border border-[#FF5800]/40">
          <ImageIcon className="h-8 w-8 text-[#FF5800]" />
        </div>

        <div className="space-y-2 max-w-md">
          <h3 className="text-lg font-bold text-white">Ready to Create</h3>
          <p className="text-sm text-white/60 leading-relaxed">
            Describe your vision in detail above and watch as AI brings it to
            life. The more specific you are, the better the results!
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Badge
            variant="outline"
            className="text-xs px-2 py-0.5 rounded-none border-white/20 bg-white/5 text-white/70"
          >
            1024x1024
          </Badge>
          <Badge
            variant="outline"
            className="text-xs px-2 py-0.5 rounded-none border-white/20 bg-white/5 text-white/70"
          >
            High Quality
          </Badge>
        </div>
      </div>
    </div>
  );
}
