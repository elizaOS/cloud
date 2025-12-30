/**
 * App details tabs component organizing app management views.
 * Provides tabs for overview, analytics, earnings, users, monetization, and settings.
 * Syncs active tab with URL search parameters.
 *
 * @param props - App details tabs configuration
 * @param props.app - App data
 * @param props.showApiKey - Optional API key to display in overview
 */

"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Grid3x3,
  Settings,
  BarChart3,
  Users,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { AppOverview } from "./app-overview";
import { AppSettings } from "./app-settings";
import { AppAnalytics } from "./app-analytics";
import { AppUsers } from "./app-users";
import { AppMonetizationSettings } from "./app-monetization-settings";
import { AppEarningsDashboard } from "./app-earnings-dashboard";
import type { App } from "@/db/schemas";

interface AppDetailsTabsProps {
  app: App;
  showApiKey?: string;
}

export function AppDetailsTabs({ app, showApiKey }: AppDetailsTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "overview";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`/dashboard/apps/${app.id}?${params.toString()}`, {
      scroll: false,
    });
  };

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="space-y-6">
      <TabsList className="grid w-full max-w-3xl grid-cols-6 bg-white/5">
        <TabsTrigger value="overview" className="flex items-center gap-2">
          <Grid3x3 className="h-4 w-4" />
          <span className="hidden sm:inline">Overview</span>
        </TabsTrigger>
        <TabsTrigger value="analytics" className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">Analytics</span>
        </TabsTrigger>
        <TabsTrigger value="earnings" className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          <span className="hidden sm:inline">Earnings</span>
        </TabsTrigger>
        <TabsTrigger value="monetization" className="flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          <span className="hidden sm:inline">Monetize</span>
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

      <TabsContent value="earnings">
        <AppEarningsDashboard appId={app.id} />
      </TabsContent>

      <TabsContent value="monetization">
        <AppMonetizationSettings appId={app.id} />
      </TabsContent>

      <TabsContent value="users">
        <AppUsers appId={app.id} />
      </TabsContent>

      <TabsContent value="settings">
        <AppSettings app={app} />
      </TabsContent>
    </Tabs>
  );
}
