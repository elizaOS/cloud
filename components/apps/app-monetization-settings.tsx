/**
 * App monetization settings component for configuring app revenue sharing.
 * Supports enabling monetization, setting markup percentages, and platform offset amounts.
 *
 * @param props - App monetization settings configuration
 * @param props.appId - App ID to configure monetization for
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Loader2, Save, Info, Zap, Coins, AlertCircle } from "lucide-react";
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
      const response = await fetch(`/api/v1/apps/${appId}/monetization`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.success && data.monetization) {
        setSettings(data.monetization);
      }
      setIsLoading(false);
    };
    fetchSettings();
  }, [appId]);

  const handleSave = async () => {
    setIsSaving(true);
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
    if (!response.ok) throw new Error(data.error || "Failed to save");
    toast.success("Settings saved");
    setHasChanges(false);
    setIsSaving(false);
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

  // Example calculations
  const inferenceExample =
    0.01 * (1 + settings.inferenceMarkupPercentage / 100);
  const purchaseExample =
    (10 - settings.platformOffsetAmount) *
    (settings.purchaseSharePercentage / 100);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Info Banner when disabled */}
        {!settings.monetizationEnabled && (
          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10 flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white mb-1">
                  Enable monetization to earn
                </p>
                <p className="text-xs text-white/60">
                  When enabled, you&apos;ll earn from inference markups and
                  credit purchases. Users will pay app-specific credits instead
                  of organization credits.
                </p>
              </div>
            </div>
          </BrandCard>
        )}

        {/* Main Toggle */}
        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${settings.monetizationEnabled ? "bg-green-500/20" : "bg-white/5"}`}
              >
                <Coins
                  className={`h-5 w-5 ${settings.monetizationEnabled ? "text-green-400" : "text-white/40"}`}
                />
              </div>
              <div>
                <p className="font-medium text-white">Monetization</p>
                <p className="text-xs text-white/50">
                  {settings.monetizationEnabled
                    ? "Earning from usage"
                    : "Not earning"}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.monetizationEnabled}
              onCheckedChange={(checked) => {
                if (checked && !settings.monetizationEnabled) {
                  // Show confirmation when enabling
                  setShowEnableDialog(true);
                } else {
                  updateSetting("monetizationEnabled", checked);
                }
              }}
            />
          </div>
        </BrandCard>

        {/* Revenue Settings */}
        <BrandCard>
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 space-y-6">
            {/* Inference Markup */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-purple-400" />
                  <span className="text-sm font-medium text-white">
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
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/40">
                    $0.01 → ${inferenceExample.toFixed(3)}
                  </span>
                  <span className="text-lg font-mono font-bold text-purple-400 w-16 text-right">
                    {settings.inferenceMarkupPercentage}%
                  </span>
                </div>
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
              <div className="flex gap-1.5">
                {[0, 25, 50, 100, 200].map((preset) => (
                  <button
                    key={preset}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      settings.inferenceMarkupPercentage === preset
                        ? "bg-purple-500/30 text-purple-300"
                        : "bg-white/5 text-white/50 hover:bg-white/10"
                    }`}
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
                  <Coins className="h-4 w-4 text-yellow-400" />
                  <span className="text-sm font-medium text-white">
                    Purchase Share
                  </span>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-white/30" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[200px]">
                      Your cut of credit purchases after $
                      {settings.platformOffsetAmount} platform fee.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/40">
                    $10 → ${purchaseExample.toFixed(2)}
                  </span>
                  <span className="text-lg font-mono font-bold text-yellow-400 w-16 text-right">
                    {settings.purchaseSharePercentage}%
                  </span>
                </div>
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
              <div className="flex gap-1.5">
                {[0, 10, 20, 30, 50].map((preset) => (
                  <button
                    key={preset}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      settings.purchaseSharePercentage === preset
                        ? "bg-yellow-500/30 text-yellow-300"
                        : "bg-white/5 text-white/50 hover:bg-white/10"
                    }`}
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

        {/* Earnings Summary (only if has earnings) */}
        {settings.totalCreatorEarnings > 0 && (
          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <p className="text-xs text-white/50">Lifetime Earnings</p>
                <p className="text-2xl font-bold text-green-400">
                  ${settings.totalCreatorEarnings.toFixed(2)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/60 hover:text-white"
                onClick={() => {
                  router.push(`/dashboard/apps/${appId}?tab=earnings`);
                }}
              >
                View Details →
              </Button>
            </div>
          </BrandCard>
        )}

        {/* Save Button */}
        {hasChanges && (
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              size="sm"
              className="bg-gradient-to-r from-[#FF5800] to-purple-600"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1.5" />
                  Save
                </>
              )}
            </Button>
          </div>
        )}

        {/* Enable Monetization Confirmation Dialog */}
        <AlertDialog open={showEnableDialog} onOpenChange={setShowEnableDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Enable Monetization?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>When monetization is enabled, users of your app will:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>
                    Pay app-specific credits (separate from their organization
                    balance)
                  </li>
                  <li>See inference costs with your markup applied</li>
                  <li>Purchase credits that contribute to your earnings</li>
                </ul>
                <p className="pt-2">
                  You can adjust markup and purchase share percentages below.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  updateSetting("monetizationEnabled", true);
                  setShowEnableDialog(false);
                }}
                className="bg-gradient-to-r from-[#FF5800] to-purple-600"
              >
                Enable Monetization
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
