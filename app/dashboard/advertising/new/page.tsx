import type { Metadata } from "next";
import { CreateCampaignClient } from "@/components/advertising/create-campaign-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create Campaign",
  description: "Create a new advertising campaign",
};

export default function CreateCampaignPage() {
  return <CreateCampaignClient />;
}
