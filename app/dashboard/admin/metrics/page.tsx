import type { Metadata } from "next";
import { requireAuthWithOrg } from "@/lib/auth";
import { adminService } from "@/lib/services/admin";
import { AdminMetricsWrapper } from "@/components/admin/admin-metrics-wrapper";

export const metadata: Metadata = {
  title: "Admin: Engagement Metrics",
  description: "User engagement KPIs across all platforms",
};

export const dynamic = "force-dynamic";

export default async function AdminMetricsPage() {
  const user = await requireAuthWithOrg();

  if (!user.wallet_address) {
    throw new Error("Wallet connection required for admin access");
  }

  const { isAdmin, role } = await adminService.getAdminStatus(
    user.wallet_address,
  );
  if (!isAdmin || role !== "super_admin") {
    throw new Error("Only super admins can access engagement metrics");
  }

  return <AdminMetricsWrapper />;
}
