/**
 * App monetization settings component with enhanced UX.
 * Features hero status card, earnings simulator, and visual revenue flow diagram.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Loader2,
  Save,
  Info,
  Zap,
  Coins,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AnimatedCounter,
  EarningsSimulator,
  RevenueFlowDiagram,
} from "./monetization";
import { cn } from "@/lib/utils";

interface MonetizationSettings {
  monetizationEnabled: boolean;
  inferenceMarkupPercentage: number;
  purchaseSharePercentage: number;
  platformOffsetAmount: number;
  totalCreatorEarnings: number;
}

interface AppMonetizationSettingsProps {
  appId: string;
}

export function AppMonetizationSettings({
  appId,
}: AppMonetizationSettingsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<MonetizationSettings>({
    monetizationEnabled: false,
    inferenceMarkupPercentage: 0,
    purchaseSharePercentage: 10,
    platformOffsetAmount: 1,
    totalCreatorEarnings: 0,
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [showEnableDialog, setShowEnableDialog] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/v1/apps/${appId}/monetization`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.success && data.monetization) {
          setSettings(data.monetization);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load settings",
        );
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [appId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/v1/apps/${appId}/monetization`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monetizationEnabled: settings.monetizationEnabled,
          inferenceMarkupPercentage: settings.inferenceMarkupPercentage,
          purchaseSharePercentage: settings.purchaseSharePercentage,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save settings");
      }
      toast.success("Settings saved");
      setHasChanges(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save settings",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof MonetizationSettings>(
    key: K,
    value: MonetizationSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Hero Status Card */}
        <div
          className={cn(
            "relative overflow-hidden rounded-lg border p-6 transition-all duration-500",
            settings.monetizationEnabled
              ? "bg-gradient-to-br from-[#FF5800]/10 via-black/40 to-purple-900/10 border-[#FF5800]/30 animate-glow-pulse"
              : "bg-black/40 border-white/10",
          )}
        >
          <CornerBrackets
            size="lg"
            color={settings.monetizationEnabled ? "#FF5800" : "#E1E1E1"}
            className={cn(
              "transition-opacity duration-500",
              settings.monetizationEnabled ? "opacity-40" : "opacity-20",
            )}
          />

          {/* Background decoration */}
          {settings.monetizationEnabled && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-[#FF5800]/5 to-transparent rounded-full blur-3xl animate-liquid-orb" />
            </div>
          )}

          <div className="relative z-10">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-3 rounded-lg transition-all duration-300",
                    settings.monetizationEnabled
                      ? "bg-[#FF5800]/20"
                      : "bg-white/5",
                  )}
                >
                  {settings.monetizationEnabled ? (
                    <Sparkles className="h-6 w-6 text-[#FF5800]" />
                  ) : (
                    <Coins className="h-6 w-6 text-white/40" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    Monetization
                    {settings.monetizationEnabled && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-normal">
                        ACTIVE
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-white/50">
                    {settings.monetizationEnabled
                      ? "Earning from every interaction"
                      : "Enable to start earning"}
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.monetizationEnabled}
                onCheckedChange={(checked) => {
                  if (checked && !settings.monetizationEnabled) {
                    setShowEnableDialog(true);
                  } else {
                    updateSetting("monetizationEnabled", checked);
                  }
                }}
              />
            </div>

            {/* Earnings display */}
            {settings.totalCreatorEarnings > 0 && (
              <div className="flex items-end gap-2">
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-wider mb-1">
                    Lifetime Earnings
                  </p>
                  <div className="text-3xl font-bold">
                    <AnimatedCounter
                      value={settings.totalCreatorEarnings}
                      prefix="$"
                      decimals={2}
                      className={cn(
                        settings.monetizationEnabled
                          ? "gradient-text"
                          : "text-white",
                      )}
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/60 hover:text-white mb-1"
                  onClick={() => {
                    router.push(`/dashboard/apps/${appId}?tab=earnings`);
                  }}
                >
                  View Details →
                </Button>
              </div>
            )}

            {/* Info banner when disabled */}
            {!settings.monetizationEnabled && (
              <div className="mt-4 flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white mb-1">
                    Start earning from your app
                  </p>
                  <p className="text-xs text-white/60">
                    When enabled, you earn from inference markups and credit
                    purchases. Users pay app-specific credits.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Settings Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Markup Controls */}
          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-medium text-white">
                  Revenue Settings
                </h3>
              </div>

              {/* Inference Markup */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/80">
                      Inference Markup
                    </span>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-white/30" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px]">
                        Markup on LLM costs. Higher = more per request.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span className="text-lg font-mono font-bold text-purple-400">
                    {settings.inferenceMarkupPercentage}%
                  </span>
                </div>
                <Slider
                  value={[settings.inferenceMarkupPercentage]}
                  onValueChange={([value]) =>
                    updateSetting("inferenceMarkupPercentage", value)
                  }
                  min={0}
                  max={500}
                  step={5}
                  className="w-full"
                />
                <div className="flex gap-1.5 flex-wrap">
                  {[0, 25, 50, 100, 200].map((preset) => (
                    <button
                      key={preset}
                      className={cn(
                        "px-3 py-1.5 text-xs rounded transition-all duration-200",
                        settings.inferenceMarkupPercentage === preset
                          ? "bg-purple-500/30 text-purple-300 border border-purple-500/30"
                          : "bg-white/5 text-white/50 hover:bg-white/10 border border-transparent",
                      )}
                      onClick={() =>
                        updateSetting("inferenceMarkupPercentage", preset)
                      }
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-white/10" />

              {/* Purchase Share */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/80">Purchase Share</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-white/30" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px]">
                        Your cut of credit purchases after platform fee.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span className="text-lg font-mono font-bold text-yellow-400">
                    {settings.purchaseSharePercentage}%
                  </span>
                </div>
                <Slider
                  value={[settings.purchaseSharePercentage]}
                  onValueChange={([value]) =>
                    updateSetting("purchaseSharePercentage", value)
                  }
                  min={0}
                  max={50}
                  step={5}
                  className="w-full"
                />
                <div className="flex gap-1.5 flex-wrap">
                  {[0, 10, 20, 30, 50].map((preset) => (
                    <button
                      key={preset}
                      className={cn(
                        "px-3 py-1.5 text-xs rounded transition-all duration-200",
                        settings.purchaseSharePercentage === preset
                          ? "bg-yellow-500/30 text-yellow-300 border border-yellow-500/30"
                          : "bg-white/5 text-white/50 hover:bg-white/10 border border-transparent",
                      )}
                      onClick={() =>
                        updateSetting("purchaseSharePercentage", preset)
                      }
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </BrandCard>

          {/* Earnings Simulator */}
          <EarningsSimulator
            markupPercentage={settings.inferenceMarkupPercentage}
            purchaseSharePercentage={settings.purchaseSharePercentage}
          />
        </div>

        {/* Revenue Flow Diagram */}
        <RevenueFlowDiagram
          markupPercentage={settings.inferenceMarkupPercentage}
          purchaseSharePercentage={settings.purchaseSharePercentage}
        />

        {/* Save Button */}
        {hasChanges && (
          <div className="flex justify-end sticky bottom-4 z-20">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-gradient-to-r from-[#FF5800] to-purple-600 text-white shadow-lg shadow-[#FF5800]/20"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        )}

        {/* Enable Monetization Confirmation Dialog */}
        <AlertDialog open={showEnableDialog} onOpenChange={setShowEnableDialog}>
          <AlertDialogContent className="bg-black/95 border-white/10">
            <CornerBrackets size="lg" color="#FF5800" className="opacity-30" />
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#FF5800]" />
                Enable Monetization?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-white/60 space-y-3">
                <p>When monetization is enabled, users of your app will:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Pay app-specific credits (separate balance)</li>
                  <li>See inference costs with your markup applied</li>
                  <li>Purchase credits that contribute to your earnings</li>
                </ul>
                <p className="pt-2 text-[#FF5800]">
                  You can adjust markup and purchase share after enabling.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  updateSetting("monetizationEnabled", true);
                  setShowEnableDialog(false);
                }}
                className="bg-gradient-to-r from-[#FF5800] to-purple-600 text-white"
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                Enable & Start Earning
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
