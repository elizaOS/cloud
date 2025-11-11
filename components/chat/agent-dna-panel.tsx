"use client";

import { useState } from "react";
import { Settings, Sparkles, Database, Upload, FileText } from "lucide-react";
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
import { Button } from "@/components/ui/button";

type Tab = "settings" | "model-calls" | "memories" | "uploads";
type SettingsTab = "general" | "content" | "style" | "avatar";

export function AgentDNAPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("settings");
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("general");
  const [jsonMode, setJsonMode] = useState(false);

  return (
    <div className="w-[593px] bg-[#0a0a0a] border-l border-[#3e3e43] flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-[#3e3e43] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#FF5800]" />
          <h2 
            className="font-['Roboto_Mono'] font-medium text-white text-[16px] leading-normal"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            Agent DNA
          </h2>
        </div>
        <p 
          className="font-['Roboto_Flex'] font-normal text-[#858585] text-[12px] leading-normal"
          style={{ fontFamily: "'Roboto Flex', sans-serif" }}
        >
          Configure your AI agent&apos;s behaviour and capabilities.
        </p>
      </div>

      {/* Main Tabs */}
      <div className="flex border-b border-[#3e3e43]">
        <button
          onClick={() => setActiveTab("settings")}
          className={`
            flex items-center gap-2 px-4 py-3 border-b-2 transition-colors
            ${activeTab === "settings" 
              ? "border-white text-white" 
              : "border-transparent text-[#858585] hover:text-white"
            }
          `}
        >
          <Settings className="w-4 h-4" />
          <span 
            className="font-['Roboto_Mono'] font-medium text-[14px] leading-normal"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            Settings
          </span>
        </button>
        <button
          onClick={() => setActiveTab("model-calls")}
          className={`
            flex items-center gap-2 px-4 py-3 border-b-2 transition-colors
            ${activeTab === "model-calls" 
              ? "border-white text-white" 
              : "border-transparent text-[#858585] hover:text-white"
            }
          `}
        >
          <Sparkles className="w-4 h-4" />
          <span 
            className="font-['Roboto_Mono'] font-medium text-[14px] leading-normal"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            Model Calls
          </span>
        </button>
        <button
          onClick={() => setActiveTab("memories")}
          className={`
            flex items-center gap-2 px-4 py-3 border-b-2 transition-colors
            ${activeTab === "memories" 
              ? "border-white text-white" 
              : "border-transparent text-[#858585] hover:text-white"
            }
          `}
        >
          <Database className="w-4 h-4" />
          <span 
            className="font-['Roboto_Mono'] font-medium text-[14px] leading-normal"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            Memories
          </span>
        </button>
        <button
          onClick={() => setActiveTab("uploads")}
          className={`
            flex items-center gap-2 px-4 py-3 border-b-2 transition-colors
            ${activeTab === "uploads" 
              ? "border-white text-white" 
              : "border-transparent text-[#858585] hover:text-white"
            }
          `}
        >
          <Upload className="w-4 h-4" />
          <span 
            className="font-['Roboto_Mono'] font-medium text-[14px] leading-normal"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            Uploads
          </span>
        </button>
      </div>

      {/* Settings Tab Content */}
      {activeTab === "settings" && (
        <>
          {/* Sub-tabs + JSON Toggle */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#2e2e2e]">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveSettingsTab("general")}
                className={`
                  font-['Roboto_Mono'] font-medium text-[12px] pb-1 border-b-2 transition-colors
                  ${activeSettingsTab === "general" 
                    ? "border-white text-white" 
                    : "border-transparent text-[#858585] hover:text-white"
                  }
                `}
                style={{ fontFamily: "'Roboto Mono', monospace" }}
              >
                General
              </button>
              <button
                onClick={() => setActiveSettingsTab("content")}
                className={`
                  font-['Roboto_Mono'] font-medium text-[12px] pb-1 border-b-2 transition-colors
                  ${activeSettingsTab === "content" 
                    ? "border-white text-white" 
                    : "border-transparent text-[#858585] hover:text-white"
                  }
                `}
                style={{ fontFamily: "'Roboto Mono', monospace" }}
              >
                Content
              </button>
              <button
                onClick={() => setActiveSettingsTab("style")}
                className={`
                  font-['Roboto_Mono'] font-medium text-[12px] pb-1 border-b-2 transition-colors
                  ${activeSettingsTab === "style" 
                    ? "border-white text-white" 
                    : "border-transparent text-[#858585] hover:text-white"
                  }
                `}
                style={{ fontFamily: "'Roboto Mono', monospace" }}
              >
                Style
              </button>
              <button
                onClick={() => setActiveSettingsTab("avatar")}
                className={`
                  font-['Roboto_Mono'] font-medium text-[12px] pb-1 border-b-2 transition-colors
                  ${activeSettingsTab === "avatar" 
                    ? "border-white text-white" 
                    : "border-transparent text-[#858585] hover:text-white"
                  }
                `}
                style={{ fontFamily: "'Roboto Mono', monospace" }}
              >
                Avatar
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span 
                className="font-['Roboto_Mono'] font-medium text-[#858585] text-[12px]"
                style={{ fontFamily: "'Roboto Mono', monospace" }}
              >
                JSON
              </span>
              <Switch checked={jsonMode} onCheckedChange={setJsonMode} />
            </div>
          </div>

          {/* General Tab Form */}
          {activeSettingsTab === "general" && !jsonMode && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label 
                  className="font-['Roboto_Mono'] font-medium text-white text-[14px]"
                  style={{ fontFamily: "'Roboto Mono', monospace" }}
                >
                  Name
                </Label>
                <Input
                  placeholder="Agent's name"
                  className="bg-[#1d1d1d] border-[#3e3e43] text-white font-['Roboto_Flex']"
                  style={{ fontFamily: "'Roboto Flex', sans-serif" }}
                />
                <p 
                  className="font-['Roboto_Flex'] font-normal text-[#727272] text-[12px]"
                  style={{ fontFamily: "'Roboto Flex', sans-serif" }}
                >
                  The primary identifier for this agent
                </p>
              </div>

              {/* Username */}
              <div className="space-y-2">
                <Label 
                  className="font-['Roboto_Mono'] font-medium text-white text-[14px]"
                  style={{ fontFamily: "'Roboto Mono', monospace" }}
                >
                  Username
                </Label>
                <Input
                  placeholder="zilo_132"
                  className="bg-[#1d1d1d] border-[#3e3e43] text-white font-['Roboto_Flex']"
                  style={{ fontFamily: "'Roboto Flex', sans-serif" }}
                />
                <p 
                  className="font-['Roboto_Flex'] font-normal text-[#727272] text-[12px]"
                  style={{ fontFamily: "'Roboto Flex', sans-serif" }}
                >
                  Used in URLs and API endpoints
                </p>
              </div>

              {/* System Prompt */}
              <div className="space-y-2">
                <Label 
                  className="font-['Roboto_Mono'] font-medium text-white text-[14px]"
                  style={{ fontFamily: "'Roboto Mono', monospace" }}
                >
                  System
                </Label>
                <Textarea
                  placeholder="System Prompt"
                  className="bg-[#1d1d1d] border-[#3e3e43] text-white min-h-[100px] font-['Roboto_Flex']"
                  style={{ fontFamily: "'Roboto Flex', sans-serif" }}
                />
                <p 
                  className="font-['Roboto_Flex'] font-normal text-[#727272] text-[12px]"
                  style={{ fontFamily: "'Roboto Flex', sans-serif" }}
                >
                  System prompt defining agent behaviour
                </p>
              </div>

              {/* Voice Model */}
              <div className="space-y-2">
                <Label 
                  className="font-['Roboto_Mono'] font-medium text-white text-[14px]"
                  style={{ fontFamily: "'Roboto Mono', monospace" }}
                >
                  Voice Model
                </Label>
                <Select>
                  <SelectTrigger className="bg-[#1d1d1d] border-[#3e3e43] text-white">
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="adam">Eleven Labs &quot;Adam&quot;</SelectItem>
                  </SelectContent>
                </Select>
                <p 
                  className="font-['Roboto_Flex'] font-normal text-[#727272] text-[12px]"
                  style={{ fontFamily: "'Roboto Flex', sans-serif" }}
                >
                  General area or archetype
                </p>
              </div>

              {/* Visibility */}
              <div className="space-y-2">
                <Label 
                  className="font-['Roboto_Mono'] font-medium text-white text-[14px]"
                  style={{ fontFamily: "'Roboto Mono', monospace" }}
                >
                  Visibility
                </Label>
                <Select>
                  <SelectTrigger className="bg-[#1d1d1d] border-[#3e3e43] text-white">
                    <SelectValue placeholder="Public" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">🌐 Public</SelectItem>
                    <SelectItem value="private">🔒 Private</SelectItem>
                  </SelectContent>
                </Select>
                <p 
                  className="font-['Roboto_Flex'] font-normal text-[#727272] text-[12px]"
                  style={{ fontFamily: "'Roboto Flex', sans-serif" }}
                >
                  Who&apos;s going to see your Agent
                </p>
              </div>
            </div>
          )}

          {/* JSON Mode */}
          {jsonMode && (
            <div className="flex-1 overflow-y-auto p-4">
              <Textarea
                placeholder="{}"
                className="bg-[#1d1d1d] border-[#3e3e43] text-white min-h-[400px] font-mono text-[12px]"
              />
            </div>
          )}

          {/* Other Tabs Placeholder */}
          {activeTab !== "settings" && (
            <div className="flex-1 flex items-center justify-center p-8">
              <p 
                className="font-['Roboto_Flex'] font-normal text-[#858585] text-[14px] text-center"
                style={{ fontFamily: "'Roboto Flex', sans-serif" }}
              >
                {activeTab === "model-calls" && "Model Calls configuration coming soon"}
                {activeTab === "memories" && "Memory management coming soon"}
                {activeTab === "uploads" && "File uploads coming soon"}
              </p>
            </div>
          )}
        </>
      )}

      {/* Footer Actions */}
      <div className="p-4 border-t border-[#3e3e43] flex gap-3">
        <Button 
          variant="outline" 
          className="flex-1 bg-transparent border-[#3e3e43] text-white hover:bg-white/5"
        >
          <span 
            className="font-['Roboto_Mono'] font-medium text-[14px]"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            Export
          </span>
        </Button>
        <Button 
          className="flex-1 bg-white text-black hover:bg-white/90"
        >
          <span 
            className="font-['Roboto_Mono'] font-medium text-[14px]"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            Save
          </span>
        </Button>
      </div>
    </div>
  );
}

