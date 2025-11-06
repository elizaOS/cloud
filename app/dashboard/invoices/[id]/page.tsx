import type { Metadata } from "next";
import { requireAuthWithOrg } from "@/lib/auth";
import { InvoiceDetailClient } from "@/components/invoices/invoice-detail-client";
import { invoicesService } from "@/lib/services";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Invoice Details",
  description: "View invoice details and transaction information",
};

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuthWithOrg();
  const { id } = await params;

  if (!id || !user.organization_id) {
    notFound();
  }

  const invoice = await invoicesService.getById(id);

  if (!invoice || invoice.organization_id !== user.organization_id) {
    notFound();
  }

  return <InvoiceDetailClient invoice={invoice} />;
}
