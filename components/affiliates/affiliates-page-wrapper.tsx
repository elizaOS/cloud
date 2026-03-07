"use client";

import { useSetPageHeader } from "@/components/layout/page-header-context";
import { AffiliatesPageClient } from "./affiliates-page-client";

export function AffiliatesPageWrapper() {
    useSetPageHeader({
        title: "Affiliates",
        description: "Manage your referral code and customize your markup percentage",
    });

    return <AffiliatesPageClient />;
}
