"use client";

import React, { useEffect } from "react";
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
import { Bot, Github, FileText } from "lucide-react";
import { SectionLabel, BrandCard } from "@/components/brand";
import Image from "next/image";
import { useReactFlow } from "@xyflow/react";

function ResizeHandler() {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const handleResize = () => fitView({ padding: 0.2, duration: 300 });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fitView]);
  return null;
}

const CustomNode = ({ data, sourcePosition, targetPosition }: any) => {
  const glowColor = data.glowColor || "#316AFF";
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
        className={`relative border-2 backdrop-blur-md rounded-sm group hover:scale-105 transition-transform duration-300 ${
          isIconOnly ? "px-5 py-4 min-w-[80px]" : "px-8 py-5 min-w-[140px]"
        }`}
        style={{
          borderColor: data.borderColor || "#2F55FF",
          backgroundColor: "rgba(36, 0, 120, 0.15)",
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
                color: "#316AFF",
                background: `radial-gradient(circle, #316AFF20 0%, transparent 70%)`,
              }}
            >
              {data.icon}
            </div>
          )}
          {data.label && (
            <div
              className="text-sm font-bold text-center whitespace-nowrap tracking-wider capitalize"
              style={{ color: "#316AFF", fontFamily: "var(--font-geist-mono)" }}
            >
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
  const bounceDots = React.useMemo(() => {
    const count = 90;

    const denominator = Math.max(count - 1, 1);

    return Array.from({ length: count }, (_, index) => {
      const progress = index / denominator;

      // Stronger exponential distribution: much denser on right
      const leftPercent = Math.pow(progress, 0.4) * 100;

      // Only render dots in the right 2/3 of the screen (skip left 1/3)
      if (leftPercent < 33) return null;

      // Digital bar graph effect: sharp, quick movements
      const wavePrimary = Math.abs(Math.sin(progress * Math.PI * 4.5));
      const waveSecondary = Math.abs(Math.sin(progress * Math.PI * 9.2));

      // Scale amplitude based on position: left side bounces less, right side more
      const positionScale = Math.pow((leftPercent - 33) / 67, 1.5);
      const amplitude =
        (8 + wavePrimary * 20 + waveSecondary * 12) *
        (0.3 + positionScale * 0.7);

      const delay = progress * 2.5;
      const duration = 1.2 + (index % 10) * 0.15;
      const size = 2.2 + waveSecondary * 1.0;

      return {
        id: index,
        leftPercent,
        amplitude,
        delay,
        duration,
        size,
      };
    }).filter((dot): dot is NonNullable<typeof dot> => dot !== null);
  }, []);
  const nodes: Node[] = [
    // Invisible source node off-screen left
    {
      id: "source-left",
      type: "custom",
      position: { x: -180, y: 266 },
      data: {
        label: "",
        borderColor: "transparent",
        glowColor: "transparent",
      },
      sourcePosition: Position.Right,
      style: { opacity: 0, pointerEvents: "none" },
    },
    {
      id: "agent",
      type: "custom",
      position: { x: 70, y: 231 },
      data: {
        label: "Agent",
        icon: <Bot className="h-7 w-7" />,
        borderColor: "#2F55FF",
        glowColor: "#316AFF",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: "claude",
      type: "custom",
      position: { x: 340, y: 167 },
      data: {
        label: "Claude",
        borderColor: "#2F55FF",
        glowColor: "#316AFF",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: "gpt",
      type: "custom",
      position: { x: 340, y: 257 },
      data: {
        label: "GPT",
        borderColor: "#2F55FF",
        glowColor: "#316AFF",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: "hermes",
      type: "custom",
      position: { x: 340, y: 347 },
      data: {
        label: "Hermes",
        borderColor: "#2F55FF",
        glowColor: "#316AFF",
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
        borderColor: "#2F55FF",
        glowColor: "#316AFF",
      },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    },
    {
      id: "notion",
      type: "custom",
      position: { x: 600, y: 250 },
      data: {
        icon: <FileText className="h-7 w-7" />,
        borderColor: "#2F55FF",
        glowColor: "#316AFF",
      },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    },
    {
      id: "x",
      type: "custom",
      position: { x: 600, y: 340 },
      data: {
        icon: (
          <svg
            className="h-7 w-7"
            fill="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        ),
        borderColor: "#2F55FF",
        glowColor: "#316AFF",
      },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    },
    // Invisible destination nodes off-screen right
    {
      id: "dest-github",
      type: "custom",
      position: { x: 770, y: 178 },
      data: {
        label: "",
        borderColor: "transparent",
        glowColor: "transparent",
      },
      targetPosition: Position.Left,
      style: { opacity: 0, pointerEvents: "none" },
    },
    {
      id: "dest-notion",
      type: "custom",
      position: { x: 770, y: 268 },
      data: {
        label: "",
        borderColor: "transparent",
        glowColor: "transparent",
      },
      targetPosition: Position.Left,
      style: { opacity: 0, pointerEvents: "none" },
    },
    {
      id: "dest-x",
      type: "custom",
      position: { x: 770, y: 358 },
      data: {
        label: "",
        borderColor: "transparent",
        glowColor: "transparent",
      },
      targetPosition: Position.Left,
      style: { opacity: 0, pointerEvents: "none" },
    },
  ];

  const edges: Edge[] = [
    // Line coming into agent from off-screen
    {
      id: "source-agent",
      source: "source-left",
      target: "agent",
      type: "straight",
      animated: true,
      style: {
        stroke: "#316AFF",
        strokeWidth: 2,
        filter: "drop-shadow(0 0 6px rgba(49, 106, 255, 0.6))",
      },
    },
    // Agent to LLMs
    ...["claude", "gpt", "hermes"].map((target, i) => ({
      id: `agent-${target}`,
      source: "agent",
      target,
      type: "smoothstep",
      animated: true,
      style: {
        stroke: "#316AFF",
        strokeWidth: 2,
        filter: "drop-shadow(0 0 6px rgba(49, 106, 255, 0.6))",
      },
    })),
    // LLMs to platforms
    ...["claude", "gpt", "hermes"].flatMap((source) =>
      ["github", "notion", "x"].map((target, i) => ({
        id: `${source}-${target}`,
        source,
        target,
        type: "smoothstep",
        animated: true,
        style: {
          stroke: "#316AFF",
          strokeWidth: 1.5,
          filter: "drop-shadow(0 0 4px rgba(49, 106, 255, 0.6))",
        },
      })),
    ),
    // Lines going out from platforms to off-screen
    {
      id: "github-dest",
      source: "github",
      target: "dest-github",
      type: "straight",
      animated: true,
      style: {
        stroke: "#316AFF",
        strokeWidth: 1.5,
        filter: "drop-shadow(0 0 4px rgba(49, 106, 255, 0.6))",
      },
    },
    {
      id: "notion-dest",
      source: "notion",
      target: "dest-notion",
      type: "straight",
      animated: true,
      style: {
        stroke: "#316AFF",
        strokeWidth: 1.5,
        filter: "drop-shadow(0 0 4px rgba(49, 106, 255, 0.6))",
      },
    },
    {
      id: "x-dest",
      source: "x",
      target: "dest-x",
      type: "straight",
      animated: true,
      style: {
        stroke: "#316AFF",
        strokeWidth: 1.5,
        filter: "drop-shadow(0 0 4px rgba(49, 106, 255, 0.6))",
      },
    },
  ];

  return (
    <section className="w-full py-12 md:py-20 lg:py-32 bg-[#0A0A0A]">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-8 md:mb-12">
          <div className="mb-3 md:mb-4">
            <SectionLabel>SMART, CONNECTED INTELLIGENCE</SectionLabel>
          </div>
          <h2
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-medium mb-3 md:mb-4 uppercase"
            style={{
              fontFamily: "var(--font-geist-sans)",
              lineHeight: "1.3",
              color: "#FFFFFF",
            }}
          >
            RUN YOUR AGENTS ON ANY MODEL
            <br />— CLAUDE, GPT, HERMES, AND MORE
          </h2>
          <p
            className="max-w-2xl font-normal text-sm md:text-base"
            style={{
              fontFamily: "var(--font-geist-mono)",
              lineHeight: "1.5",
              letterSpacing: "-0.003em",
              color: "#858585",
            }}
          >
            200+ LLMs. MCP Gateway for any tool or API.
          </p>
        </div>

        <div className="relative mb-20">
          {/* Skew background image with fade */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="relative w-full h-full">
              <Image
                src="/skew.png"
                alt=""
                fill
                className="object-cover"
                style={{
                  transform: "skewY(-3deg) scale(1.1)",
                  transformOrigin: "center",
                  maskImage:
                    "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.12) 20%, rgba(0,0,0,0.2) 30%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.08) 70%, transparent 85%), linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 15%, rgba(0,0,0,1) 25%, rgba(0,0,0,1) 85%, rgba(0,0,0,0.5) 95%, transparent 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.12) 20%, rgba(0,0,0,0.2) 30%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.08) 70%, transparent 85%), linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 15%, rgba(0,0,0,1) 25%, rgba(0,0,0,1) 85%, rgba(0,0,0,0.5) 95%, transparent 100%)",
                  maskComposite: "intersect",
                  WebkitMaskComposite: "source-in",
                }}
              />
            </div>
          </div>

          <div className="w-full h-[600px] relative">
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
              preventScrolling={false}
              style={{ background: "transparent" }}
            >
              <ResizeHandler />
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
            </ReactFlow>
          </div>

          <div className="router-bounce-layer">
            <div className="router-bounce-backdrop" />
            <div className="router-bounce-dots">
              {bounceDots.map((dot) => (
                <span
                  key={dot.id}
                  className="router-bounce-dot"
                  style={{
                    left: `calc(${dot.leftPercent}% - ${dot.size / 2}px)`,
                    width: `${dot.size}px`,
                    height: `${dot.size}px`,
                    animation: `router-dot-bounce ${dot.duration}s ease-in-out infinite`,
                    animationDelay: `${dot.delay}s`,
                    boxShadow: `0 0 ${Math.max(6, dot.size * 3)}px rgba(255, 122, 26, 0.75)`,
                    ["--dot-amplitude" as any]: `${dot.amplitude}px`,
                  }}
                />
              ))}
            </div>
            <style jsx>{`
              .router-bounce-layer {
                position: absolute;
                inset: auto 0 0 0;
                height: 6rem;
                pointer-events: none;
                overflow: hidden;
              }

              .router-bounce-backdrop {
                position: absolute;
                inset: auto 0 0 0;
                height: 4rem;
                background: linear-gradient(
                  180deg,
                  rgba(10, 10, 10, 0) 0%,
                  rgba(10, 10, 10, 0.6) 55%,
                  rgba(10, 10, 10, 0.95) 100%
                );
              }

              .router-bounce-dots {
                position: absolute;
                inset: 0;
                display: block;
              }

              .router-bounce-dot {
                position: absolute;
                bottom: 6px;
                border-radius: 50%;
                background: radial-gradient(
                  circle at 50% 30%,
                  rgba(255, 186, 94, 0.95) 0%,
                  rgba(255, 122, 26, 1) 45%,
                  rgba(255, 122, 26, 0.4) 100%
                );
                transform: translate3d(0, 0, 0);
                will-change: transform;
                opacity: 0.85;
              }

              @keyframes router-dot-bounce {
                0%,
                100% {
                  transform: translateY(0) scale(1);
                  opacity: 0.6;
                }

                40% {
                  opacity: 0.95;
                }

                50% {
                  transform: translateY(calc(-1 * var(--dot-amplitude, 24px)))
                    scale(1.12);
                  opacity: 1;
                }
              }

              @media (max-width: 768px) {
                .router-bounce-layer {
                  height: 4.5rem;
                }

                .router-bounce-backdrop {
                  height: 3rem;
                }
              }
            `}</style>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RouterSection;
