"use client";

import { useSetPageHeader } from "@elizaos/cloud-ui";
import { type ReactNode } from "react";

interface MiladyPageWrapperProps {
  children: ReactNode;
}

export function MiladyPageWrapper({ children }: MiladyPageWrapperProps): ReactNode {
  useSetPageHeader({ title: "Instances" }, []);
  return children;
}
