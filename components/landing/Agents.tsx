"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Bot,
  Zap,
  Shield,
  Code,
  MessageSquare,
  MoreVertical,
  ChevronRight,
} from "lucide-react";

const Agents = () => {
  const agents = [
    {
      title: "Social Media Manager",
      description:
        "Automate your social media presence with intelligent posting and engagement",
      icon: <Bot className="h-6 w-6" />,
      color: "#3b82f6",
    },
    {
      title: "Customer Support",
      description: "Provide 24/7 customer support with AI-powered responses",
      icon: <Zap className="h-6 w-6" />,
      color: "#10b981",
    },
    {
      title: "Security Monitor",
      description:
        "Monitor and protect your systems with intelligent threat detection",
      icon: <Shield className="h-6 w-6" />,
      color: "#8b5cf6",
    },
    {
      title: "Code Assistant",
      description:
        "Accelerate development with AI-powered code generation and review",
      icon: <Code className="h-6 w-6" />,
      color: "#FF5800",
    },
  ];

  return (
    <section className="w-full py-20 md:py-32 bg-[#0A0A0A] relative">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-16 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "#FF5800" }}
            />
            <p className="text-lg md:text-xl uppercase tracking-wider text-white font-medium">
              PRE-BUILT AGENTS
            </p>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 text-white">
            Start with Expert Templates
          </h2>
          <p className="text-white/70 max-w-2xl mx-auto text-lg">
            Launch faster with our curated collection of production-ready AI
            agents
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {agents.map((agent, index) => (
            <div
              key={index}
              className="relative bg-black/40 border border-white/10 p-6 hover:border-white/30 transition-all duration-300 group"
            >
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-[#E1E1E1]" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-[#E1E1E1]" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-[#E1E1E1]" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-[#E1E1E1]" />

              {/* Icon */}
              <div
                className="mb-4 inline-flex p-3 rounded-lg"
                style={{
                  backgroundColor: `${agent.color}20`,
                  color: agent.color,
                }}
              >
                {agent.icon}
              </div>

              {/* Content */}
              <h3 className="text-xl font-bold text-white mb-2">
                {agent.title}
              </h3>
              <p className="text-white/60 text-sm mb-4">{agent.description}</p>

              {/* Action button */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-white/70 hover:text-white hover:bg-white/5 group-hover:bg-white/10"
              >
                <span>Use Template</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button
            variant="outline"
            size="lg"
            className="border-white/20 hover:bg-white/10"
          >
            View All Agent Templates
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        {/* Community Agents Showcase */}
        <AgentsShowcase />
      </div>
    </section>
  );
};

const categories = [
  "All Agents",
  "Marketing",
  "Writing",
  "E-commerce",
  "Content Creator",
  "Humor",
  "Entertainment",
  "History",
];

const communityAgents = [
  {
    id: 1,
    name: "Ember",
    image: "/agents/agent-1.png",
    traits: ["Curious", "Sharp", "In tune"],
    description: "Guides self-growth and burnout recovery",
    comments: 156,
  },
  {
    id: 2,
    name: "Sol",
    image: "/agents/agent-2.png",
    traits: ["Curious", "Sharp", "In tune"],
    description: "Knows the arts and everything pop culture",
    comments: 156,
  },
  {
    id: 3,
    name: "Pixel",
    image: "/agents/agent-3.png",
    traits: ["Curious", "Sharp", "In tune"],
    description: "Optimizes e-commerce and UX with intuition",
    comments: 156,
  },
];

function AgentsShowcase() {
  const [activeCategory, setActiveCategory] = useState("All Agents");

  return (
    <div className="relative mt-32">
      {/* Corner brackets */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 top-0 h-16 w-16 border-l-2 border-t-2 border-[#E1E1E1]" />
        <div className="absolute right-0 top-0 h-16 w-16 border-r-2 border-t-2 border-[#E1E1E1]" />
        <div className="absolute bottom-0 left-0 h-16 w-16 border-b-2 border-l-2 border-[#E1E1E1]" />
        <div className="absolute right-0 bottom-0 h-16 w-16 border-b-2 border-r-2 border-[#E1E1E1]" />
      </div>

      <div className="mx-auto max-w-7xl px-8 py-12">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "#FF5800" }}
            />
            <h2 className="text-lg md:text-xl uppercase tracking-wider text-white font-medium">
              From the Community
            </h2>
          </div>
          <button className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
            Explore All
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="mb-12 flex flex-wrap gap-0">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`rounded-none px-6 py-3 text-sm font-medium transition-all border border-white/10 ${
                activeCategory === category
                  ? "bg-[#252527] text-white"
                  : "bg-transparent text-white/70 hover:bg-white/5"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Agent cards grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {communityAgents.map((agent) => (
            <div
              key={agent.id}
              className="relative overflow-hidden border border-white/10 bg-black/40 transition-all hover:border-white/30 group"
            >
              {/* Agent image */}
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={agent.image}
                  alt={agent.name}
                  className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                />
                {/* Orange filter overlay */}
                <div
                  className="absolute inset-0 transition-opacity duration-300 group-hover:opacity-0"
                  style={{ backgroundColor: "#FF580080" }}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
              </div>

              {/* Agent info */}
              <div className="p-6">
                <div className="mb-3 flex items-start justify-between">
                  <h3 className="text-2xl font-semibold text-white">
                    {agent.name}
                  </h3>
                  <div className="flex items-center gap-3 text-white/60">
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-sm">{agent.comments}</span>
                    </div>
                    <button className="transition-colors hover:text-white">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-white/60">
                  {agent.traits.map((trait, index) => (
                    <span key={trait} className="flex items-center">
                      {trait}
                      {index < agent.traits.length - 1 && (
                        <span className="mx-2">•</span>
                      )}
                    </span>
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-white/60">
                  {agent.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Agents;
