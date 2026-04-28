// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.
import type { Metadata } from "next";
import { Navigate } from "react-router-dom";
// TODO(migrate): replace redirect(...) calls with <Navigate to=... replace /> or navigate(...).
import { requireAuthWithOrg } from "@/lib/auth";
import { adminService } from "@/lib/services/admin";
import { InfrastructureDashboard } from "@/packages/ui/src/components/admin/infrastructure-dashboard";

export const metadata: Metadata = {
  title: "Admin: Infrastructure",
  description: "Docker nodes, containers, and Headscale mesh management",
};

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
