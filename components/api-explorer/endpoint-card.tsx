"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <Card className="cursor-pointer hover:shadow-md transition-shadow border-gray-200 dark:border-transparent">
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
        <CardDescription>{endpoint.description}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge className={getMethodColor(endpoint.method)} variant="outline">
              {endpoint.method}
            </Badge>
            <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded flex-1">
              {endpoint.path}
            </code>
          </div>

          <div className="flex flex-wrap gap-1">
            {endpoint.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>

          {endpoint.rateLimit && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Rate limit: {endpoint.rateLimit.requests} requests per{" "}
              {endpoint.rateLimit.window}
            </div>
          )}

          <button
            onClick={() => onSelect(endpoint)}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Test Endpoint
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
