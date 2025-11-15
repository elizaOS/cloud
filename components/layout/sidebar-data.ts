/**
 * Sidebar Navigation Configuration
 */

import { HomeIcon, ImageIcon, LayersIcon } from "@radix-ui/react-icons";
import { Server, Video, UserCog, Bot, Code, Mic, Store, Sparkles, Image } from "lucide-react";
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
    ],
  },
  {
    title: "Studio",
    items: [
      {
        id: "image",
        label: "Image",
        href: "/dashboard/image",
        icon: Image,
        freeAllowed: false,
      },
      {
        id: "video",
        label: "Video",
        href: "/dashboard/video",
        icon: Video,
        freeAllowed: false,
      },
      {
        id: "voice",
        label: "Voice",
        href: "/dashboard/voice",
        icon: Mic,
        freeAllowed: false,
      },
      {
        id: "gallery",
        label: "Gallery",
        href: "/dashboard/gallery",
        icon: LayersIcon,
        freeAllowed: false,
      }
    ],
  },
  {
    items: [
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
