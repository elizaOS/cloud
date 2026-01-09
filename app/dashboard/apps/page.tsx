import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import { AppsTable } from "@/components/apps/apps-table";
import { AppsSkeleton } from "@/components/apps/apps-skeleton";
import { Grid3x3, Users, TrendingUp, Activity, Sparkles } from "lucide-react";
import { BrandCard, CornerBrackets } from "@/components/brand";

export const metadata: Metadata = {
  title: "Apps",
  description:
    "Create and manage apps that integrate with Eliza Cloud services. Build AI-powered applications with custom configurations and track usage.",
};

export const dynamic = "force-dynamic";

/**
 * Apps page displaying all apps for the authenticated user's organization.
 * Shows statistics (total apps, active apps, total users, total requests) and a table of apps.
 *
 * @returns The rendered apps page with statistics and apps table.
 */
export default async function AppsPage() {
  const user = await requireAuthWithOrg();
  const apps = await appsService.listByOrganization(user.organization_id);

  // Calculate stats
  const stats = {
    total: apps.length,
    active: apps.filter((a) => a.is_active).length,
    inactive: apps.filter((a) => !a.is_active).length,
    totalUsers: apps.reduce((sum, app) => sum + app.total_users, 0),
    totalRequests: apps.reduce((sum, app) => sum + app.total_requests, 0),
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
              Apps
            </h1>
          </div>
          <p className="text-white/60 mt-2">
            Create and manage apps that integrate with your Eliza Cloud services
          </p>
        </div>
        <Link href="/dashboard/apps/create">
          <button className="group relative inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white overflow-hidden rounded-lg transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(255,88,0,0.4)]">
            {/* Animated gradient background */}
            <span className="absolute inset-0 bg-gradient-to-r from-[#FF5800] via-[#FF2D92] to-[#9D4EDD] animate-gradient-x bg-[length:200%_100%]" />
            {/* Shimmer effect */}
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            {/* Content */}
            <span className="relative flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Build with AI
            </span>
          </button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        data-onboarding="apps-stats"
      >
        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Total Apps</p>
              <p className="text-2xl font-bold text-white mt-1">
                {stats.total}
              </p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg">
              <Grid3x3 className="h-5 w-5 text-[#FF5800]" />
            </div>
          </div>
        </BrandCard>

        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Active Apps</p>
              <p className="text-2xl font-bold text-white mt-1">
                {stats.active}
              </p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg">
              <Activity className="h-5 w-5 text-green-500" />
            </div>
          </div>
        </BrandCard>

        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Total Users</p>
              <p className="text-2xl font-bold text-white mt-1">
                {stats.totalUsers.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
          </div>
        </BrandCard>

        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Total Requests</p>
              <p className="text-2xl font-bold text-white mt-1">
                {stats.totalRequests.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg">
              <TrendingUp className="h-5 w-5 text-purple-500" />
            </div>
          </div>
        </BrandCard>
      </div>

      {/* Apps Table */}
      <BrandCard data-onboarding="apps-table">
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Your Apps</h2>
          </div>

          <Suspense fallback={<AppsSkeleton />}>
            <AppsTable apps={apps} />
          </Suspense>
        </div>
      </BrandCard>
    </div>
  );
}
