import { Suspense } from "react";
import { requireAuthWithOrg } from "@/lib/auth";
import { ServicesMarketplace } from "@/components/services/services-marketplace";
import { userMcpsService } from "@/lib/services/user-mcps";
import { Puzzle, Server, Zap, Globe, Plus } from "lucide-react";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Demo services available for all users
const demoServices = [
  {
    id: "eliza-cloud-mcp",
    name: "ElizaOS Cloud MCP",
    description:
      "Core ElizaOS Cloud platform MCP with credit management, AI generation, memory, conversations, and agent interaction capabilities.",
    endpoint: "/api/mcp",
    version: "1.0.0",
    category: "platform",
    status: "live" as const,
    source: "demo" as const,
    protocols: ["mcp"] as ("mcp" | "a2a" | "rest")[],
    pricing: {
      type: "credits" as const,
      description: "Pay-per-use with credits",
    },
    x402Enabled: false,
    toolCount: 20,
    icon: "puzzle",
    color: "#FF5800",
    features: [
      "Credit Management",
      "AI Text Generation",
      "Image Generation",
      "Memory Storage",
      "Agent Chat",
    ],
  },
  {
    id: "time-mcp",
    name: "Time & Date Service",
    description:
      "Get current time, timezone conversions, and date calculations. Perfect for scheduling and time-aware applications.",
    endpoint: "/api/mcp/demos/time",
    version: "1.0.0",
    category: "utilities",
    status: "live" as const,
    source: "demo" as const,
    protocols: ["mcp", "rest"] as ("mcp" | "a2a" | "rest")[],
    pricing: {
      type: "credits" as const,
      description: "1 credit per request",
    },
    x402Enabled: false,
    toolCount: 4,
    icon: "clock",
    color: "#3B82F6",
    features: [
      "Current Time",
      "Timezone Conversion",
      "Date Formatting",
      "Time Calculations",
    ],
  },
  {
    id: "weather-mcp",
    name: "Weather Service",
    description:
      "Real-time weather data, forecasts, and alerts. Supports both credits and x402 micropayments.",
    endpoint: "/api/mcp/demos/weather",
    version: "1.0.0",
    category: "data",
    status: "live" as const,
    source: "demo" as const,
    protocols: ["mcp", "rest", "a2a"] as ("mcp" | "a2a" | "rest")[],
    pricing: {
      type: "credits" as const,
      description: "1-3 credits per request (or x402)",
    },
    x402Enabled: true,
    toolCount: 3,
    icon: "cloud",
    color: "#06B6D4",
    features: ["Current Weather", "5-Day Forecast", "Weather Alerts"],
  },
  {
    id: "crypto-mcp",
    name: "Crypto Price Service",
    description:
      "Real-time cryptocurrency prices, market data, and historical charts. Supports both credits and x402 payments.",
    endpoint: "/api/mcp/demos/crypto",
    version: "1.0.0",
    category: "finance",
    status: "live" as const,
    source: "demo" as const,
    protocols: ["mcp", "rest"] as ("mcp" | "a2a" | "rest")[],
    pricing: {
      type: "credits" as const,
      description: "1-3 credits per request (or x402)",
    },
    x402Enabled: true,
    toolCount: 5,
    icon: "coins",
    color: "#F59E0B",
    features: [
      "Live Prices",
      "Market Cap Data",
      "Price History",
      "Token Info",
      "Multi-chain Support",
    ],
  },
];

/**
 * Services Marketplace page displaying available services.
 * Shows MCP, A2A, and REST services from demo, user, and public sources.
 * Replaces the old MCPs page with a unified services concept.
 */
