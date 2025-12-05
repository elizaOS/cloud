import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { getObservabilityData } from "@/lib/actions/observability";
import { ObservabilityPageClient } from "@/components/observability/observability-page-client";

export const metadata: Metadata = {
  title: "Observability",
  description: "Monitor credits, spending, and usage metrics",
};

export const dynamic = "force-dynamic";

export default async function ObservabilityPage() {
  await requireAuth();
  const data = await getObservabilityData();

  return <ObservabilityPageClient data={data} />;
}
