import type { Metadata } from "next";
import Link from "next/link";
import {
  ChatBubbleIcon,
  ImageIcon,
  TokensIcon,
  LayersIcon,
  BarChartIcon,
  PersonIcon,
} from "@radix-ui/react-icons";
import { Server, HardDrive, Sparkles, Zap, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "View your AI agent dashboard, analytics, and quick actions",
};

const quickActions = [
  {
    title: "Text & Chat",
    description: "Generate text and engage in AI conversations",
    href: "/dashboard/text",
    icon: ChatBubbleIcon,
    gradient: "from-blue-500 to-cyan-500",
    iconBg: "bg-blue-500/10",
  },
  {
    title: "Image Generation",
    description: "Create stunning AI-powered images",
    href: "/dashboard/image",
    icon: ImageIcon,
    gradient: "from-purple-500 to-pink-500",
    iconBg: "bg-purple-500/10",
  },
  {
    title: "Gallery",
    description: "View and manage your generated content",
    href: "/dashboard/gallery",
    icon: LayersIcon,
    gradient: "from-green-500 to-emerald-500",
    iconBg: "bg-green-500/10",
  },
];

const infrastructureActions = [
  {
    title: "Containers",
    description: "Deploy and manage containerized applications",
    href: "/dashboard/containers",
    icon: Server,
    isNew: true,
    gradient: "from-orange-500 to-red-500",
    iconBg: "bg-orange-500/10",
  },
  {
    title: "Storage",
    description: "Manage your cloud storage and data",
    href: "/dashboard/storage",
    icon: HardDrive,
    isNew: true,
    gradient: "from-indigo-500 to-purple-500",
    iconBg: "bg-indigo-500/10",
  },
];

const settingsActions = [
  {
    title: "Account",
    description: "Manage your profile and preferences",
    href: "/dashboard/account",
    icon: PersonIcon,
    gradient: "from-slate-500 to-gray-500",
    iconBg: "bg-slate-500/10",
  },
  {
    title: "API Keys",
    description: "Manage your API authentication",
    href: "/dashboard/api-keys",
    icon: TokensIcon,
    gradient: "from-yellow-500 to-amber-500",
    iconBg: "bg-yellow-500/10",
  },
  {
    title: "Analytics",
    description: "View usage statistics and insights",
    href: "/dashboard/analytics",
    icon: BarChartIcon,
    gradient: "from-teal-500 to-cyan-500",
    iconBg: "bg-teal-500/10",
  },
];

export default async function DashboardPage() {
  await getCurrentUser();

  return (
    <div className="flex flex-col gap-4 max-w-7xl mx-auto h-full">
      {/* Hero Section */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
          Welcome to ElizaOS Cloud
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
          Your complete AI agent development platform
        </p>
      </div>

      {/* Quick Actions */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Generation Studio</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group relative rounded-xl border bg-card p-4 shadow-sm hover:shadow-lg transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`rounded-lg p-2.5 ${action.iconBg}`}>
                    <Icon className={`h-5 w-5 bg-gradient-to-br ${action.gradient} bg-clip-text text-transparent`} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="font-semibold mb-1">{action.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {action.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Infrastructure */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Infrastructure</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {infrastructureActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group relative rounded-xl border bg-card p-4 shadow-sm hover:shadow-lg transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${(index + 3) * 100}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`rounded-lg p-2.5 ${action.iconBg}`}>
                    <Icon className={`h-5 w-5 bg-gradient-to-br ${action.gradient} bg-clip-text text-transparent`} />
                  </div>
                  <div className="flex items-center gap-2">
                    {action.isNew && (
                      <Badge variant="default" className="text-xs">
                        NEW
                      </Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <h3 className="font-semibold mb-1">{action.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {action.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Settings */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Settings & Analytics</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {settingsActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group relative rounded-xl border bg-card p-4 shadow-sm hover:shadow-lg transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${(index + 5) * 100}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`rounded-lg p-2.5 ${action.iconBg}`}>
                    <Icon className={`h-5 w-5 bg-gradient-to-br ${action.gradient} bg-clip-text text-transparent`} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="font-semibold mb-1">{action.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {action.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

