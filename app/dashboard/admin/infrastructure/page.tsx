import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InfrastructureDashboard } from "@/components/admin/infrastructure-dashboard";
import { requireAuthWithOrg } from "@/lib/auth";
import { adminService } from "@/lib/services/admin";

export const metadata: Metadata = {
  title: "Admin: Infrastructure",
  description: "Docker nodes, containers, and Headscale mesh management",
};

export const dynamic = "force-dynamic";

export default async function AdminInfrastructurePage() {
  const user = await requireAuthWithOrg();

  if (!user.wallet_address) {
    redirect("/dashboard");
  }

  const { isAdmin, role } = await adminService.getAdminStatus(user.wallet_address);
  if (!isAdmin || role !== "super_admin") {
    redirect("/dashboard");
  }

  return <InfrastructureDashboard />;
}
