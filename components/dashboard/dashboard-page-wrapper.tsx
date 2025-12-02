"use client";

import { type ReactNode } from "react";
import { useSetPageHeader } from "@/components/layout/page-header-context";

interface DashboardPageWrapperProps {
  userName: string;
  children: ReactNode;
}

export function DashboardPageWrapper({
  userName,
  children,
}: DashboardPageWrapperProps) {
  useSetPageHeader(
    {
      title: "Dashboard",
      description: "",
    },
    [userName],
  );

  return <>{children}</>;
}
