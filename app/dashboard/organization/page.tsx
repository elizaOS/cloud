import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { OrganizationPageClient } from "@/components/organization/organization-page-client";

export const metadata: Metadata = {
  title: "Organization Settings",
  description: "Manage your organization members, invites, and settings",
};

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const user = await requireAuth();

  if (user.role !== "owner" && user.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">
          Only organization owners and admins can access this page.
        </p>
      </div>
    );
  }

  return <OrganizationPageClient user={user} />;
}
