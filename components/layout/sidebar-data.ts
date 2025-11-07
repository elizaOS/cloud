/**
 * Sidebar Navigation Configuration
 */

import { HomeIcon, ImageIcon, LayersIcon } from "@radix-ui/react-icons";
import {
  Server,
  Video,
  UserCog,
  Bot,
  Code,
  Mic,
  Zap,
  Store,
} from "lucide-react";
import type { ComponentType } from "react";

export interface SidebarItem {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string | number;
  isNew?: boolean;
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
    ],
  },
  {
    title: "Generation Studio",
    items: [
      {
        id: "image-generation",
        label: "Images",
        href: "/dashboard/image",
        icon: ImageIcon,
        freeAllowed: false, // Requires signup
      },
      {
        id: "video-generation",
        label: "Videos",
        href: "/dashboard/video",
        icon: Video,
        freeAllowed: false, // Requires signup
      },
      {
        id: "voices",
        label: "Voices",
        href: "/dashboard/voices",
        icon: Mic,
        freeAllowed: false, // Requires signup
      },
      {
        id: "gallery",
        label: "Gallery",
        href: "/dashboard/gallery",
        icon: LayersIcon,
        freeAllowed: false, // Requires signup
      },
    ],
  },
  {
    title: "Agent Development",
    items: [
      {
        id: "eliza-agent",
        label: "Chat",
        href: "/dashboard/chat",
        icon: Bot,
        freeAllowed: true, // Free tier can access Chat
      },
      {
        id: "my-agents",
        label: "My Agents",
        href: "/dashboard/my-agents",
        icon: Store,
        freeAllowed: false, // Requires signup
      },
      {
        id: "character-creator",
        label: "Character Creator",
        href: "/dashboard/character-creator",
        icon: UserCog,
        freeAllowed: false, // Requires signup
      },
      {
        id: "api-explorer",
        label: "API Explorer",
        href: "/dashboard/api-explorer",
        icon: Code,
        freeAllowed: false, // Requires signup
      },
      {
        id: "mcp-playground",
        label: "MCP Playground",
        href: "/dashboard/mcp-playground",
        icon: Zap,
        freeAllowed: false, // Requires signup
      },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      {
        id: "containers",
        label: "Containers",
        href: "/dashboard/containers",
        icon: Server,
        freeAllowed: false, // Requires signup
      },
    ],
  },
];
