import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { WorkflowsPageClient } from "@/components/workflows";

export const metadata: Metadata = {
  title: "Workflow Studio",
  description: "Create and manage AI-powered workflows using natural language",
};

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

/**
 * Workflows page for creating and managing AI-powered automations.
 */
export default async function WorkflowsPage() {
  await requireAuth();

  return <WorkflowsPageClient />;
}
