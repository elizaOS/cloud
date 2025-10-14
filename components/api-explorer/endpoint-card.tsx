"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ApiEndpoint } from "@/lib/swagger/endpoint-discovery";
import { ShieldIcon } from "lucide-react";

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
    <Card className="cursor-pointer border-border/60 bg-background/60 transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getCategoryIcon(endpoint.category)}
            <CardTitle className="text-lg">{endpoint.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {endpoint.requiresAuth && (
              <ShieldIcon className="h-4 w-4 text-amber-500" />
            )}
            {endpoint.deprecated && (
              <Badge variant="destructive" className="text-xs">
                Deprecated
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          {endpoint.description}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className={getMethodColor(endpoint.method)}>
              {endpoint.method}
            </span>
            <code className="flex-1 rounded-lg bg-muted px-2 py-1 font-mono text-xs">
              {endpoint.path}
            </code>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {endpoint.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="rounded-full text-xs"
              >
                {tag}
              </Badge>
            ))}
          </div>

          {endpoint.rateLimit && (
            <div className="text-xs text-muted-foreground">
              Rate limit: {endpoint.rateLimit.requests} requests per{" "}
              {endpoint.rateLimit.window}
            </div>
          )}

          <Button className="w-full" onClick={() => onSelect(endpoint)}>
            Test Endpoint
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
