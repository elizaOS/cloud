/**
 * Create app dialog component for creating new applications.
 * Supports app name, description, URLs, and allowed origins configuration.
 * Displays created app details with API key after successful creation.
 *
 * @param props - Create app dialog configuration
 * @param props.open - Whether dialog is open
 * @param props.onOpenChange - Callback when dialog open state changes
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Smartphone,
  Workflow,
  Server,
  ChevronRight,
  Globe,
  Bot,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { generateDisplayName, generateServiceName, generateWorkflowName } from "@/lib/utils/random-names";
import { cn } from "@/lib/utils";

interface CreatedAppData {
  appId: string;
  apiKey: string;
  appName: string;
}

interface CreateAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AppType = "miniapp" | "workflow" | "service";

interface AppTypeOption {
  type: AppType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const APP_TYPES: AppTypeOption[] = [
  {
    type: "miniapp",
    label: "Mini App",
    description: "Web app or mobile experience",
    icon: Smartphone,
    color: "from-blue-500 to-cyan-500",
  },
  {
    type: "workflow",
    label: "Workflow",
    description: "Automated task pipeline",
    icon: Workflow,
    color: "from-purple-500 to-pink-500",
  },
  {
    type: "service",
    label: "Service",
    description: "API with MCP, A2A, REST",
    icon: Server,
    color: "from-orange-500 to-red-500",
  },
];

interface ServiceEndpoints {
  mcp: boolean;
  a2a: boolean;
  rest: boolean;
}

export function CreateAppDialog({ open, onOpenChange }: CreateAppDialogProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [createdApp, setCreatedApp] = useState<CreatedAppData | null>(null);
  const [copied, setCopied] = useState(false);

  // Step 1: Type selection
  const [step, setStep] = useState<"type" | "name" | "success">("type");
  const [selectedType, setSelectedType] = useState<AppType | null>(null);

  // Step 2: Name (auto-generated, editable)
  const [appName, setAppName] = useState("");

  // Service endpoints (only for service type)
  const [serviceEndpoints, setServiceEndpoints] = useState<ServiceEndpoints>({
    mcp: true,
    a2a: true,
    rest: true,
  });

  const generateNameForType = (type: AppType): string => {
    switch (type) {
      case "miniapp":
        return generateDisplayName();
      case "workflow":
        return generateWorkflowName();
      case "service":
        return generateServiceName();
    }
  };

  const regenerateName = () => {
    if (selectedType) {
      setAppName(generateNameForType(selectedType));
    }
  };

  const handleTypeSelect = (type: AppType) => {
    setSelectedType(type);
    setAppName(generateNameForType(type));
    setStep("name");
  };

  const handleCreate = async () => {
    if (!selectedType || !appName.trim()) return;
    setIsLoading(true);

    const metadata: Record<string, unknown> = {
      app_type: selectedType,
    };

    if (selectedType === "service") {
      metadata.service_endpoints = serviceEndpoints;
    }

    const response = await fetch("/api/v1/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: appName.trim(),
        description: `${selectedType === "service" ? "Service" : selectedType === "workflow" ? "Workflow" : "Mini App"} created with Eliza Cloud`,
        app_url: "https://localhost:3000", // Placeholder, can be updated later
        features_enabled: {
          chat: true,
          agents: selectedType === "service",
          embedding: selectedType === "service",
        },
        metadata,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error("Failed to create", {
        description: error.error || "Please try again",
      });
      setIsLoading(false);
      return;
    }

    const data = await response.json();
    setCreatedApp({
      appId: data.app.id,
      apiKey: data.apiKey,
      appName: appName,
    });
    setStep("success");
    setIsLoading(false);
    toast.success("Created successfully");
  };

  const copyApiKey = async () => {
    if (!createdApp) return;
    await navigator.clipboard.writeText(createdApp.apiKey);
    setCopied(true);
    toast.success("API key copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    if (createdApp) {
      router.push(`/dashboard/apps/${createdApp.appId}`);
    }
    // Reset state
    setCreatedApp(null);
    setCopied(false);
    setStep("type");
    setSelectedType(null);
    setAppName("");
    setServiceEndpoints({ mcp: true, a2a: true, rest: true });
    onOpenChange(false);
  };

  const handleBack = () => {
    if (step === "name") {
      setStep("type");
      setSelectedType(null);
      setAppName("");
    }
  };

  // Success state
  if (step === "success" && createdApp) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Created Successfully
            </DialogTitle>
            <DialogDescription>
              Copy your API key now — you won&apos;t see it again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label className="text-xs text-white/60">Name</Label>
              <div className="text-lg font-medium text-white mt-1">{createdApp.appName}</div>
            </div>
            <div>
              <Label className="text-xs text-white/60">API Key</Label>
              <div className="flex gap-2 mt-1">
                <Input value={createdApp.apiKey} readOnly className="font-mono text-sm" />
                <Button type="button" variant="outline" onClick={copyApiKey} className="shrink-0">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleClose} className="bg-gradient-to-r from-[#FF5800] to-purple-600">
              <ChevronRight className="h-4 w-4 mr-2" />
              Configure &amp; Deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Name step
  if (step === "name" && selectedType) {
    const typeConfig = APP_TYPES.find((t) => t.type === selectedType);
    const TypeIcon = typeConfig?.icon || Smartphone;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className={cn("p-2 rounded-lg bg-gradient-to-r", typeConfig?.color)}>
                <TypeIcon className="h-4 w-4 text-white" />
              </div>
              Create {typeConfig?.label}
            </DialogTitle>
            <DialogDescription>
              {selectedType === "service"
                ? "Configure service endpoints and name"
                : "Give your project a name"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name" className="text-white/80">
                Name
              </Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Enter a name..."
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={regenerateName} title="Generate new name">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {selectedType === "service" && (
              <div className="space-y-3">
                <Label className="text-white/80">Service Endpoints</Label>
                <div className="grid gap-2">
                  {[
                    { key: "mcp" as const, label: "MCP Server", description: "Model Context Protocol", icon: Bot },
                    { key: "a2a" as const, label: "A2A Protocol", description: "Agent-to-Agent", icon: Zap },
                    { key: "rest" as const, label: "REST API", description: "Standard HTTP", icon: Globe },
                  ].map(({ key, label, description, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setServiceEndpoints((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                        serviceEndpoints[key]
                          ? "border-[#FF5800]/50 bg-[#FF5800]/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-lg",
                        serviceEndpoints[key] ? "bg-[#FF5800]/20" : "bg-white/10"
                      )}>
                        <Icon className={cn(
                          "h-4 w-4",
                          serviceEndpoints[key] ? "text-[#FF5800]" : "text-white/60"
                        )} />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-white text-sm">{label}</div>
                        <div className="text-xs text-white/50">{description}</div>
                      </div>
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        serviceEndpoints[key] ? "border-[#FF5800] bg-[#FF5800]" : "border-white/30"
                      )}>
                        {serviceEndpoints[key] && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/40">
                  All endpoints are automatically exposed to n8n workflows
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            <Button type="button" variant="ghost" onClick={handleBack}>
              Back
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isLoading || !appName.trim()}
              className="bg-gradient-to-r from-[#FF5800] to-purple-600"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Type selection step (default)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>What do you want to build?</DialogTitle>
          <DialogDescription>
            Choose a starting point. You can always change or expand later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          {APP_TYPES.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.type}
                onClick={() => handleTypeSelect(option.type)}
                className="flex items-center gap-4 p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left group"
              >
                <div className={cn("p-3 rounded-lg bg-gradient-to-r", option.color)}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white flex items-center gap-2">
                    {option.label}
                    {option.type === "service" && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-[#FF5800]/50 text-[#FF5800]">
                        MCP + A2A + REST
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-white/60">{option.description}</div>
                </div>
                <ChevronRight className="h-5 w-5 text-white/30 group-hover:text-white/60 transition-colors" />
              </button>
            );
          })}
        </div>

        <div className="text-xs text-white/40 text-center pb-2">
          Services integrate with workflows and expose endpoints for agents to call
        </div>
      </DialogContent>
    </Dialog>
  );
}
