/**
 * Fragment Projects Management Page
 *
 * Lists all saved fragment projects with options to view, edit, and deploy
 */

import { Suspense } from "react";
import { requireAuthWithOrg } from "@/lib/auth";
import { fragmentProjectsService } from "@/lib/services/fragment-projects";
import { FragmentProjectsTable } from "@/components/fragments/fragment-projects-table";
import { FragmentProjectsSkeleton } from "@/components/fragments/fragment-projects-skeleton";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Code, Rocket, FolderOpen } from "lucide-react";
import { CreateProjectButton } from "@/components/fragments/create-project-button";

export const dynamic = "force-dynamic";

/**
 * Fragment Projects page displaying all saved projects for the organization.
 */
export default async function FragmentProjectsPage() {
  const user = await requireAuthWithOrg();
  const projects = await fragmentProjectsService.listByOrganization(
    user.organization_id!,
  );

  // Calculate stats
  const stats = {
    total: projects.length,
    deployed: projects.filter((p) => p.status === "deployed").length,
    draft: projects.filter((p) => p.status === "draft").length,
    archived: projects.filter((p) => p.status === "archived").length,
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-6 sm:py-10 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: "#FF5800" }}
            />
            <h1
              className="text-2xl sm:text-3xl md:text-4xl font-normal tracking-tight text-white truncate"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Fragment Projects
            </h1>
          </div>
          <p className="text-sm sm:text-base text-white/60 mt-2">
            Manage and deploy your saved fragment projects
          </p>
        </div>
        <div className="shrink-0">
          <CreateProjectButton />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Total Projects</p>
              <p className="text-2xl font-bold text-white mt-1">
                {stats.total}
              </p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg">
              <FolderOpen className="h-5 w-5 text-[#FF5800]" />
            </div>
          </div>
        </BrandCard>

        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Deployed</p>
              <p className="text-2xl font-bold text-white mt-1">
                {stats.deployed}
              </p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg">
              <Rocket className="h-5 w-5 text-green-500" />
            </div>
          </div>
        </BrandCard>

        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Draft</p>
              <p className="text-2xl font-bold text-white mt-1">
                {stats.draft}
              </p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg">
              <Code className="h-5 w-5 text-blue-500" />
            </div>
          </div>
        </BrandCard>

        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Archived</p>
              <p className="text-2xl font-bold text-white mt-1">
                {stats.archived}
              </p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg">
              <FolderOpen className="h-5 w-5 text-purple-500" />
            </div>
          </div>
        </BrandCard>
      </div>

      {/* Projects Table */}
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Your Projects
            </h2>
          </div>

          <Suspense fallback={<FragmentProjectsSkeleton />}>
            <FragmentProjectsTable projects={projects} />
          </Suspense>
        </div>
      </BrandCard>
    </div>
  );
}
