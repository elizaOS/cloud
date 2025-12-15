export interface CLICommand {
  label: string;
  command: string;
}

export interface QuickActionConfig {
  id: string;
  title: string;
  description: string;
  gradient: string;
  href?: string;
  badge?: string;
  cliCommands?: CLICommand[];
}

export const CHAT_ACTIONS: QuickActionConfig[] = [
  {
    id: "agents-chat",
    title: "Create Agent",
    description: "Build and deploy AI agents with natural language",
    href: "/dashboard/build",
    gradient: "from-[#FF5800] to-orange-600",
    badge: "Chat",
  },
  {
    id: "apps-chat",
    title: "Create App",
    description: "Build apps, MCP services, and A2A endpoints with AI",
    href: "/dashboard/fragments",
    gradient: "from-purple-500 to-indigo-600",
    badge: "Chat",
  },
  {
    id: "monetize",
    title: "Monetize & Promote",
    description: "Set pricing, enable payments, and list on marketplace",
    href: "/dashboard/apps",
    gradient: "from-emerald-500 to-teal-600",
  },
];

export const CLI_ACTIONS: QuickActionConfig[] = [
  {
    id: "agent-cli",
    title: "Agent CLI",
    description: "Create and deploy agents from terminal",
    gradient: "from-cyan-500 to-blue-600",
    badge: "CLI",
    cliCommands: [
      { label: "Create", command: "npx elizaos create" },
      { label: "Deploy", command: "npx elizaos deploy" },
    ],
  },
  {
    id: "app-deploy",
    title: "Deploy Apps",
    description: "Deploy fragments and apps to production",
    href: "/dashboard/fragments",
    gradient: "from-pink-500 to-rose-600",
    badge: "Web",
  },
  {
    id: "n8n-workflows",
    title: "n8n Workflows",
    description: "Create automation workflows with AI assistance",
    href: "/dashboard/workflows",
    gradient: "from-amber-500 to-yellow-600",
    badge: "AI",
  },
];

export const ALL_ACTIONS: QuickActionConfig[] = [
  ...CHAT_ACTIONS,
  ...CLI_ACTIONS,
];
