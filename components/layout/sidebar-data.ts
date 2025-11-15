/**
 * Sidebar Navigation Configuration
 */

import { HomeIcon, ImageIcon, LayersIcon } from "@radix-ui/react-icons";
import { Server, Video, UserCog, Bot, Code, Mic, Store, Sparkles } from "lucide-react";
import type { ComponentType } from "react";

export interface SidebarItem {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string | number;
  isNew?: boolean;
  comingSoon?: boolean;
  freeAllowed?: boolean; // Whether anonymous users can access this
}

export interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

export const sidebarSections: SidebarSection[] = [
  {
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        icon: HomeIcon,
      },
      {
        id: "agents",
        label: "Agents",
        href: "/dashboard/my-agents",
        icon: Bot,
        freeAllowed: false,
      },
      {
        id: "studio",
        label: "Studio",
        href: "/dashboard/image",
        icon: Sparkles,
        comingSoon: true,
        freeAllowed: false,
      },
      {
        id: "infrastructure",
        label: "Infrastructure",
        href: "/dashboard/containers",
        icon: Server,
        freeAllowed: false,
      },
    ],
  },
];
