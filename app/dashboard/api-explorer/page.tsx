"use client";

import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookIcon,
  SearchIcon,
  KeyIcon,
  ShieldIcon,
  ActivityIcon,
  DatabaseIcon,
  MicIcon,
  AudioLinesIcon,
} from "lucide-react";
import { toast } from "@/lib/utils/toast-adapter";
import {
  BrandTabs,
  BrandTabsList,
  BrandTabsTrigger,
  BrandTabsContent,
  BrandCard,
  BrandButton,
  SectionLabel,
  CornerBrackets,
} from "@/components/brand";

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
      case "voice generation":
        return <MicIcon className="h-4 w-4" />;
      case "voice cloning":
        return <AudioLinesIcon className="h-4 w-4" />;
      case "models":
        return <DatabaseIcon className="h-4 w-4" />;
      default:
        return <BookIcon className="h-4 w-4" />;
    }
  };

  const getMethodColor = (method: string) => {
    const base = "rounded-none px-2.5 py-1 text-xs font-bold uppercase tracking-wide border";
    switch (method) {
      case "GET":
        return `${base} bg-emerald-500/20 text-emerald-400 border-emerald-500/40`;
      case "POST":
        return `${base} bg-blue-500/20 text-blue-400 border-blue-500/40`;
      case "PUT":
        return `${base} bg-amber-500/20 text-amber-400 border-amber-500/40`;
      case "DELETE":
        return `${base} bg-rose-500/20 text-rose-400 border-rose-500/40`;
      case "PATCH":
        return `${base} bg-violet-500/20 text-violet-400 border-violet-500/40`;
      default:
        return `${base} bg-white/10 text-white/60 border-white/20`;
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 px-4 pb-8 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:gap-8">
        <div className="lg:col-span-1">
          <BrandCard className="relative">
            <CornerBrackets size="sm" className="opacity-50" />
            
            <div className="relative z-10 space-y-6">
              <SectionLabel>Browse APIs</SectionLabel>

              <div className="relative">
                <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-white/40 pointer-events-none" />
                <input
                  placeholder="Search endpoints..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 pl-10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                />
              </div>

              <AuthManager authToken={authToken} onTokenChange={setAuthToken} />

              <div className="border-t border-white/10" />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF5800]" />
                  <h3 className="text-xs font-semibold uppercase text-white/50 tracking-wider">
                    Categories
                  </h3>
                </div>
                <div className="space-y-1">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-none px-3 py-2.5 text-left text-sm transition-all border-l-2",
                        selectedCategory === category
                          ? "bg-white/10 text-white border-[#FF5800]"
                          : "text-white/60 border-transparent hover:bg-white/5 hover:text-white",
                      )}
                    >
                      {category !== "All" && getCategoryIcon(category)}
                      {category}
                      <span className="ml-auto rounded-none bg-[#FF580020] px-2 py-0.5 text-[10px] font-semibold text-[#FF5800] border border-[#FF580040]">
                        {category === "All"
                          ? API_ENDPOINTS.length
                          : getEndpointsByCategory(category).length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </BrandCard>
        </div>

        <div className="lg:col-span-3">
          <BrandTabs defaultValue="endpoints" className="w-full space-y-6">
            <BrandTabsList className="w-full justify-start">
              <BrandTabsTrigger value="endpoints">Endpoints</BrandTabsTrigger>
              <BrandTabsTrigger value="schemas">Schemas</BrandTabsTrigger>
              <BrandTabsTrigger value="openapi">OpenAPI Spec</BrandTabsTrigger>
            </BrandTabsList>

            <BrandTabsContent value="endpoints">
              {selectedEndpoint ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <BrandButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedEndpoint(null)}
                      className="gap-1"
                    >
                      ← Back to endpoints
                    </BrandButton>
                    <div className="flex items-center gap-2">
                      <span className={getMethodColor(selectedEndpoint.method)}>
                        {selectedEndpoint.method}
                      </span>
                      <code className="rounded-none bg-black/60 border border-white/10 px-2 py-1 font-mono text-xs text-white">
                        {selectedEndpoint.path}
                      </code>
                    </div>
                  </div>

                  <BrandCard className="relative">
                    <CornerBrackets size="sm" className="opacity-50" />
                    
                    <div className="relative z-10 space-y-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          {getCategoryIcon(selectedEndpoint.category)}
                          <h3 className="text-lg font-bold text-white">{selectedEndpoint.name}</h3>
                        </div>
                        <p className="text-sm text-white/60">
                          {selectedEndpoint.description}
                        </p>
                      </div>
                      
                      <ApiTester
                        endpoint={selectedEndpoint}
                        authToken={authToken}
                      />
                    </div>
                  </BrandCard>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">
                      {selectedCategory === "All"
                        ? "All Endpoints"
                        : selectedCategory}
                      <span className="ml-2 text-sm font-normal text-white/50">
                        ({filteredEndpoints.length})
                      </span>
                    </h2>
                    {searchQuery && (
                      <BrandButton
                        variant="outline"
                        size="sm"
                        onClick={() => setSearchQuery("")}
                      >
                        Clear search
                      </BrandButton>
                    )}
                  </div>

                  <ScrollArea className="h-[600px] rounded-none border border-white/10 bg-black/40 p-4">
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
                    <div className="rounded-none border border-dashed border-white/10 py-12 text-center">
                      <SearchIcon className="mx-auto mb-4 h-12 w-12 text-white/30" />
                      <h3 className="text-lg font-semibold text-white">
                        No endpoints found
                      </h3>
                      <p className="text-sm text-white/60">
                        {searchQuery
                          ? `No endpoints match "${searchQuery}"`
                          : "No endpoints available in this category"}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </BrandTabsContent>

            <BrandTabsContent value="schemas">
              <SchemaViewer spec={openApiSpec} />
            </BrandTabsContent>

            <BrandTabsContent value="openapi">
              <BrandCard className="relative">
                <CornerBrackets size="sm" className="opacity-50" />
                
                <div className="relative z-10 space-y-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">
                      OpenAPI 3.0 Specification
                    </h3>
                    <p className="text-sm text-white/60">
                      Raw OpenAPI specification that can be imported into other tools
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <BrandButton
                      variant="primary"
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
                    </BrandButton>
                    <BrandButton
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
                    </BrandButton>
                  </div>

                  <ScrollArea className="h-[500px] rounded-none border border-white/10 bg-black/60">
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all p-4 text-xs font-mono text-white/70">
                      <code>
                        {openApiSpec
                          ? JSON.stringify(openApiSpec, null, 2)
                          : "Loading..."}
                      </code>
                    </pre>
                  </ScrollArea>
                </div>
              </BrandCard>
            </BrandTabsContent>
          </BrandTabs>
        </div>
      </div>
    </div>
  );
}
