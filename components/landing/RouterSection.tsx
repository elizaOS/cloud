"use client";

import React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Edge,
  Node,
  Position,
  Handle,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Bot, Github, Twitter, Slack, Database, Zap } from "lucide-react";
import { SectionLabel, BrandCard } from "@/components/brand";

const CustomNode = ({ data, sourcePosition, targetPosition }: any) => {
  const glowColor = data.glowColor || "#3b82f6";
  const isIconOnly = data.icon && !data.label;

  return (
    <div className="relative">
      {targetPosition && (
        <Handle
          type="target"
          position={targetPosition}
          style={{
            background: glowColor,
            width: 10,
            height: 10,
            boxShadow: `0 0 10px ${glowColor}`,
            border: "2px solid rgba(255, 255, 255, 0.2)",
          }}
        />
      )}
      <div
        className={`relative border-2 bg-gradient-to-br from-black/90 to-black/70 backdrop-blur-md rounded-sm group hover:scale-105 transition-transform duration-300 ${
          isIconOnly ? "px-5 py-4 min-w-[80px]" : "px-8 py-5 min-w-[140px]"
        }`}
        style={{
          borderColor: data.borderColor || "#3b82f6",
          boxShadow: `0 0 20px ${glowColor}40, inset 0 0 20px ${glowColor}10`,
        }}
      >
        {/* Corner accents */}
        <div
          className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2"
          style={{ borderColor: glowColor }}
        />
        <div
          className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2"
          style={{ borderColor: glowColor }}
        />
        <div
          className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2"
          style={{ borderColor: glowColor }}
        />
        <div
          className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2"
          style={{ borderColor: glowColor }}
        />

        {/* Animated scan line */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden"
          style={{
            background: `linear-gradient(180deg, transparent 0%, ${glowColor}40 50%, transparent 100%)`,
            animation: "scan 3s linear infinite",
          }}
        />

        <div className="flex flex-col items-center gap-2 relative z-10">
          {data.icon && (
            <div
              className="p-2 rounded-full"
              style={{
                color: glowColor,
                background: `radial-gradient(circle, ${glowColor}20 0%, transparent 70%)`,
              }}
            >
              {data.icon}
            </div>
          )}
          {data.label && (
            <div className="text-white text-sm font-bold text-center whitespace-nowrap tracking-wider uppercase">
              {data.label}
            </div>
          )}
        </div>
      </div>
      {sourcePosition && (
        <Handle
          type="source"
          position={sourcePosition}
          style={{
            background: glowColor,
            width: 10,
            height: 10,
            boxShadow: `0 0 10px ${glowColor}`,
            border: "2px solid rgba(255, 255, 255, 0.2)",
          }}
        />
      )}
      <style jsx>{`
        @keyframes scan {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(200%);
          }
        }
      `}</style>
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

const RouterSection = () => {
  const nodes: Node[] = [
    {
      id: "agent",
      type: "custom",
      position: { x: 70, y: 235 },
      data: {
        label: "Agent",
        icon: <Bot className="h-7 w-7" />,
        borderColor: "#FF5800",
        glowColor: "#FF5800",
      },
      sourcePosition: Position.Right,
    },
    {
      id: "claude",
      type: "custom",
      position: { x: 340, y: 140 },
      data: {
        label: "Claude",
        borderColor: "#3b82f6",
        glowColor: "#3b82f6",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: "gpt",
      type: "custom",
      position: { x: 340, y: 220 },
      data: {
        label: "GPT",
        borderColor: "#10b981",
        glowColor: "#10b981",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: "hermes",
      type: "custom",
      position: { x: 340, y: 300 },
      data: {
        label: "Hermes",
        borderColor: "#8b5cf6",
        glowColor: "#8b5cf6",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: "gemini",
      type: "custom",
      position: { x: 340, y: 380 },
      data: {
        label: "Gemini",
        borderColor: "#ec4899",
        glowColor: "#ec4899",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: "github",
      type: "custom",
      position: { x: 600, y: 160 },
      data: {
        icon: <Github className="h-7 w-7" />,
        borderColor: "#8b5cf6",
        glowColor: "#8b5cf6",
      },
      targetPosition: Position.Left,
    },
    {
      id: "twitter",
      type: "custom",
      position: { x: 600, y: 250 },
      data: {
        icon: <Twitter className="h-7 w-7" />,
        borderColor: "#3b82f6",
        glowColor: "#3b82f6",
      },
      targetPosition: Position.Left,
    },
    {
      id: "slack",
      type: "custom",
      position: { x: 600, y: 340 },
      data: {
        icon: <Slack className="h-7 w-7" />,
        borderColor: "#eab308",
        glowColor: "#eab308",
      },
      targetPosition: Position.Left,
    },
  ];

  const edges: Edge[] = [
    // Agent to LLMs
    ...["claude", "gpt", "hermes", "gemini"].map((target, i) => ({
      id: `agent-${target}`,
      source: "agent",
      target,
      type: "smoothstep",
      animated: true,
      style: {
        stroke: "url(#gradient1)",
        strokeWidth: 2,
        filter: "drop-shadow(0 0 6px rgba(255, 88, 0, 0.6))",
      },
    })),
    // LLMs to platforms
    ...["claude", "gpt", "hermes", "gemini"].flatMap((source) =>
      ["github", "twitter", "slack"].map((target, i) => ({
        id: `${source}-${target}`,
        source,
        target,
        type: "smoothstep",
        animated: true,
        style: {
          stroke: `url(#gradient${(i % 3) + 2})`,
          strokeWidth: 1.5,
          filter: `drop-shadow(0 0 4px rgba(${
            i === 0 ? "139, 92, 246" : i === 1 ? "59, 130, 246" : "234, 179, 8"
          }, 0.6))`,
        },
      })),
    ),
  ];

  return (
    <section className="w-full py-20 md:py-32 bg-[#0A0A0A] relative">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-12">
          <div className="mb-4">
            <SectionLabel>SMART, CONNECTED INTELLIGENCE</SectionLabel>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span style={{ color: "#0B35F1" }}>
              RUN YOUR AGENTS ON ANY MODEL
            </span>
            <br />
            <span style={{ color: "#0B35F1" }}>
              — CLAUDE, GPT, HERMES, AND MORE
            </span>
          </h2>
          <p className="text-white/70 max-w-2xl">
            Eliza Cloud dynamically routes inference across 200+ LLMs and
            integrates the MCP Gateway for seamless access to any compatible
            tool or API — from Notion to GitHub.
          </p>
        </div>

        <BrandCard
          corners={false}
          className="w-full h-[600px] rounded-lg overflow-hidden cursor-default pointer-events-none"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            panOnScroll={false}
            panOnDrag={false}
            preventScrolling={true}
          >
            <svg style={{ position: "absolute", width: 0, height: 0 }}>
              <defs>
                <linearGradient
                  id="gradient1"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#FF5800" stopOpacity="1" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="1" />
                </linearGradient>
                <linearGradient
                  id="gradient2"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="1" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="1" />
                </linearGradient>
                <linearGradient
                  id="gradient3"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="1" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="1" />
                </linearGradient>
                <linearGradient
                  id="gradient4"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#eab308" stopOpacity="1" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="1" />
                </linearGradient>
                <linearGradient
                  id="gradient5"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="1" />
                  <stop offset="100%" stopColor="#eab308" stopOpacity="1" />
                </linearGradient>
              </defs>
            </svg>
            <Background color="#ffffff10" gap={16} />
          </ReactFlow>
        </BrandCard>

        <div className="mt-8">
          <button className="inline-flex items-center gap-2 text-white hover:text-white/80 transition-colors">
            Learn more
            <span>→</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default RouterSection;
