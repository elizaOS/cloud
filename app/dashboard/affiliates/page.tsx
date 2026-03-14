import type { Metadata } from "next";
import { AffiliatesPageWrapper } from "@/components/affiliates/affiliates-page-wrapper";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Affiliates",
  description: "Manage your affiliate link and markup percentage",
};

export const dynamic = "force-dynamic";

export default async function AffiliatesPage() {
  await requireAuth();
  return <AffiliatesPageWrapper />;
}
