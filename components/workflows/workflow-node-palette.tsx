"use client";

import {
  Webhook,
  Bot,
  ImageIcon,
  FolderOutput,
  Clock,
  Globe,
  GitBranch,
  Volume2,
  MessageCircle,
} from "lucide-react";
import type { WorkflowNodeType } from "@/db/schemas";

interface WorkflowNodePaletteProps {
  onAddNode: (type: WorkflowNodeType) => void;
}

const nodeTypes = [
  {
    type: "trigger" as WorkflowNodeType,
    label: "Trigger",
    icon: Webhook,
    color: "green",
    description: "Start your workflow",
  },
  {
    type: "agent" as WorkflowNodeType,
    label: "AI Agent",
    icon: Bot,
    color: "blue",
    description: "Process with AI",
  },
  {
    type: "image" as WorkflowNodeType,
    label: "Image",
    icon: ImageIcon,
    color: "purple",
    description: "Generate images",
  },
  {
    type: "delay" as WorkflowNodeType,
    label: "Delay",
    icon: Clock,
    color: "amber",
    description: "Wait/pause",
  },
  {
    type: "http" as WorkflowNodeType,
    label: "HTTP",
    icon: Globe,
    color: "cyan",
    description: "API request",
  },
  {
    type: "condition" as WorkflowNodeType,
    label: "Condition",
    icon: GitBranch,
    color: "pink",
    description: "If/then branch",
  },
  {
    type: "tts" as WorkflowNodeType,
    label: "Text to Speech",
    icon: Volume2,
    color: "violet",
    description: "Generate audio",
  },
  {
    type: "discord" as WorkflowNodeType,
    label: "Discord",
    icon: MessageCircle,
    color: "indigo",
    description: "Send message",
  },
  {
    type: "output" as WorkflowNodeType,
    label: "Output",
    icon: FolderOutput,
    color: "orange",
    description: "Save or return",
  },
];

const colorClasses: Record<string, string> = {
  green: "bg-green-500/20 text-green-400 hover:bg-green-500/30",
  blue: "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30",
  purple: "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30",
  orange: "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30",
  amber: "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
  cyan: "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30",
  pink: "bg-pink-500/20 text-pink-400 hover:bg-pink-500/30",
  violet: "bg-violet-500/20 text-violet-400 hover:bg-violet-500/30",
  indigo: "bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30",
};

export function WorkflowNodePalette({ onAddNode }: WorkflowNodePaletteProps) {
  return (
    <div className="absolute top-4 left-4 bg-black/80 border border-white/10 rounded-xl p-3 space-y-2 backdrop-blur-sm">
      <div className="text-xs text-white/40 uppercase tracking-wider font-medium mb-3">
        Add Node
      </div>
      {nodeTypes.map((node) => (
        <button
          key={node.type}
          onClick={() => onAddNode(node.type)}
          className={`flex items-center gap-3 w-full p-2 rounded-lg transition-colors ${colorClasses[node.color as keyof typeof colorClasses]}`}
        >
          <node.icon className="w-4 h-4" />
          <div className="text-left">
            <div className="text-sm font-medium">{node.label}</div>
            <div className="text-xs opacity-60">{node.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
