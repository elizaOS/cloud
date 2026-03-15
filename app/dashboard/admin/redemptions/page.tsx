import type { Metadata } from "next";
import { requireAuthWithOrg } from "@/lib/auth";
import { adminService } from "@/lib/services/admin";
import { AdminRedemptionsWrapper } from "@/packages/ui/src/components/admin/redemptions-wrapper";

export const metadata: Metadata = {
  title: "Admin: Redemption Management",
  description: "Review and approve token redemption requests",
};

export const dynamic = "force-dynamic";

export default async function AdminRedemptionsPage() {
  const user = await requireAuthWithOrg();
  const isAdmin = await adminService.isUserAdmin(user.id);
  if (!isAdmin) {
    throw new Error("Admin access required");
  }
  return <AdminRedemptionsWrapper />;
}
