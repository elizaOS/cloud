// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.
import type { Metadata } from "next";
// TODO(migrate): replace redirect(...) calls with <Navigate to=... replace /> or navigate(...).
import { requireAuthWithOrg } from "@/lib/auth";
import { adminService } from "@/lib/services/admin";
import { AdminMetricsWrapper } from "@/packages/ui/src/components/admin/admin-metrics-wrapper";

export const metadata: Metadata = {
  title: "Admin: Engagement Metrics",
  description: "User engagement KPIs across all platforms",
};

export default async function AdminMetricsPage() {
  const user = await requireAuthWithOrg();

  if (!user.wallet_address) {
    redirect("/dashboard");
  }

  const { isAdmin, role } = await adminService.getAdminStatus(user.wallet_address);
  if (!isAdmin || role !== "super_admin") {
    redirect("/dashboard");
  }

  return <AdminMetricsWrapper />;
}