export default async function ServicesPage() {
  const user = await requireAuthWithOrg();

  // Fetch user's own services
  const userServices = await userMcpsService.listByOrganization(
    user.organization_id
  );

  // Transform user MCPs to marketplace format
  const formattedUserServices = userServices.map((mcp) => ({
    id: mcp.id,
    name: mcp.name,
    description: mcp.description,
    endpoint:
      mcp.endpoint_type === "external" && mcp.external_endpoint
        ? mcp.external_endpoint
        : `/api/mcp/${mcp.slug}`,
    version: mcp.version,
    category: mcp.category,
    status: mcp.status as "live" | "draft" | "coming_soon",
    source: "user" as const,
    protocols: ["mcp"] as ("mcp" | "a2a" | "rest")[],
    pricing: {
      type: mcp.pricing_type as "free" | "credits" | "x402",
      description:
        mcp.pricing_type === "free"
          ? "Free"
          : `${mcp.credits_per_request} credits per request`,
    },
    x402Enabled: mcp.x402_enabled,
    toolCount: mcp.tools?.length ?? 0,
    icon: mcp.icon ?? "puzzle",
    color: mcp.color ?? "#6366F1",
    features: (mcp.tools ?? []).map((tool) => tool.name),
    creator: {
      id: user.id,
      name: user.name ?? "You",
    },
  }));

  // Combine all services
  const allServices = [...demoServices, ...formattedUserServices];

  // Calculate stats
  const stats = {
    total: allServices.length,
    live: allServices.filter((s) => s.status === "live").length,
    x402Enabled: allServices.filter((s) => s.x402Enabled).length,
    totalTools: allServices.reduce((acc, s) => acc + s.toolCount, 0),
    myServices: formattedUserServices.length,
  };

  return (
    <div className="max-w-7xl mx-auto py-10 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "#06B6D4" }}
            />
            <h1
              className="text-4xl font-normal tracking-tight text-white"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Services
            </h1>
          </div>
          <p className="text-white/60 mt-2">
            Discover and connect MCP, A2A, and REST services for your apps and
            agents
          </p>
        </div>
        <Link href="/dashboard/services/create">
          <BrandButton variant="primary">
            <Plus className="h-4 w-4 mr-2" />
            Create Service
          </BrandButton>
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <BrandCard corners={false} className="pt-6 shadow-md shadow-black/30">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-none bg-cyan-500/20 border border-cyan-500/40">
              <Puzzle className="h-4 w-4 text-cyan-400" />
            </div>
          </div>
          <div>
            <p
              className="text-xs font-medium text-white/60 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Total Services
            </p>
            <p
              className="text-3xl font-medium mt-1 text-white"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              {stats.total}
            </p>
          </div>
        </BrandCard>

        <BrandCard corners={false} className="pt-6 shadow-md shadow-black/30">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-none bg-green-500/20 border border-green-500/40">
              <Server className="h-4 w-4 text-green-400" />
            </div>
          </div>
          <div>
            <p
              className="text-xs font-medium text-white/60 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Live
            </p>
            <p
              className="text-3xl font-medium mt-1 text-green-400"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              {stats.live}
            </p>
          </div>
        </BrandCard>

        <BrandCard corners={false} className="pt-6 shadow-md shadow-black/30">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-none bg-purple-500/20 border border-purple-500/40">
              <Zap className="h-4 w-4 text-purple-400" />
            </div>
          </div>
          <div>
            <p
              className="text-xs font-medium text-white/60 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              x402 Enabled
            </p>
            <p
              className="text-3xl font-medium mt-1 text-purple-400"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              {stats.x402Enabled}
            </p>
          </div>
        </BrandCard>

        <BrandCard corners={false} className="pt-6 shadow-md shadow-black/30">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-none bg-blue-500/20 border border-blue-500/40">
              <Globe className="h-4 w-4 text-blue-400" />
            </div>
          </div>
          <div>
            <p
              className="text-xs font-medium text-white/60 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Total Tools
            </p>
            <p
              className="text-3xl font-medium mt-1 text-blue-400"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              {stats.totalTools}
            </p>
          </div>
        </BrandCard>

        <BrandCard corners={false} className="pt-6 shadow-md shadow-black/30">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-none bg-orange-500/20 border border-orange-500/40">
              <Puzzle className="h-4 w-4 text-orange-400" />
            </div>
          </div>
          <div>
            <p
              className="text-xs font-medium text-white/60 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              My Services
            </p>
            <p
              className="text-3xl font-medium mt-1 text-orange-400"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              {stats.myServices}
            </p>
          </div>
        </BrandCard>
      </div>

      {/* Info Card */}
      <BrandCard className="relative shadow-lg shadow-black/50">
        <CornerBrackets size="sm" className="opacity-50" />
        <div className="relative z-10 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Puzzle className="h-5 w-5 text-cyan-400" />
              <h3
                className="text-lg font-normal text-white"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                What are Services?
              </h3>
            </div>
            <p className="text-sm text-white/60">
              Services are reusable tools and APIs that your agents and apps can
              connect to. They support multiple protocols including MCP (Model
              Context Protocol), A2A (Agent-to-Agent), and REST APIs. Create
              your own services or use the marketplace to discover pre-built
              integrations.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-white/60">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>MCP Protocol</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>A2A (Agent-to-Agent)</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span>REST APIs</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span>x402 Micropayments</span>
            </div>
          </div>
        </div>
      </BrandCard>

      {/* Services Marketplace */}
      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-64 bg-black/40 border border-white/10 animate-pulse"
              />
            ))}
          </div>
        }
      >
        <ServicesMarketplace
          services={allServices}
          userOrganizationId={user.organization_id}
        />
      </Suspense>
    </div>
  );
}

