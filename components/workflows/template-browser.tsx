"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Sparkles,
  TrendingUp,
  CheckCircle,
  Clock,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Workflow template for display
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  userIntent: string;
  serviceDependencies: string[];
  category: string;
  usageCount: number;
  successRate: string | null;
  isSystem: boolean;
  isPublic: boolean;
}

interface TemplateBrowserProps {
  onSelect: (template: WorkflowTemplate) => void;
  className?: string;
}

/**
 * Get color classes for service badges
 */
function getServiceBadgeColor(service: string): string {
  const colors: Record<string, string> = {
    google: "bg-red-500/10 text-red-400 border-red-500/30",
    twilio: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    blooio: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    notion: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
    telegram: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  };
  return colors[service] || "bg-muted text-muted-foreground";
}

/**
 * Template card component
 */
function TemplateCard({
  template,
  onSelect,
}: {
  template: WorkflowTemplate;
  onSelect: () => void;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer hover:border-primary/50 transition-all",
        "group relative overflow-hidden",
      )}
      onClick={onSelect}
    >
      {/* System/Popular badge */}
      {(template.isSystem || template.usageCount >= 10) && (
        <div className="absolute top-2 right-2">
          {template.isSystem ? (
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              System
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
              <TrendingUp className="h-3 w-3 mr-1" />
              Popular
            </Badge>
          )}
        </div>
      )}

      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold truncate pr-16">
          {template.name}
        </CardTitle>
        <CardDescription className="line-clamp-2">
          {template.description || template.userIntent}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Service dependencies */}
        <div className="flex flex-wrap gap-1">
          {template.serviceDependencies.map((service) => (
            <Badge
              key={service}
              variant="outline"
              className={cn("text-xs px-1.5 py-0", getServiceBadgeColor(service))}
            >
              {service}
            </Badge>
          ))}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{template.usageCount} uses</span>
          </div>
          {template.successRate && (
            <div className="flex items-center gap-1 text-green-400">
              <CheckCircle className="h-3 w-3" />
              <span>{Number.parseFloat(template.successRate).toFixed(0)}%</span>
            </div>
          )}
        </div>

        {/* Hover action */}
        <Button
          size="sm"
          className="w-full opacity-0 group-hover:opacity-100 transition-opacity"
          variant="secondary"
        >
          <Copy className="h-4 w-4 mr-2" />
          Use This Template
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Template browser skeleton for loading state
 */
function TemplateBrowserSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full mt-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-12" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Template Browser Component
 *
 * Allows users to browse and search workflow templates.
 * Templates can be selected to use as a starting point for new workflows.
 */
export function TemplateBrowser({ onSelect, className }: TemplateBrowserProps) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates on mount
  useEffect(() => {
    async function fetchTemplates() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/v1/templates");
        if (!response.ok) {
          throw new Error("Failed to fetch templates");
        }

        const data = await response.json();
        setTemplates(data.templates || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load templates");
      } finally {
        setIsLoading(false);
      }
    }

    fetchTemplates();
  }, []);

  // Filter templates based on search
  const filteredTemplates = templates.filter((template) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      template.name.toLowerCase().includes(searchLower) ||
      template.description.toLowerCase().includes(searchLower) ||
      template.userIntent.toLowerCase().includes(searchLower) ||
      template.serviceDependencies.some((s) => s.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Loading state */}
      {isLoading && <TemplateBrowserSkeleton />}

      {/* Error state */}
      {error && (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !error && filteredTemplates.length === 0 && (
        <Card className="p-6 text-center">
          <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">No Templates Found</h3>
          <p className="text-sm text-muted-foreground">
            {search
              ? "Try a different search term"
              : "Templates will appear here as workflows are created and proven reliable."}
          </p>
        </Card>
      )}

      {/* Templates grid - single column in constrained contexts like dialogs */}
      {!isLoading && !error && filteredTemplates.length > 0 && (
        <div className="space-y-3 overflow-y-auto">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onSelect={() => onSelect(template)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
