// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { EarningsPageWrapper } from "@/packages/ui/src/components/earnings/earnings-page-wrapper";

export const metadata: Metadata = {
  title: "Earnings & Redemptions",
  description: "View your earnings and redeem for elizaOS tokens",
};

export default async function EarningsPage() {
  await requireAuth();
  return <EarningsPageWrapper />;
}
