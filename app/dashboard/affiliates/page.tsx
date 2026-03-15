import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { AffiliatesPageWrapper } from "@/packages/ui/src/components/affiliates/affiliates-page-wrapper";

export const metadata: Metadata = {
  title: "Affiliates",
  description: "Manage your affiliate link and markup percentage",
};

export const dynamic = "force-dynamic";

export default async function AffiliatesPage() {
  await requireAuth();
  return <AffiliatesPageWrapper />;
}
