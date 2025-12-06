import type { Metadata } from "next";
import { requireAuthWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Grid3x3,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { AppDetailsTabs } from "@/components/apps/app-details-tabs";

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Generates metadata for the app details page.
 *
 * @param params - Route parameters containing the app ID.
 * @returns Metadata object with title and description for the app details page.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
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
}

/**
 * App details page displaying information for a specific app.
 * Shows app logo, name, slug, and tabs for various app management features.
 * Redirects to apps list if the app doesn't exist or doesn't belong to the user's organization.
 *
 * @param params - Route parameters containing the app ID.
 * @param searchParams - Search parameters, including optional `showApiKey` flag.
 * @returns The rendered app details page with tabs.
 */
export default async function AppDetailsPage({ params, searchParams }: PageProps) {
  const user = await requireAuthWithOrg();
  const { id } = await params;
  const search = await searchParams;

  const app = await appsService.getById(id);

  // Verify app exists and belongs to user's organization
  if (!app || app.organization_id !== user.organization_id) {
    redirect("/dashboard/apps");
  }

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
                <Image
                  src={app.logo_url}
                  alt={app.name}
                  width={48}
                  height={48}
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

      {/* Tabs */}
      <AppDetailsTabs app={app} showApiKey={showApiKey} />
    </div>
  );
}

