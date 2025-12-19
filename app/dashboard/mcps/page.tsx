import { Suspense } from "react";
import { requireAuthWithOrg } from "@/lib/auth";
import { MCPsPageClient } from "@/components/mcps/mcps-page-client";
import { Puzzle, Server, Zap, Globe } from "lucide-react";
import { BrandCard, CornerBrackets } from "@/components/brand";

// Auth check requires cookies which makes this dynamic
// MCP server list is hardcoded but auth is dynamic
export const dynamic = "force-dynamic";

// Demo MCP servers available for users
const demoMcpServers = [
  {
    id: "eliza-cloud-mcp",
    name: "ElizaOS Cloud MCP",
    description:
      "Core ElizaOS Cloud platform MCP with credit management, AI generation, memory, conversations, and agent interaction capabilities.",
    endpoint: "/api/mcp",
    version: "1.0.0",
    category: "platform",
    status: "live" as const,
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
    name: "Time & Date MCP",
    description:
      "Get current time, timezone conversions, and date calculations. Perfect for scheduling and time-aware applications.",
    endpoint: "/api/mcp/demos/time",
    version: "1.0.0",
    category: "utilities",
    status: "live" as const,
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
    name: "Weather MCP",
    description:
      "Real-time weather data, forecasts, and alerts. Supports both credits and x402 micropayments.",
    endpoint: "/api/mcp/demos/weather",
    version: "1.0.0",
    category: "data",
    status: "live" as const,
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
    name: "Crypto Price MCP",
    description:
      "Real-time cryptocurrency prices, market data, and historical charts. Supports both credits and x402 payments.",
    endpoint: "/api/mcp/demos/crypto",
    version: "1.0.0",
    category: "finance",
    status: "live" as const,
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
 * MCP Servers page displaying available Model Context Protocol servers.
 * Shows statistics (total MCPs, live servers, x402 enabled, total tools) and server cards.
 *
 * @returns The rendered MCP servers page with statistics and server explorer.
 */
export default async function MCPsPage() {
  const user = await requireAuthWithOrg();

  const stats = {
    total: demoMcpServers.length,
    live: demoMcpServers.filter((s) => s.status === "live").length,
    x402Enabled: demoMcpServers.filter((s) => s.x402Enabled).length,
    totalTools: demoMcpServers.reduce((acc, s) => acc + s.toolCount, 0),
  };

  return (
    <div className="max-w-7xl mx-auto py-10 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "#FF5800" }}
            />
            <h1
              className="text-4xl font-normal tracking-tight text-white"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              MCP Servers
            </h1>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <BrandCard corners={false} className="pt-6 shadow-md shadow-black/30">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-none bg-[#FF5800]/20 border border-[#FF5800]/40">
              <Puzzle className="h-4 w-4 text-[#FF5800]" />
            </div>
          </div>
          <div>
            <p
              className="text-xs font-medium text-white/60 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Total MCPs
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
      </div>

      {/* Info Card */}
      <BrandCard className="relative shadow-lg shadow-black/50">
        <CornerBrackets size="sm" className="opacity-50" />
        <div className="relative z-10 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Puzzle className="h-5 w-5 text-[#FF5800]" />
              <h3
                className="text-lg font-normal text-white"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                What is MCP?
              </h3>
            </div>
            <p className="text-sm text-white/60">
              The Model Context Protocol (MCP) is an open standard that enables
              AI assistants to securely connect with data sources and tools.
              These MCP servers are hosted on Vercel serverless functions and
              provide ready-to-use tools for your AI agents.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-white/60">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span>Serverless & Scalable</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span>x402 Micropayments</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>SSE & HTTP Transport</span>
            </div>
          </div>
        </div>
      </BrandCard>

      {/* MCP Explorer */}
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
        <MCPsPageClient servers={demoMcpServers} />
      </Suspense>
    </div>
  );
}
