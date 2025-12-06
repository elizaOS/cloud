/**
 * Sidebar navigation configuration defining sidebar sections and items.
 * Includes navigation structure with icons, labels, badges, and permission settings.
 */
import { HomeIcon, ImageIcon, LayersIcon } from "@radix-ui/react-icons";
import {
  Server,
  Video,
  UserCog,
  Bot,
  Code,
  Mic,
  Store,
  Puzzle,
  Grid3x3,
} from "lucide-react";
import type { ComponentType } from "react";
import type { FeatureFlag } from "@/lib/config/feature-flags";

export interface SidebarItem {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string | number;
  isNew?: boolean;
  freeAllowed?: boolean;
  featureFlag?: FeatureFlag;
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
    title: "Agents",
    items: [
      {
        id: "chat",
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
        label: "Creator",
        href: "/dashboard/character-creator",
        icon: UserCog,
        freeAllowed: false,
        featureFlag: "characterBuilder",
      },
      {
        id: "api-explorer",
        label: "API Explorer",
        href: "/dashboard/api-explorer",
        icon: Code,
        freeAllowed: false, // Requires signup
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
        freeAllowed: false,
        featureFlag: "voiceCloning",
      },
      {
        id: "gallery",
        label: "Gallery",
        href: "/dashboard/gallery",
        icon: LayersIcon,
        freeAllowed: false,
        featureFlag: "gallery",
      },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      {
        id: "apps",
        label: "Apps",
        href: "/dashboard/apps",
        icon: Grid3x3,
        freeAllowed: false, // Requires signup
      },
      {
        id: "containers",
        label: "Containers",
        href: "/dashboard/containers",
        icon: Server,
        freeAllowed: false,
        featureFlag: "containers",
      },
      {
        id: "mcps",
        label: "MCPs",
        href: "/dashboard/mcps",
        icon: Puzzle,
        freeAllowed: false,
        featureFlag: "mcp",
      },
    ],
  },
];
