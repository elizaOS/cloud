"use client";

import React, { useState } from "react";
import Image from "next/image";
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
import {
  SectionHeader,
  SectionLabel,
  AgentCard,
  SimpleBrandTabs,
  CornerBrackets,
  BrandCard,
} from "@/components/brand";

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
        <SectionHeader
          label="PRE-BUILT AGENTS"
          title="Start with Expert Templates"
          description="Launch faster with our curated collection of production-ready AI agents"
          align="center"
          className="mb-16"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {agents.map((agent, index) => (
            <AgentCard
              key={index}
              title={agent.title}
              description={agent.description}
              icon={agent.icon}
              color={agent.color}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-white/70 hover:text-white hover:bg-white/5 group-hover:bg-white/10"
                >
                  <span>Use Template</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              }
            />
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
      <CornerBrackets size="xl" variant="full-border" />

      <div className="mx-auto max-w-7xl px-8 py-12">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <SectionLabel>From the Community</SectionLabel>
          <button className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
            Explore All
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Category tabs */}
        <SimpleBrandTabs
          tabs={categories}
          activeTab={activeCategory}
          onTabChange={setActiveCategory}
          className="mb-12"
        />

        {/* Agent cards grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {communityAgents.map((agent) => (
            <BrandCard
              key={agent.id}
              corners={false}
              hover
              className="overflow-hidden p-0"
            >
              {/* Agent image */}
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={agent.image}
                  alt={agent.name}
                  fill
                  className="object-cover object-top transition-transform duration-300 group-hover:scale-105"
                />
                {/* Orange filter overlay */}
                <div
                  className="absolute inset-0 transition-opacity duration-300 group-hover:opacity-0 z-10"
                  style={{ backgroundColor: "#FF580080" }}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent z-10" />
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
            </BrandCard>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Agents;
