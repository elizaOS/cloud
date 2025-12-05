import type { Metadata } from "next";
import { requireAuthWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services";
import { redirect } from "next/navigation";
import { AppOverview } from "@/components/apps/app-overview";
import { AppSettings } from "@/components/apps/app-settings";
import { AppAnalytics } from "@/components/apps/app-analytics";
import { AppUsers } from "@/components/apps/app-users";
import { BrandCard, CornerBrackets } from "@/components/brand";
import {
  ArrowLeft,
  Grid3x3,
  Settings,
  BarChart3,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  try {
    const user = await requireAuthWithOrg();
    const { id } = await params;
    const app = await appsService.getById(id);

    if (!app || app.organization_id !== user.organization_id) {
      return {
        title: "App Not Found",
        robots: { index: false, follow: false },
      };
    }

    return {
      title: `${app.name} - App Details | Eliza Cloud`,
      description: app.description || `Manage ${app.name} app settings and analytics`,
      robots: { index: false, follow: false },
    };
  } catch (error) {
    return {
      title: "App Details",
      robots: { index: false, follow: false },
    };
  }
}

export default async function AppDetailsPage({ params, searchParams }: PageProps) {
  const user = await requireAuthWithOrg();
  const { id } = await params;
  const search = await searchParams;

  const app = await appsService.getById(id);

  // Verify app exists and belongs to user's organization
  if (!app || app.organization_id !== user.organization_id) {
    redirect("/dashboard/apps");
  }

  // Get total stats
  const stats = await appsService.getTotalStats(id);

  // Check if we should show the API key (only after creation)
  const showApiKey = search.showApiKey as string | undefined;

  return (
    <div className="max-w-7xl mx-auto py-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/apps"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-white/60" />
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-2">
              {app.logo_url ? (
                <img
                  src={app.logo_url}
                  alt={app.name}
                  className="w-12 h-12 rounded-lg object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#FF5800] to-purple-600 flex items-center justify-center">
                  <Grid3x3 className="h-6 w-6 text-white" />
                </div>
              )}
              <div>
                <h1
                  className="text-3xl font-normal tracking-tight text-white"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  {app.name}
                </h1>
                <p className="text-white/60 text-sm">{app.slug}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10">
            <p className="text-sm text-white/60">Total Users</p>
            <p className="text-2xl font-bold text-white mt-1">
              {stats.totalUsers.toLocaleString()}
            </p>
          </div>
        </BrandCard>

        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10">
            <p className="text-sm text-white/60">Total Requests</p>
            <p className="text-2xl font-bold text-white mt-1">
              {stats.totalRequests.toLocaleString()}
            </p>
          </div>
        </BrandCard>

        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10">
            <p className="text-sm text-white/60">Credits Used</p>
            <p className="text-2xl font-bold text-white mt-1">
              ${parseFloat(stats.totalCreditsUsed).toFixed(2)}
            </p>
          </div>
        </BrandCard>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-4 bg-white/5">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Grid3x3 className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <AppOverview app={app} showApiKey={showApiKey} />
        </TabsContent>

        <TabsContent value="analytics">
          <AppAnalytics appId={app.id} />
        </TabsContent>

        <TabsContent value="users">
          <AppUsers appId={app.id} />
        </TabsContent>

        <TabsContent value="settings">
          <AppSettings app={app} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

