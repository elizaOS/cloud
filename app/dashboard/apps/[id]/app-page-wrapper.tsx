"use client";

import { useSetPageHeader } from "@/components/layout/page-header-context";

interface AppPageWrapperProps {
  appName: string;
  children: React.ReactNode;
}

export function AppPageWrapper({ appName, children }: AppPageWrapperProps) {
  useSetPageHeader({
    title: appName,
  });

  return children;
}
