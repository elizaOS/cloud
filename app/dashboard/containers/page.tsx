import { Suspense } from "react";
import { requireAuthWithOrg } from "@/lib/auth";
import { listContainers } from "@/lib/services";
import { ContainersTable } from "@/components/containers/containers-table";
import { ContainersSkeleton } from "@/components/containers/containers-skeleton";
import { Terminal, Server, TrendingUp, Activity, User, Building2 } from "lucide-react";
import { BrandCard, CornerBrackets } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function ContainersPage() {
  const user = await requireAuthWithOrg();
  const containers = await listContainers(user.organization_id);

  const stats = {
    total: containers.length,
    running: containers.filter((c) => c.status === "running").length,
    stopped: containers.filter((c) => c.status === "stopped").length,
    failed: containers.filter((c) => c.status === "failed").length,
    building: containers.filter(
      (c) =>
        c.status === "building" ||
        c.status === "deploying" ||
        c.status === "pending",
    ).length,
  };

  return (
    <div className="bg-[#0a0a0a] rounded-[16px] p-[24px] flex flex-col gap-[16px]">
      {/* Header */}
      <div className="flex flex-col gap-[32px]">
        <div className="flex flex-col gap-[24px]">
          <div className="flex items-end justify-between w-full">
            <div className="flex flex-col gap-[8px] w-[455px]">
              <div className="flex gap-[16px] items-start w-full">
                <p
                  className="text-[#e1e1e1]"
                  style={{
                    fontFamily: "var(--font-roboto-mono)",
                    fontSize: "24px",
                    fontWeight: 500,
                    lineHeight: "normal",
                  }}
                >
                  Infrastructure
                </p>
              </div>
              <p
                className="text-[#858585] w-full whitespace-pre-wrap"
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontSize: "16px",
                  fontWeight: 400,
                  lineHeight: "normal",
                }}
              >
                Explore Agents that you have created or saved
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-col gap-[20px] items-start">
            <div className="border-t border-l border-[#252527] inline-flex items-start">
              {/* Containers Tab - Active */}
              <button className="bg-[rgba(255,255,255,0.07)] border-b-2 border-white flex gap-[8px] items-center justify-center px-[24px] py-[12px] cursor-default">
                <User className="h-4 w-4 text-white" />
                <div className="flex gap-[16px] items-center">
                  <div className="flex gap-[8px] items-center">
                    <p
                      className="text-white"
                      style={{
                        fontFamily: "var(--font-roboto-mono)",
                        fontSize: "14px",
                        fontWeight: 500,
                        lineHeight: "normal",
                        letterSpacing: "-0.056px",
                      }}
                    >
                      Containers
                    </p>
                  </div>
                </div>
              </button>
              {/* Storage Tab - Inactive */}
              <button className="border-b border-r border-[#252527] flex gap-[8px] items-center justify-center px-[24px] py-[12px] hover:bg-[rgba(255,255,255,0.03)] transition-colors cursor-pointer">
                <Building2 className="h-4 w-4 text-[#a2a2a2]" />
                <div className="flex gap-[16px] items-center">
                  <div className="flex gap-[8px] items-center">
                    <p
                      className="text-[#a2a2a2]"
                      style={{
                        fontFamily: "var(--font-roboto-mono)",
                        fontSize: "14px",
                        fontWeight: 500,
                        lineHeight: "normal",
                        letterSpacing: "-0.056px",
                      }}
                    >
                      Storage
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {/* Stats Overview - Only show if there are containers */}
            {containers.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <BrandCard corners={false} className="pt-6 shadow-md shadow-black/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-none bg-blue-500/20 border border-blue-500/40">
                      <Server className="h-4 w-4 text-blue-400" />
                    </div>
                  </div>
                  <div>
                    <p
                      className="text-xs font-medium text-white/60 uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      Total Containers
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
                      <Activity className="h-4 w-4 text-green-400" />
                    </div>
                  </div>
                  <div>
                    <p
                      className="text-xs font-medium text-white/60 uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      Running
                    </p>
                    <p
                      className="text-3xl font-medium mt-1 text-green-400"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      {stats.running}
                    </p>
                  </div>
                </BrandCard>

                <BrandCard corners={false} className="pt-6 shadow-md shadow-black/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-none bg-yellow-500/20 border border-yellow-500/40">
                      <TrendingUp className="h-4 w-4 text-yellow-400" />
                    </div>
                  </div>
                  <div>
                    <p
                      className="text-xs font-medium text-white/60 uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      Building
                    </p>
                    <p
                      className="text-3xl font-medium mt-1 text-yellow-400"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      {stats.building}
                    </p>
                  </div>
                </BrandCard>

                <BrandCard corners={false} className="pt-6 shadow-md shadow-black/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-none bg-rose-500/20 border border-rose-500/40">
                      <Activity className="h-4 w-4 text-rose-400" />
                    </div>
                  </div>
                  <div>
                    <p
                      className="text-xs font-medium text-white/60 uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      Issues
                    </p>
                    <p
                      className="text-3xl font-medium mt-1 text-rose-400"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      {stats.failed}
                    </p>
                  </div>
                </BrandCard>
              </div>
            )}

            {/* Quick Start Card - Show prominently when no containers exist */}
            {containers.length === 0 ? (
              <div className="bg-[#0a0a0a] border border-[#252527] p-[24px] relative w-full">
                {/* Corner Brackets */}
                <div className="absolute left-0 top-0 w-4 h-4">
                  <div className="absolute left-0 top-0 w-4 h-[1px] bg-white" />
                  <div className="absolute left-0 top-0 w-[1px] h-4 bg-white" />
                </div>
                <div className="absolute right-0 top-0 w-4 h-4">
                  <div className="absolute right-0 top-0 w-4 h-[1px] bg-white" />
                  <div className="absolute right-0 top-0 w-[1px] h-4 bg-white" />
                </div>
                <div className="absolute left-0 bottom-0 w-4 h-4">
                  <div className="absolute left-0 bottom-0 w-4 h-[1px] bg-white" />
                  <div className="absolute left-0 bottom-0 w-[1px] h-4 bg-white" />
                </div>
                <div className="absolute right-0 bottom-0 w-4 h-4">
                  <div className="absolute right-0 bottom-0 w-4 h-[1px] bg-white" />
                  <div className="absolute right-0 bottom-0 w-[1px] h-4 bg-white" />
                </div>

                <div className="bg-[#0a0a0a] flex flex-col gap-[24px] w-full">
                  {/* Header */}
                  <div className="flex items-start justify-between w-full">
                    <div className="flex flex-col gap-[8px]">
                      <div className="flex gap-[8px] items-center">
                        <div className="w-[8px] h-[8px] rounded-full bg-[#FF5800]" />
                        <p
                          className="text-[#e1e1e1]"
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontSize: "20px",
                            fontWeight: 500,
                            lineHeight: "normal",
                          }}
                        >
                          Get started with ElizaOS
                        </p>
                      </div>
                      <p
                        className="text-[#858585]"
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "16px",
                          fontWeight: 400,
                          lineHeight: "normal",
                          letterSpacing: "-0.048px",
                        }}
                      >
                        Deploy your first ElizaOS container using the command line
                      </p>
                    </div>
                  </div>

                  {/* Code Blocks */}
                  <div className="flex flex-col gap-[24px] w-full">
                    <div className="flex flex-col gap-[16px] w-full">
                      <div className="flex flex-col w-full">
                        <div className="flex flex-col w-full">
                          <div className="flex gap-[32px] items-start w-full">
                            {/* First Code Block */}
                            <div className="backdrop-blur-sm backdrop-filter bg-[rgba(10,10,10,0.75)] border border-[#252527] flex-[1_0_0] min-h-px min-w-px">
                              <div className="flex flex-col items-start justify-center overflow-clip rounded-[inherit] w-full">
                                <div className="flex flex-col gap-[16px] items-start justify-center p-[16px] w-full">
                                  <div className="flex gap-[12px] items-center w-full">
                                    <div className="flex flex-[1_0_0] flex-col gap-[4px] items-start min-h-px min-w-px">
                                      <div className="flex flex-col gap-[4px] items-start justify-end w-full">
                                        <p
                                          className="text-[rgba(255,255,255,0.6)] w-full whitespace-pre-wrap"
                                          style={{
                                            fontFamily: "var(--font-roboto-mono)",
                                            fontSize: "16px",
                                            fontWeight: 400,
                                            lineHeight: "24px",
                                            letterSpacing: "-0.048px",
                                          }}
                                        >
                                          # Install ELizaOS CLI
                                        </p>
                                      </div>
                                      <div className="flex gap-[8px] items-center w-full">
                                        <div className="flex flex-[1_0_0] gap-[12px] items-center min-h-px min-w-px">
                                          <div className="flex gap-[8px] items-center">
                                            <p
                                              className="text-white"
                                              style={{
                                                fontFamily: "var(--font-roboto-mono)",
                                                fontSize: "16px",
                                                fontWeight: 400,
                                                lineHeight: "24px",
                                              }}
                                            >
                                              bun install -g @elizaos/cli
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Second Code Block */}
                          <div className="backdrop-blur-sm backdrop-filter bg-[rgba(10,10,10,0.75)] border border-[#252527] w-full">
                            <div className="flex flex-col items-start justify-center overflow-clip rounded-[inherit] w-full">
                              <div className="flex flex-col gap-[16px] items-start justify-center p-[16px] w-full">
                                <div className="flex gap-[12px] items-center w-full">
                                  <div className="flex flex-[1_0_0] flex-col gap-[4px] items-start min-h-px min-w-px">
                                    <div className="flex flex-col gap-[4px] items-start justify-end w-full">
                                      <p
                                        className="text-[rgba(255,255,255,0.6)] w-full whitespace-pre-wrap"
                                        style={{
                                          fontFamily: "var(--font-roboto-mono)",
                                          fontSize: "16px",
                                          fontWeight: 400,
                                          lineHeight: "24px",
                                          letterSpacing: "-0.048px",
                                        }}
                                      >
                                        # Deploy your project
                                      </p>
                                    </div>
                                    <div className="flex flex-col gap-[8px] items-start justify-center w-full">
                                      <div className="flex flex-col gap-[12px] items-start justify-center w-full">
                                        <div
                                          className="flex flex-col items-start justify-center text-white"
                                          style={{
                                            fontFamily: "var(--font-roboto-mono)",
                                            fontSize: "16px",
                                            fontWeight: 400,
                                            lineHeight: "24px",
                                          }}
                                        >
                                          <p>cd your-elizaos-project</p>
                                          <p>eliza deploy</p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p
                    className="text-[#858585]"
                    style={{
                      fontFamily: "var(--font-roboto-mono)",
                      fontSize: "14px",
                      fontWeight: 400,
                      lineHeight: "normal",
                      letterSpacing: "-0.042px",
                    }}
                  >
                    Once deployed, you&apos;ll be able to view deployment history, logs, and metrics for your container right here.
                  </p>
                </div>
              </div>
            ) : (
              <BrandCard className="relative shadow-lg shadow-black/50">
                <CornerBrackets size="sm" className="opacity-50" />
                <div className="relative z-10 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Terminal className="h-5 w-5 text-[#FF5800]" />
                      <h3
                        className="text-lg font-normal text-white"
                        style={{ fontFamily: "var(--font-roboto-mono)" }}
                      >
                        Deploy from CLI
                      </h3>
                    </div>
                    <p className="text-sm text-white/60">
                      Deploy additional ElizaOS projects using the command line
                    </p>
                  </div>
                  <div
                    className="bg-black/60 border border-white/10 p-4 rounded-none text-sm"
                    style={{ fontFamily: "var(--font-roboto-mono)" }}
                  >
                    <div className="text-white/50 mb-2">
                      # From your ElizaOS project directory
                    </div>
                    <div className="text-white font-medium">elizaos deploy</div>
                  </div>
                </div>
              </BrandCard>
            )}

            <Suspense fallback={<ContainersSkeleton />}>
              <ContainersTable containers={containers} />
            </Suspense>

            {/* Empty State Section - Show when no containers */}
            {containers.length === 0 && (
              <div className="flex flex-col gap-[24px] items-center py-[64px]">
                {/* Server Icon */}
                <div className="bg-[#1b1b1b] p-[20px] flex gap-[25px] items-center">
                  <Server className="h-10 w-10 text-[#e1e1e1]" />
                </div>

                {/* Text */}
                <div className="flex flex-col gap-[8px] items-center text-center w-full">
                  <p
                    className="text-[#e1e1e1]"
                    style={{
                      fontFamily: "var(--font-roboto-mono)",
                      fontSize: "24px",
                      fontWeight: 500,
                      lineHeight: "normal",
                      letterSpacing: "-0.24px",
                    }}
                  >
                    No containers deployed
                  </p>
                  <p
                    className="text-[#858585] whitespace-pre-wrap"
                    style={{
                      fontFamily: "var(--font-roboto-flex)",
                      fontSize: "16px",
                      fontWeight: 400,
                      lineHeight: "24px",
                    }}
                  >
                    Get started by deploying your first ElizaOS container using the CLI
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
