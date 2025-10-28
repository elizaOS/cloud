/**
 * Sidebar Navigation Configuration
 */

import {
  HomeIcon,
  PersonIcon,
  TokensIcon,
  BarChartIcon,
  ChatBubbleIcon,
  ImageIcon,
  LayersIcon,
} from "@radix-ui/react-icons";
import {
  Server,
  HardDrive,
  Video,
  CreditCard,
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
        id: "text-generation",
        label: "Text & Chat",
        href: "/dashboard/text",
        icon: ChatBubbleIcon,
      },
      {
        id: "image-generation",
        label: "Images",
        href: "/dashboard/image",
        icon: ImageIcon,
      },
      {
        id: "video-generation",
        label: "Videos",
        href: "/dashboard/video",
        icon: Video,
      },
      {
        id: "voices",
        label: "Voices",
        href: "/dashboard/voices",
        icon: Mic,
        isNew: true,
      },
      {
        id: "gallery",
        label: "Gallery",
        href: "/dashboard/gallery",
        icon: LayersIcon,
      },
    ],
  },
  {
    title: "Agent Development",
    items: [
      {
        id: "eliza-agent",
        label: "Eliza Agent",
        href: "/dashboard/eliza",
        icon: Bot,
        isNew: false,
      },
      {
        id: "agent-marketplace",
        label: "Agent Marketplace",
        href: "/dashboard/agent-marketplace",
        icon: Store,
        isNew: true,
      },
      {
        id: "character-creator",
        label: "Character Creator",
        href: "/dashboard/character-creator",
        icon: UserCog,
        isNew: false,
      },
      {
        id: "api-explorer",
        label: "API Explorer",
        href: "/dashboard/api-explorer",
        icon: Code,
        isNew: true,
      },
      {
        id: "mcp-playground",
        label: "MCP Playground",
        href: "/dashboard/mcp-playground",
        icon: Zap,
        isNew: true,
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
        isNew: true,
      },
      {
        id: "storage",
        label: "Storage",
        href: "/dashboard/storage",
        icon: HardDrive,
        isNew: false,
      },
    ],
  },
  {
    title: "Settings",
    items: [
      {
        id: "account",
        label: "Account",
        href: "/dashboard/account",
        icon: PersonIcon,
      },
      {
        id: "billing",
        label: "Billing",
        href: "/dashboard/billing",
        icon: CreditCard,
      },
      {
        id: "api-keys",
        label: "API Keys",
        href: "/dashboard/api-keys",
        icon: TokensIcon,
      },
      {
        id: "analytics",
        label: "Analytics",
        href: "/dashboard/analytics",
        icon: BarChartIcon,
      },
    ],
  },
];
