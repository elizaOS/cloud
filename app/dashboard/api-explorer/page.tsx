"use client";

import {
  BrandButton,
  BrandCard,
  BrandTabs,
  BrandTabsContent,
  BrandTabsList,
  BrandTabsTrigger,
  CornerBrackets,
  SectionLabel,
} from "@/components/brand";
import { toast } from "@/lib/utils/toast-adapter";
import {
  ActivityIcon,
  AudioLinesIcon,
  BookIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DatabaseIcon,
  KeyIcon,
  MenuIcon,
  MicIcon,
  SearchIcon,
  ShieldIcon,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  API_ENDPOINTS,
  getAvailableCategories,
  getEndpointsByCategory,
  searchEndpoints,
  type ApiEndpoint,
} from "@/lib/swagger/endpoint-discovery";
import {
  generateOpenAPISpec,
  type OpenAPISpec,
} from "@/lib/swagger/openapi-generator";

import { ApiTester } from "@/components/api-explorer/api-tester";
import { AuthManager } from "@/components/api-explorer/auth-manager";
import { EndpointCard } from "@/components/api-explorer/endpoint-card";
import { SchemaViewer } from "@/components/api-explorer/schema-viewer";
import { OpenApiViewer } from "@/components/api-explorer/openapi-viewer";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { cn } from "@/lib/utils";

const categoryDescriptions: Record<string, string> = {
  All: "Explore the complete set of API endpoints available in the Eliza platform. Use these endpoints to build agents, manage memory, and integrate AI capabilities into your applications.",
  Authentication: "Securely authenticate users and manage access tokens. These endpoints handle login, registration, and session management.",
  Agents: "Create, configure, and manage your AI agents. Control their behavior, personality, and interaction styles.",
  Memories: "Access and manipulate agent memory systems. Store, retrieve, and search through long-term and short-term memories.",
  Documents: "Upload and process documents for RAG (Retrieval-Augmented Generation). Manage the knowledge base your agents use.",
  Chat: "Interact with agents via chat interfaces. Send messages and receive streaming responses.",
  Usage: "Track API usage, quotas, and billing information.",
};

export default function ApiExplorerPage() {
  useSetPageHeader({
    title: "API Explorer",
    description:
      "Interactive API documentation and testing interface for Eliza Cloud V2",
  });

  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [openApiSpec, setOpenApiSpec] = useState<OpenAPISpec | null>(null);
  const [authToken, setAuthToken] = useState<string>("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const categories = ["All", ...getAvailableCategories()];
  const filteredEndpoints = searchQuery
    ? searchEndpoints(searchQuery)
    : selectedCategory === "All"
      ? API_ENDPOINTS
      : getEndpointsByCategory(selectedCategory);

  useEffect(() => {
    try {
      const spec = generateOpenAPISpec(
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
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
    const base =
      "rounded-none px-2.5 py-1 text-xs font-bold uppercase tracking-wide border";
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
    <div className="relative flex flex-col lg:flex-row w-full gap-6 px-4 pb-8 lg:px-8">
      {/* Mobile Backdrop Overlay */}
      {showMobileSidebar && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* Mobile Sidebar Toggle Button */}
      <button
        onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        className="lg:hidden fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full border-2 border-[#FF5800] bg-black shadow-lg shadow-[#FF5800]/20 text-white hover:bg-[#FF5800] transition-colors"
        title={showMobileSidebar ? "Hide filters" : "Show filters"}
      >
        {showMobileSidebar ? (
          <ChevronRightIcon className="h-6 w-6" />
        ) : (
          <MenuIcon className="h-6 w-6" />
        )}
      </button>

      {/* Main Content */}
      <main className="flex-1 min-w-0 w-full lg:w-auto flex flex-col pb-12">
        <BrandTabs defaultValue="endpoints" className="flex flex-col">
          <BrandTabsList className="w-full justify-start shrink-0 mb-6">
            <BrandTabsTrigger value="endpoints">Endpoints</BrandTabsTrigger>
            <BrandTabsTrigger value="schemas">Schemas</BrandTabsTrigger>
            <BrandTabsTrigger value="openapi">OpenAPI Spec</BrandTabsTrigger>
          </BrandTabsList>

          <BrandTabsContent value="endpoints" className="mt-0">
            {selectedEndpoint ? (
              <div className="flex flex-col space-y-6">
                <div className="flex items-center justify-between shrink-0">
                  <BrandButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEndpoint(null)}
                    className="gap-1"
                  >
                    ← Back to endpoints
                  </BrandButton>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={getMethodColor(selectedEndpoint.method)}>
                      {selectedEndpoint.method}
                    </span>
                    <code className="rounded-none bg-black/60 border border-white/10 px-2 py-1 font-mono text-xs text-white break-all">
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
                        <h3 className="text-lg font-bold text-white">
                          {selectedEndpoint.name}
                        </h3>
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
              <div className="flex flex-col space-y-6">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between shrink-0 flex-wrap gap-4">
                      <h2 className="text-xl font-semibold text-white flex items-center">
                        {selectedCategory === "All"
                          ? "All Endpoints"
                          : selectedCategory}
                        <span className="ml-2 text-sm font-normal text-white/50">
                          ({filteredEndpoints.length})
                        </span>
                      </h2>
                      <div className="relative w-full sm:w-72">
                        <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-white/40 pointer-events-none" />
                        <input
                          placeholder="Search endpoints..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 pl-10 pr-10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                        />
                        {searchQuery && (
                          <X
                            className="absolute right-3 top-3 h-4 w-4 text-white cursor-pointer transition-colors hover:text-[#FF5800]"
                            onClick={() => setSearchQuery("")}
                          />
                        )}
                      </div>
                    </div>
                    
                    {!searchQuery && (
                        <p className="text-white/60 max-w-4xl text-sm leading-relaxed">
                            {categoryDescriptions[selectedCategory] || `Browse and test ${selectedCategory} endpoints.`}
                        </p>
                    )}
                </div>

                {filteredEndpoints.length === 0 ? (
                  <div className="flex items-center justify-center rounded-none border border-dashed border-white/10 bg-black/20 py-24">
                    <div className="text-center">
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
                  </div>
                ) : (
                  <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
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
                )}
              </div>
            )}
          </BrandTabsContent>

          <BrandTabsContent value="schemas" className="mt-0">
            <SchemaViewer spec={openApiSpec} />
          </BrandTabsContent>

          <BrandTabsContent value="openapi" className="mt-0">
            <BrandCard className="relative">
              <CornerBrackets size="sm" className="opacity-50" />

              <div className="relative z-10 space-y-4">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    OpenAPI 3.0 Specification
                  </h3>
                  <p className="text-sm text-white/60">
                    Raw OpenAPI specification that can be imported into other
                    tools
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <BrandButton
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      if (openApiSpec) {
                        navigator.clipboard.writeText(
                          JSON.stringify(openApiSpec, null, 2)
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
                        const { generateOpenAPIYAML } =
                          await import("@/lib/swagger/openapi-generator");
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

                {openApiSpec ? (
                  <OpenApiViewer value={JSON.stringify(openApiSpec, null, 2)} />
                ) : (
                  <div className="rounded-none border border-white/10 bg-black/60 p-8 text-center">
                    <p className="text-white/60">Loading specification...</p>
                  </div>
                )}
              </div>
            </BrandCard>
          </BrandTabsContent>
        </BrandTabs>
      </main>
    </div>
  );
}
