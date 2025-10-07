import type { Metadata } from "next";
import { ContainersPageClient } from "@/components/containers/containers-page-client";

export const metadata: Metadata = {
  title: "Containers",
  description:
    "Deploy and manage containerized AI applications with our infrastructure platform",
  keywords: [
    "containers",
    "deployment",
    "docker",
    "kubernetes",
    "infrastructure",
  ],
};

export default function ContainersPage() {
  return <ContainersPageClient />;
}
