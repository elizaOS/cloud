/**
 * Create Project Button Component
 * 
 * Button to navigate to fragments page to create a new project
 */

"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { BrandButton } from "@/components/brand";

export function CreateProjectButton() {
  const router = useRouter();

  return (
    <BrandButton
      variant="primary"
      onClick={() => router.push("/dashboard/fragments")}
    >
      <Plus className="h-4 w-4 mr-2" />
      Create Fragment
    </BrandButton>
  );
}

