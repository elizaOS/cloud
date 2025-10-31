"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import LandingHeader from "@/components/layout/landing-header";
import TopHero from "@/components/landing/TopHero";
import RouterSection from "@/components/landing/RouterSection";
import Agents from "@/components/landing/Agents";
import {
  Cloud,
  Code,
  Rocket,
  Shield,
  Database,
  Globe,
  ArrowRight,
  Brain,
  Server,
  GitBranch,
  Settings,
  MessageSquare,
  TrendingUp,
  Bot,
  Users,
  Copy,
} from "lucide-react";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { InfiniteMovingCards } from "@/components/ui/infinite-moving-cards";
import { Timeline } from "@/components/ui/timeline";
import { Button as MovingBorderButton } from "@/components/ui/moving-border";
import { ShootingStars } from "@/components/ui/shooting-stars";
import { StarsBackground } from "@/components/ui/stars-background";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LandingPage() {
  const { authenticated, ready } = usePrivy();
  const { login } = useLogin();
  const router = useRouter();

  // Auto-redirect to dashboard when authenticated
  useEffect(() => {
    if (ready && authenticated) {
      console.log("User authenticated, redirecting to dashboard...");
      router.push("/dashboard");
    }
  }, [ready, authenticated, router]);

  const handleAuth = () => {
    console.log("Auth button clicked:", { authenticated, ready });

    if (!ready) {
      console.log("Privy not ready yet");
      return;
    }

    if (authenticated) {
      router.push("/dashboard");
    } else {
      console.log("Calling Privy login...");
      login();
    }
  };
  // Tech stack logos/icons data for infinite marquee
  const techStack = [
    {
      quote: "GPT-4 & Claude 3",
      name: "OpenAI & Anthropic",
      title: "AI Models",
    },
    {
      quote: "Discord & Telegram",
      name: "Social Platforms",
      title: "Integrations",
    },
    {
      quote: "Twitter/X API",
      name: "Social Media",
      title: "Integration",
    },
    {
      quote: "Solana & Ethereum",
      name: "Web3 Blockchains",
      title: "On-Chain",
    },
    {
      quote: "PostgreSQL & Vector DB",
      name: "Data Storage",
      title: "Databases",
    },
    {
      quote: "TypeScript & Node.js",
      name: "Runtime",
      title: "Framework",
    },
    {
      quote: "Docker & Kubernetes",
      name: "Cloud Native",
      title: "Infrastructure",
    },
    {
      quote: "Real-time APIs",
      name: "WebSocket & REST",
      title: "Communication",
    },
  ];

  // Timeline data for "How It Works"
  const timelineData = [
    {
      title: "Step 1",
      content: (
        <div>
          <p className="text-neutral-900 dark:text-neutral-100 text-xs md:text-sm font-normal mb-8">
            <strong className="text-lg block mb-2">
              Sign Up & Configure Your Agent
            </strong>
            Create your elizaOS Cloud account and configure your AI agent with
            our intuitive CLI or web interface. Set your preferred LLM provider
            (GPT-4, Claude, or open-source), choose plugins for blockchain,
            social media, or custom integrations, and define your agent&apos;s
            personality and capabilities.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-4 rounded-lg">
              <Code className="h-6 w-6 mb-2 text-primary" />
              <p className="text-xs font-medium">elizaOS CLI</p>
            </div>
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-4 rounded-lg">
              <Settings className="h-6 w-6 mb-2 text-primary" />
              <p className="text-xs font-medium">Character Files</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Step 2",
      content: (
        <div>
          <p className="text-neutral-900 dark:text-neutral-100 text-xs md:text-sm font-normal mb-8">
            <strong className="text-lg block mb-2">Build & Test Locally</strong>
            Develop your agent locally with hot-reload capabilities using our
            powerful runtime. Test your actions, providers, and services in a
            safe sandbox environment. Connect to Discord, Telegram, Twitter, or
            any platform to validate your agent&apos;s behavior before going
            live.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-4 rounded-lg">
              <GitBranch className="h-6 w-6 mb-2 text-blue-500" />
              <p className="text-xs font-medium">Local Runtime</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-4 rounded-lg">
              <MessageSquare className="h-6 w-6 mb-2 text-blue-500" />
              <p className="text-xs font-medium">Test Conversations</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Step 3",
      content: (
        <div>
          <p className="text-neutral-900 dark:text-neutral-100 text-xs md:text-sm font-normal mb-8">
            <strong className="text-lg block mb-2">
              Deploy to elizaOS Cloud
            </strong>
            Push your agent to production with a single command:{" "}
            <code className="bg-muted px-2 py-1 rounded">elizaos deploy</code>.
            Our cloud platform handles automatic scaling, load balancing, 99.9%
            uptime, monitoring, and maintenance. Your agent runs 24/7 with
            managed infrastructure, vector databases, and persistent memory—no
            DevOps required.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 p-4 rounded-lg">
              <Rocket className="h-6 w-6 mb-2 text-green-500" />
              <p className="text-xs font-medium">One-Command Deploy</p>
            </div>
            <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 p-4 rounded-lg">
              <TrendingUp className="h-6 w-6 mb-2 text-green-500" />
              <p className="text-xs font-medium">Auto Scaling</p>
            </div>
          </div>
        </div>
      ),
    },
  ];

  // Bento grid items for features
  const bentoItems = [
    {
      title: "Advanced AI Models",
      description:
        "Access cutting-edge LLMs including GPT-4, Claude 3, and open-source models with built-in inference.",
      header: (
        <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 dark:from-violet-500/20 dark:to-purple-500/20 items-center justify-center">
          <Brain className="h-12 w-12 text-violet-500" />
        </div>
      ),
      icon: <Brain className="h-4 w-4 text-violet-500" />,
      className: "md:col-span-2",
    },
    {
      title: "Rapid Deployment",
      description:
        "From development to production in seconds. Zero DevOps required.",
      header: (
        <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-orange-500/10 to-red-500/10 dark:from-orange-500/20 dark:to-red-500/20 items-center justify-center">
          <Rocket className="h-12 w-12 text-orange-500" />
        </div>
      ),
      icon: <Rocket className="h-4 w-4 text-orange-500" />,
      className: "md:col-span-1",
    },
    {
      title: "Cloud-Native Hosting",
      description:
        "Fully managed infrastructure with automatic scaling and 99.9% uptime SLA.",
      header: (
        <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 dark:from-cyan-500/20 dark:to-blue-500/20 items-center justify-center">
          <Cloud className="h-12 w-12 text-cyan-500" />
        </div>
      ),
      icon: <Cloud className="h-4 w-4 text-cyan-500" />,
      className: "md:col-span-1",
    },
    {
      title: "Persistent Storage & Memory",
      description:
        "Built-in vector databases and memory management. Your agents learn and remember.",
      header: (
        <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20 items-center justify-center">
          <Database className="h-12 w-12 text-green-500" />
        </div>
      ),
      icon: <Database className="h-4 w-4 text-green-500" />,
      className: "md:col-span-2",
    },
    {
      title: "Enterprise Security",
      description:
        "End-to-end encryption, SOC 2 compliance, and granular access controls.",
      header: (
        <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-yellow-500/10 to-amber-500/10 dark:from-yellow-500/20 dark:to-amber-500/20 items-center justify-center">
          <Shield className="h-12 w-12 text-yellow-600" />
        </div>
      ),
      icon: <Shield className="h-4 w-4 text-yellow-600" />,
      className: "md:col-span-1",
    },
    {
      title: "Multi-Platform Support",
      description:
        "Deploy to Discord, Telegram, Twitter, and more. One codebase, everywhere.",
      header: (
        <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-pink-500/10 to-rose-500/10 dark:from-pink-500/20 dark:to-rose-500/20 items-center justify-center">
          <Globe className="h-12 w-12 text-pink-500" />
        </div>
      ),
      icon: <Globe className="h-4 w-4 text-pink-500" />,
      className: "md:col-span-2",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <LandingHeader />

      {/* Hero Section */}
      <TopHero />

      {/* Agents Section */}
      <Agents />

      {/* Router Section */}
      <RouterSection />

      {/* Tech Stack Marquee */}
      <section className="py-20 bg-gradient-to-b from-background via-muted/20 to-background border-y">
        <div className="container mx-auto px-4 md:px-6 mb-12">
          <h3 className="text-center text-2xl md:text-3xl font-bold mb-3 bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">
            Built on Industry-Leading Technology
          </h3>
          <p className="text-center text-muted-foreground max-w-2xl mx-auto">
            elizaOS Cloud integrates seamlessly with the tools and platforms you
            already use
          </p>
        </div>

        {/* Custom styled infinite cards */}
        <div className="relative">
          <InfiniteMovingCards
            items={techStack}
            direction="right"
            speed="slow"
            className="py-4"
          />
        </div>
      </section>

      {/* Features Bento Grid */}
      <section className="border-t bg-background py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Everything You Need to Build AI Agents
            </h2>
            <p className="text-lg text-muted-foreground">
              A complete platform for developing, deploying, and managing AI
              agents at scale
            </p>
          </div>

          <BentoGrid className="mx-auto">
            {bentoItems.map((item, i) => (
              <BentoGridItem
                key={i}
                title={item.title}
                description={item.description}
                header={item.header}
                icon={item.icon}
                className={item.className}
              />
            ))}
          </BentoGrid>
        </div>
      </section>

      {/* How It Works Timeline with Shooting Stars */}
      <section className="relative border-t overflow-hidden bg-gradient-to-b from-black via-neutral-950 to-black">
        {/* Stars Background */}
        <StarsBackground
          starDensity={0.0003}
          allStarsTwinkle={true}
          twinkleProbability={0.9}
          minTwinkleSpeed={0.5}
          maxTwinkleSpeed={1.5}
          className="absolute inset-0 z-0"
        />

        {/* Shooting Stars */}
        <ShootingStars
          minSpeed={10}
          maxSpeed={25}
          minDelay={1200}
          maxDelay={3500}
          starColor="#A78BFA"
          trailColor="#7C3AED"
          starWidth={20}
          starHeight={2}
          className="absolute inset-0 z-0"
        />

        {/* Timeline Content */}
        <div className="relative z-10">
          <Timeline
            data={timelineData}
            title="How elizaOS Cloud Works"
            description="Deploy your AI agents to production in three simple steps. From local development to global scale in minutes."
          />
        </div>
      </section>

      {/* AI Marketplace Section */}
      <section className="relative border-t bg-background py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mx-auto max-w-6xl">
            {/* Section Header */}
            <div className="mb-12 text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/80 backdrop-blur-sm px-4 py-2 text-sm">
                <Bot className="h-4 w-4 text-primary" />
                <span>AI Agent Marketplace</span>
              </div>
              <h2 className="mb-4 text-3xl font-bold md:text-4xl lg:text-5xl">
                Discover Pre-Built AI Characters
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Explore hundreds of ready-to-use AI agents. From creative
                assistants to gaming companions, find the perfect character for
                your needs—or clone and customize one to make it your own.
              </p>
            </div>

            {/* Feature Grid */}
            <div className="grid gap-6 md:grid-cols-3 mb-12">
              <div className="relative overflow-hidden rounded-xl border bg-card p-6 transition-all hover:shadow-lg">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/10 to-purple-500/10">
                  <Users className="h-6 w-6 text-violet-500" />
                </div>
                <h3 className="mb-2 font-semibold text-lg">500+ Characters</h3>
                <p className="text-sm text-muted-foreground">
                  Access a vast library of pre-configured AI agents across
                  multiple categories
                </p>
              </div>

              <div className="relative overflow-hidden rounded-xl border bg-card p-6 transition-all hover:shadow-lg">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
                  <MessageSquare className="h-6 w-6 text-blue-500" />
                </div>
                <h3 className="mb-2 font-semibold text-lg">Instant Chat</h3>
                <p className="text-sm text-muted-foreground">
                  Start conversations immediately with any character—no
                  configuration required
                </p>
              </div>

              <div className="relative overflow-hidden rounded-xl border bg-card p-6 transition-all hover:shadow-lg">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500/10 to-rose-500/10">
                  <Copy className="h-6 w-6 text-pink-500" />
                </div>
                <h3 className="mb-2 font-semibold text-lg">
                  Clone & Customize
                </h3>
                <p className="text-sm text-muted-foreground">
                  Make any character your own by cloning and modifying it to fit
                  your needs
                </p>
              </div>
            </div>

            {/* CTA Button */}
            <div className="text-center">
              <Button
                size="lg"
                asChild
                className="gap-2 bg-gradient-to-r from-primary via-purple-600 to-pink-600 hover:opacity-90 transition-opacity"
              >
                <Link href="/marketplace">
                  <Bot className="h-5 w-5" />
                  Explore Marketplace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <p className="mt-4 text-sm text-muted-foreground">
                Browse our collection of AI characters • No account required to
                explore
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section with Grid Background */}
      <section className="relative border-t bg-black py-32 text-white overflow-hidden">
        {/* Animated Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

        {/* Gradient Orbs */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-violet-600/20 via-purple-600/20 to-pink-600/20 rounded-full blur-3xl" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />

        {/* Content */}
        <div className="container relative z-10 mx-auto px-4 text-center md:px-6">
          <div className="mx-auto max-w-3xl">
            {/* Icon with glow */}
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 blur-2xl opacity-50" />
                <div className="relative rounded-full bg-gradient-to-br from-violet-600 via-purple-600 to-pink-600 p-4">
                  <Server className="h-12 w-12 text-white" />
                </div>
              </div>
            </div>

            <h2 className="mb-6 text-4xl font-bold md:text-6xl bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent">
              Ready to Build Your AI Agent?
            </h2>

            <p className="mb-12 text-lg md:text-xl text-gray-300 max-w-2xl mx-auto">
              Join thousands of developers building the future of autonomous AI.
              Deploy production-ready agents in minutes with our cloud platform.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <MovingBorderButton
                borderRadius="1.75rem"
                className="bg-white text-black hover:bg-gray-100 font-semibold"
                containerClassName="h-14 w-56"
                borderClassName="bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600"
                onClick={handleAuth}
              >
                <span className="flex items-center gap-2">
                  Get Started for Free
                  <ArrowRight className="h-4 w-4" />
                </span>
              </MovingBorderButton>

              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-14 w-56 border-gray-600 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link
                  href="https://docs.eliza.os"
                  target="_blank"
                  className="flex items-center gap-2"
                >
                  View Documentation
                  <Code className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="mt-16 grid grid-cols-3 gap-8 border-t border-white/10 pt-12">
              <div>
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  10K+
                </div>
                <div className="text-sm text-gray-400 mt-1">Active Agents</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  99.9%
                </div>
                <div className="text-sm text-gray-400 mt-1">Uptime SLA</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-pink-400 to-red-400 bg-clip-text text-transparent">
                  24/7
                </div>
                <div className="text-sm text-gray-400 mt-1">Support</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black">
        <div className="container mx-auto px-4 md:px-6 py-16">
          {/* Main Footer Content */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-12">
            {/* Brand Section */}
            <div className="md:col-span-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-600 via-purple-600 to-pink-600 flex items-center justify-center">
                  <Server className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-white font-bold text-xl">elizaOS Cloud</h3>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed mb-6">
                The complete platform for building, deploying, and scaling
                autonomous AI agents. From local development to global
                production.
              </p>
              {/* Social Links */}
              <div className="flex gap-3">
                <Link
                  href="https://github.com/elizaos"
                  target="_blank"
                  className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
                >
                  <svg
                    className="h-4 w-4 text-gray-300"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Link>
                <Link
                  href="https://twitter.com/elizaos"
                  target="_blank"
                  className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
                >
                  <svg
                    className="h-4 w-4 text-gray-300"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </Link>
                <Link
                  href="https://discord.gg/elizaos"
                  target="_blank"
                  className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
                >
                  <svg
                    className="h-4 w-4 text-gray-300"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Links Sections */}
            <div className="md:col-span-2">
              <h4 className="text-white font-semibold text-sm mb-4">Product</h4>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/features"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="/pricing"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    href="/changelog"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Changelog
                  </Link>
                </li>
                <li>
                  <Link
                    href="https://docs.eliza.os"
                    target="_blank"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Documentation
                  </Link>
                </li>
              </ul>
            </div>

            <div className="md:col-span-2">
              <h4 className="text-white font-semibold text-sm mb-4">
                Resources
              </h4>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/guides"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Guides
                  </Link>
                </li>
                <li>
                  <Link
                    href="/examples"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Examples
                  </Link>
                </li>
                <li>
                  <Link
                    href="/api"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    API Reference
                  </Link>
                </li>
                <li>
                  <Link
                    href="/community"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Community
                  </Link>
                </li>
              </ul>
            </div>

            <div className="md:col-span-2">
              <h4 className="text-white font-semibold text-sm mb-4">Company</h4>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/about"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Blog
                  </Link>
                </li>
                <li>
                  <Link
                    href="/careers"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Careers
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Contact
                  </Link>
                </li>
              </ul>
            </div>

            <div className="md:col-span-2">
              <h4 className="text-white font-semibold text-sm mb-4">Legal</h4>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Terms
                  </Link>
                </li>
                <li>
                  <Link
                    href="/security"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Security
                  </Link>
                </li>
                <li>
                  <Link
                    href="/status"
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Status
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-300">
              &copy; 2025 elizaOS Cloud. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-300">
              <span className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                All Systems Operational
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
