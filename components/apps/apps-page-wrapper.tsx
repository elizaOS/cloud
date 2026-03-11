"use client";

import { type ReactNode } from "react";
import { useSetPageHeader } from "@elizaos/ui";

interface AppsPageWrapperProps {
  children: ReactNode;
}

export function AppsPageWrapper({ children }: AppsPageWrapperProps) {
  useSetPageHeader({ title: "My Apps" }, []);
  return children;
}
