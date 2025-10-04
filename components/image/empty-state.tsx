"use client";

import { Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed p-20 text-center bg-gradient-to-br from-muted/20 to-transparent hover:border-primary/50 transition-colors duration-300">
      <div className="flex flex-col items-center space-y-6">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-600/20 ring-8 ring-muted/30">
          <ImageIcon className="h-12 w-12 text-primary" />
        </div>

        <div className="space-y-3 max-w-md">
          <h3 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Ready to Create Magic
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Describe your vision in detail above and watch as AI brings it to
            life. The more specific you are, the better the results!
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Badge variant="outline" className="text-xs px-3 py-1">
            1024x1024
          </Badge>
          <Badge variant="outline" className="text-xs px-3 py-1">
            High Quality
          </Badge>
        </div>
      </div>
    </div>
  );
}
