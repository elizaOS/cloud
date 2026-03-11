"use client";

import { useSetPageHeader } from "@elizaos/ui";
import { AffiliatesPageClient } from "./affiliates-page-client";

export function AffiliatesPageWrapper() {
    useSetPageHeader({
        title: "Affiliates",
        description: "Manage your affiliate link and customize your markup percentage",
    });

    return <AffiliatesPageClient />;
}
