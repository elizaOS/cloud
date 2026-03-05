import { HomeIcon } from "@radix-ui/react-icons";
import { UserCog } from "lucide-react";
import type { ComponentType } from "react";

export interface SidebarItem {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string | number;
  isNew?: boolean;
  freeAllowed?: boolean;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  comingSoon?: boolean;
}

export interface SidebarSection {
  title?: string;
  items: SidebarItem[];
  adminOnly?: boolean;
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
    title: "Monetization",
    items: [
      {
        id: "affiliates",
        label: "Affiliates",
        href: "/dashboard/affiliates",
        icon: UserCog,
        freeAllowed: false,
      },
    ],
  },
];
