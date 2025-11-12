"use client";

import { useState } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface GeneralTabProps {
  user: UserWithOrganization;
}

export function GeneralTab({ user }: GeneralTabProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(user.name || "");
  const [nickname, setNickname] = useState(user.nickname || "");
  const [workFunction, setWorkFunction] = useState(user.work_function || "");
  const [preferences, setPreferences] = useState(user.preferences || "");
  const [responseNotifications, setResponseNotifications] = useState(
    user.response_notifications ?? true,
  );
  const [emailNotifications, setEmailNotifications] = useState(
    user.email_notifications ?? true,
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);

    try {
      const response = await fetch("/api/v1/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName,
          nickname,
          work_function: workFunction,
          preferences,
          response_notifications: responseNotifications,
          email_notifications: emailNotifications,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save settings");
      }

      toast.success("Settings saved successfully");
      router.refresh();
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save settings",
      );
    } finally {
      setSaving(false);
    }
  };

  // Get user initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6 pb-6 md:pb-8">
      {/* Profile Information Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-4 md:space-y-6">
          {/* Full Name and Nickname Row */}
          <div className="flex flex-col md:flex-row gap-4 w-full">
            {/* Full Name */}
            <div className="flex-1 space-y-2">
              <Label className="text-white font-mono text-sm md:text-base">
                Full name
              </Label>
              <div className="flex gap-2">
                {/* Avatar */}
                <div className="flex items-center justify-center bg-[rgba(255,88,0,0.25)] px-2 py-2 min-w-[36px]">
                  <span className="text-white text-sm font-normal">
                    {getInitials(fullName || "DR")}
                  </span>
                </div>
                {/* Input */}
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="flex-1 bg-transparent border-[#303030] text-white"
                  placeholder="Enter your full name"
                />
              </div>
            </div>

            {/* Nickname */}
            <div className="flex-1 space-y-2">
              <Label className="text-white font-mono text-sm md:text-base">
                What should we call you?
              </Label>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="bg-transparent border-[#303030] text-white"
                placeholder="Diogo"
              />
            </div>
          </div>

          {/* Work Function */}
          <div className="space-y-2">
            <Label className="text-white font-mono text-sm md:text-base">
              What best describes your work?
            </Label>
            <Select value={workFunction} onValueChange={setWorkFunction}>
              <SelectTrigger className="bg-transparent border-[#303030] text-white data-[placeholder]:text-white/60">
                <SelectValue placeholder="Select your work function" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-[#303030]">
                <SelectItem value="developer">Software Developer</SelectItem>
                <SelectItem value="designer">Designer</SelectItem>
                <SelectItem value="product">Product Manager</SelectItem>
                <SelectItem value="data">Data Scientist</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Personal Preferences */}
          <div className="space-y-2">
            <Label className="text-white font-mono text-sm md:text-base">
              What personal preferences should Eliza consider in responses?
            </Label>
            <p className="text-xs text-[#858585] font-mono">
              Your preferences will apply to all conversations, within{" "}
              <span className="underline cursor-pointer hover:text-white transition-colors">
                Eliza&apos;s guidelines
              </span>
              .{" "}
              <span className="underline cursor-pointer hover:text-white transition-colors">
                Learn about preferences.
              </span>
            </p>
            <Textarea
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              className="bg-transparent border-[#303030] text-white min-h-[80px] resize-none"
              placeholder="e.g. when learning new concepts, I find analogies particularly helpful"
            />
          </div>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="relative bg-[#e1e1e1] px-4 py-2.5 overflow-hidden group hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto"
          >
            {/* Pattern overlay */}
            <div
              className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
              style={{
                backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                backgroundSize: "2.915576934814453px 2.915576934814453px",
              }}
            />
            <span className="relative z-10 text-black font-mono font-medium text-sm md:text-base whitespace-nowrap">
              {saving ? "Saving..." : "Save changes"}
            </span>
          </button>
        </div>
      </BrandCard>

      {/* Response Completions Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-4 md:space-y-6">
          {/* Response Completions */}
          <div className="space-y-2">
            <Label className="text-white font-mono text-sm md:text-base">
              Response completions
            </Label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <p className="text-xs text-[#858585] font-mono max-w-2xl">
                Get notiified when Eliza has finished a response. Most useful
                for long-running tasks like too calls, and research.
              </p>
              <Switch
                checked={responseNotifications}
                onCheckedChange={setResponseNotifications}
                className="data-[state=checked]:bg-[#FF5800] flex-shrink-0"
              />
            </div>
          </div>

          {/* Email Notifications */}
          <div className="space-y-2">
            <Label className="text-white font-mono text-sm md:text-base">
              Emails from Eliza
            </Label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <p className="text-xs text-[#858585] font-mono max-w-2xl">
                Get an email when Eliza has finished building or needs your
                response.
              </p>
              <Switch
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
                className="data-[state=checked]:bg-[#FF5800] flex-shrink-0"
              />
            </div>
          </div>
        </div>
      </BrandCard>
    </div>
  );
}
