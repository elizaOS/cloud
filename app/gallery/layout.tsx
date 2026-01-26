/**
 * Gallery Layout
 *
 * Public layout for the community gallery pages.
 * No authentication required.
 */

import { ReactNode } from "react";

interface GalleryLayoutProps {
  children: ReactNode;
}

export default function GalleryLayout({ children }: GalleryLayoutProps) {
  return <main className="min-h-screen bg-[#0A0A0A]">{children}</main>;
}
