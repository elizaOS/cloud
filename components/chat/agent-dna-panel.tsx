"use client";

import { X, Code, Eye, Database, FileUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface AgentDnaPanelProps {
  agentConfig?: Record<string, unknown>;
  onClose?: () => void;
}

export function AgentDnaPanel({
  agentConfig,
  onClose,
}: AgentDnaPanelProps) {
  // Default config if none provided
  const config = agentConfig || {
    agent: {
      basic_info: {
        name: "Zilo",
        username: "zilo_132",
        tagline: "Pragmatic marketing strategist for digital brands.",
        system_prompt:
          "You are a pragmatic marketing strategist that blends creativity with data insight. You like to analyze other campaigns and gather best practices in order to get to a better outcome.",
        category: "Marketing",
        language: "English",
      },
      content: {
        knowledge_areas: ["Growth", "Branding", "Strategy", "UX"],
        default_topics: [
          "digital strategy",
          "consumer behavior",
          "branding trends",
        ],
        example_prompts: [
          "Create a go-to-market plan for a startup.",
          "Analyze my brand's tone of voice.",
          "Write a content strategy for Gen Z consumers.",
        ],
        response_depth: "in-depth",
      },
      style: {
        tone: "Professional",
        formality: 0.6,
        humor: 0.3,
        creativity: 0.7,
        voice_style: "Advisor",
        signature_trait: "Uses short, punchy sentences.",
      },
      plugins: {
        enabled_tools: ["Web search", "Image generation", "Data analysis"],
        custom_plugins: ["Google Analytics", "Notion API"],
        permissions: {
          browse_web: true,
          read_docs: true,
          edit_files: false,
        },
        system_tokens: {},
        secure_notes: "Confidential project details",
      },
      avatar: {
        image: "zilo_avatar.png",
        color_theme: "#00FFCC",
        background_style: "Cosmic",
        animation_enabled: true,
      },
    },
  };

  const jsonString = JSON.stringify(config, null, 2);
  const lines = jsonString.split("\n");

  return (
    <div className="bg-neutral-950 border-l border-[#3e3e43] w-[587px] h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-0">
        <div className="flex flex-col gap-2">
          <p className="text-base font-mono font-bold text-white">Agent DNA</p>
          <p className="text-xs text-white/60">
            Configure your AI agent's behaviour and capabilities.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="hover:opacity-80 transition-opacity"
        >
          <X className="h-6 w-6 text-white" />
        </button>
      </div>

      {/* Tabs */}
      <div className="border-t border-[#3e3e43] flex items-start">
        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-[rgba(255,255,255,0.07)] border-b-2 border-white"
        >
          <Code className="h-4 w-4 text-white" />
          <p className="text-sm font-mono font-medium text-white tracking-tight">
            Settings
          </p>
        </button>

        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-2 py-3 border-b border-r border-[#3e3e43]"
        >
          <Eye className="h-4 w-4 text-[#A2A2A2]" />
          <p className="text-sm font-mono font-medium text-[#A2A2A2] tracking-tight">
            Model Calls
          </p>
        </button>

        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-2 py-3 border-b border-r border-[#3e3e43]"
        >
          <Database className="h-4 w-4 text-[#A2A2A2]" />
          <p className="text-sm font-mono font-medium text-[#A2A2A2] tracking-tight">
            Memories
          </p>
        </button>

        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-2 py-3 border-b border-r border-[#3e3e43]"
        >
          <FileUp className="h-4 w-4 text-[#A2A2A2]" />
          <p className="text-sm font-mono font-medium text-[#A2A2A2] tracking-tight">
            File Upload
          </p>
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center justify-between px-4 py-8">
        <div className="flex items-center">
          <button
            type="button"
            className="px-2.5 py-2.5 border-b-[1.6px] border-white"
          >
            <p className="text-sm font-mono font-medium text-white">General</p>
          </button>
          <button type="button" className="px-2.5 py-2.5">
            <p className="text-sm font-mono font-medium text-[#A2A2A2]">
              Content
            </p>
          </button>
          <button type="button" className="px-2.5 py-2.5">
            <p className="text-sm font-mono font-medium text-[#A2A2A2]">
              Style
            </p>
          </button>
          <button type="button" className="px-2.5 py-2.5">
            <p className="text-sm font-mono font-medium text-[#A2A2A2]">
              File Upload
            </p>
          </button>
          <button type="button" className="px-2.5 py-2.5">
            <p className="text-sm font-mono font-medium text-[#A2A2A2]">
              Avatar
            </p>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-white hover:opacity-80"
            title="View as JSON"
          >
            <span className="text-sm">{"{ }"}</span>
          </button>
          <Switch
            defaultChecked={true}
            className="data-[state=checked]:bg-[#FF5800]"
          />
        </div>
      </div>

      {/* JSON View */}
      <div className="flex-1 overflow-y-auto px-4 relative">
        <div className="flex gap-6 font-mono text-sm">
          {/* Line Numbers */}
          <div className="text-[#5d6160] text-right select-none space-y-0 leading-6">
            {lines.map((_, index) => (
              <div key={index}>{index + 1}</div>
            ))}
          </div>

          {/* JSON Content with Syntax Highlighting */}
          <pre className="flex-1 text-[#e434bb] leading-6 whitespace-pre-wrap">
            <code
              dangerouslySetInnerHTML={{
                __html: jsonString
                  .replace(/"([^"]+)":/g, '<span style="color:#fe9f6d">"$1":</span>')
                  .replace(/: "([^"]+)"/g, ': <span style="color:#d4d4d4">"$1"</span>')
                  .replace(/: (\d+\.?\d*)/g, ': <span style="color:#d4d4d4">$1</span>')
                  .replace(/: (true|false)/g, ': <span style="color:#d4d4d4">$1</span>')
                  .replace(/#([0-9A-F]{6})/gi, '<span style="color:#00ffcc">#$1</span>'),
              }}
            />
          </pre>
        </div>

        {/* Fade overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[212px] bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

