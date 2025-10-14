"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  BookIcon,
  SearchIcon,
  KeyIcon,
  ShieldIcon,
  ActivityIcon,
  DatabaseIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/utils/toast-adapter";

import {
  API_ENDPOINTS,
  getEndpointsByCategory,
  getAvailableCategories,
  searchEndpoints,
  type ApiEndpoint,
} from "@/lib/swagger/endpoint-discovery";
import {
  generateOpenAPISpec,
  type OpenAPISpec,
} from "@/lib/swagger/openapi-generator";

import { EndpointCard } from "@/components/api-explorer/endpoint-card";
import { ApiTester } from "@/components/api-explorer/api-tester";
import { AuthManager } from "@/components/api-explorer/auth-manager";
import { SchemaViewer } from "@/components/api-explorer/schema-viewer";
import { cn } from "@/lib/utils";
import { useSetPageHeader } from "@/components/layout/page-header-context";

export default function ApiExplorerPage() {
  useSetPageHeader({
    title: "API Explorer",
    description:
      "Interactive API documentation and testing interface for Eliza Cloud V2",
  });

  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [openApiSpec, setOpenApiSpec] = useState<OpenAPISpec | null>(null);
  const [authToken, setAuthToken] = useState<string>("");

  const categories = ["All", ...getAvailableCategories()];
  const filteredEndpoints = searchQuery
    ? searchEndpoints(searchQuery)
    : selectedCategory === "All"
      ? API_ENDPOINTS
      : getEndpointsByCategory(selectedCategory);

  useEffect(() => {
    try {
      const spec = generateOpenAPISpec(
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
      );
      setOpenApiSpec(spec);
    } catch {
      toast({
        message: "Failed to generate API specification",
        mode: "error",
      });
    }
  }, []);

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case "authentication":
        return <ShieldIcon className="h-4 w-4" />;
      case "api keys":
        return <KeyIcon className="h-4 w-4" />;
      case "ai generation":
      case "ai completions":
      case "image generation":
      case "video generation":
        return <ActivityIcon className="h-4 w-4" />;
      case "models":
        return <DatabaseIcon className="h-4 w-4" />;
      default:
        return <BookIcon className="h-4 w-4" />;
    }
  };

  const getMethodColor = (method: string) => {
    const base =
      "ring-1 ring-inset rounded-full px-2.5 py-1 text-xs font-medium";
    switch (method) {
      case "GET":
        return `${base} bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300`;
      case "POST":
        return `${base} bg-blue-500/10 text-blue-600 ring-blue-500/30 dark:text-blue-300`;
      case "PUT":
        return `${base} bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-300`;
      case "DELETE":
        return `${base} bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:text-rose-300`;
      case "PATCH":
        return `${base} bg-violet-500/10 text-violet-600 ring-violet-500/30 dark:text-violet-300`;
      default:
        return `${base} bg-muted text-muted-foreground`;
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 px-4 pb-8 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:gap-8">
        <div className="lg:col-span-1">
          <Card className="border-border/70 bg-background/60 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold">
                Browse APIs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                <Input
                  placeholder="Search endpoints..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <AuthManager authToken={authToken} onTokenChange={setAuthToken} />

              <Separator />

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground/80">
                  Categories
                </h3>
                <div className="space-y-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        selectedCategory === category
                          ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {category !== "All" && getCategoryIcon(category)}
                      {category}
                      <Badge variant="outline" className="ml-auto rounded-full">
                        {category === "All"
                          ? API_ENDPOINTS.length
                          : getEndpointsByCategory(category).length}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Tabs defaultValue="endpoints" className="w-full space-y-6">
            <TabsList className="w-full justify-start rounded-lg bg-muted/80 p-1">
              <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
              <TabsTrigger value="schemas">Schemas</TabsTrigger>
              <TabsTrigger value="openapi">OpenAPI Spec</TabsTrigger>
            </TabsList>

            <TabsContent value="endpoints">
              {selectedEndpoint ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedEndpoint(null)}
                      className="gap-1 rounded-full text-xs"
                    >
                      ← Back to endpoints
                    </Button>
                    <div className="flex items-center gap-2">
                      <span className={getMethodColor(selectedEndpoint.method)}>
                        {selectedEndpoint.method}
                      </span>
                      <code className="rounded-lg bg-muted px-2 py-1 font-mono text-xs">
                        {selectedEndpoint.path}
                      </code>
                    </div>
                  </div>

                  <Card className="border-border/70 bg-background/60 shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {getCategoryIcon(selectedEndpoint.category)}
                        {selectedEndpoint.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {selectedEndpoint.description}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <ApiTester
                        endpoint={selectedEndpoint}
                        authToken={authToken}
                      />
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">
                      {selectedCategory === "All"
                        ? "All Endpoints"
                        : selectedCategory}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({filteredEndpoints.length})
                      </span>
                    </h2>
                    {searchQuery && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSearchQuery("")}
                      >
                        Clear search
                      </Button>
                    )}
                  </div>

                  <ScrollArea className="h-[600px] rounded-xl border border-border/60 bg-background/60 p-4">
                    <div className="space-y-4">
                      {filteredEndpoints.map((endpoint) => (
                        <EndpointCard
                          key={endpoint.id}
                          endpoint={endpoint}
                          onSelect={setSelectedEndpoint}
                          getMethodColor={getMethodColor}
                          getCategoryIcon={getCategoryIcon}
                        />
                      ))}
                    </div>
                  </ScrollArea>

                  {filteredEndpoints.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/60 py-12 text-center">
                      <SearchIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/60" />
                      <h3 className="text-lg font-semibold text-foreground">
                        No endpoints found
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {searchQuery
                          ? `No endpoints match "${searchQuery}"`
                          : "No endpoints available in this category"}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="schemas">
              <SchemaViewer spec={openApiSpec} />
            </TabsContent>

            <TabsContent value="openapi">
              <Card className="border-border/70 bg-background/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">
                    OpenAPI 3.0 Specification
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Raw OpenAPI specification that can be imported into other
                    tools
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (openApiSpec) {
                            navigator.clipboard.writeText(
                              JSON.stringify(openApiSpec, null, 2),
                            );
                            toast({
                              message: "OpenAPI spec copied to clipboard",
                              mode: "success",
                            });
                          }
                        }}
                      >
                        Copy JSON
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (openApiSpec) {
                            const { generateOpenAPIYAML } = await import(
                              "@/lib/swagger/openapi-generator"
                            );
                            const yaml = generateOpenAPIYAML();
                            navigator.clipboard.writeText(yaml);
                            toast({
                              message: "OpenAPI YAML copied to clipboard",
                              mode: "success",
                            });
                          }
                        }}
                      >
                        Copy YAML
                      </Button>
                    </div>

                    <ScrollArea className="h-[500px] rounded-xl border border-border/60 bg-muted/40">
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all p-4 text-xs font-mono text-muted-foreground">
                        <code>
                          {openApiSpec
                            ? JSON.stringify(openApiSpec, null, 2)
                            : "Loading..."}
                        </code>
                      </pre>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
