import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { AccountPageClient } from "@/components/account/account-page-client";

export const metadata: Metadata = {
  title: "Account Settings",
  description:
    "Manage your account preferences, profile, and security settings",
};

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requireAuth();

  return <AccountPageClient user={user} />;
}
