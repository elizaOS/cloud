import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Redirect to the Gallery page with collections tab
export default function CollectionsPage() {
  redirect("/dashboard/gallery?tab=collections");
}
