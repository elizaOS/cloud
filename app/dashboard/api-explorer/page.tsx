"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

export default function ApiExplorerPage() {
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
    switch (method) {
      case "GET":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "POST":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "PUT":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "DELETE":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "PATCH":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">API Explorer</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Interactive API documentation and testing interface for Eliza Cloud V2
        </p>

        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <BookIcon className="h-4 w-4" />
            {API_ENDPOINTS.length} endpoints
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <DatabaseIcon className="h-4 w-4" />
            {categories.length - 1} categories
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <Card className="border-gray-200 dark:border-transparent">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Browse APIs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search endpoints..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <AuthManager
                authToken={authToken}
                onTokenChange={setAuthToken}
              />

              <Separator />

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Categories</h3>
                <div className="space-y-1">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-lg transition-colors ${
                        selectedCategory === category
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      {category !== "All" && getCategoryIcon(category)}
                      {category}
                      <Badge variant="secondary" className="ml-auto">
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
          <Tabs defaultValue="endpoints" className="w-full">
            <TabsList>
              <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
              <TabsTrigger value="schemas">Schemas</TabsTrigger>
              <TabsTrigger value="openapi">OpenAPI Spec</TabsTrigger>
            </TabsList>

            <TabsContent value="endpoints">
              {selectedEndpoint ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setSelectedEndpoint(null)}
                      className="text-sm px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      ← Back to endpoints
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge className={getMethodColor(selectedEndpoint.method)}>
                        {selectedEndpoint.method}
                      </Badge>
                      <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                        {selectedEndpoint.path}
                      </code>
                    </div>
                  </div>

                  <Card className="border-gray-200 dark:border-transparent">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {getCategoryIcon(selectedEndpoint.category)}
                        {selectedEndpoint.name}
                      </CardTitle>
                      <p className="text-gray-600 dark:text-gray-400">
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
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">
                      {selectedCategory === "All"
                        ? "All Endpoints"
                        : selectedCategory}
                      <span className="text-gray-500 ml-2">
                        ({filteredEndpoints.length})
                      </span>
                    </h2>
                    {searchQuery && (
                      <button
                        className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => setSearchQuery("")}
                      >
                        Clear search
                      </button>
                    )}
                  </div>

                  <ScrollArea className="h-[600px]">
                    <div className="space-y-3">
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
                    <div className="text-center py-12">
                      <SearchIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                        No endpoints found
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400">
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
              <Card className="border-gray-200 dark:border-transparent">
                <CardHeader>
                  <CardTitle>OpenAPI 3.0 Specification</CardTitle>
                  <p className="text-gray-600 dark:text-gray-400">
                    Raw OpenAPI specification that can be imported into other
                    tools
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <button
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
                      </button>
                      <button
                        className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
                      </button>
                    </div>

                    <ScrollArea className="h-[500px]">
                      <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
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
