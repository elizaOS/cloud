"use client";

import { type ReactNode } from "react";
import { useSetPageHeader } from "@elizaos/ui";

interface ContainersPageWrapperProps {
  children: ReactNode;
}

export function ContainersPageWrapper({
  children,
}: ContainersPageWrapperProps): ReactNode {
  useSetPageHeader({ title: "Containers" }, []);
  return children;
}
