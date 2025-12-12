"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/use-auth";
import { Sparkles, Target, Zap, Trophy, MessageSquare, Calendar, ChevronRight, Flame, Star, Check } from "lucide-react";

const features = [
  { icon: Target, title: "Daily Habits", description: "Build lasting habits with streak tracking and bonus points." },
  { icon: Zap, title: "Priority Tasks", description: "Manage tasks with smart prioritization. Higher priority = more points." },
  { icon: Star, title: "Goals", description: "Set big goals and track progress towards milestones." },
  { icon: Trophy, title: "Gamification", description: "Level up, earn points, and track your progress." },
  { icon: MessageSquare, title: "AI Assistant", description: "Chat naturally to create and manage tasks." },
  { icon: Calendar, title: "Smart Reminders", description: "Get reminders based on priority and deadlines." },
];

const levels = [
  { level: 1, name: "Beginner", color: "from-gray-500 to-gray-600" },
  { level: 2, name: "Apprentice", color: "from-green-500 to-green-600" },
  { level: 3, name: "Journeyman", color: "from-blue-500 to-blue-600" },
  { level: 4, name: "Expert", color: "from-purple-500 to-purple-600" },
  { level: 5, name: "Master", color: "from-yellow-500 to-yellow-600" },
];

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, login } = useAuth();

  const handleGetStarted = async () => {
    if (isAuthenticated) {
      router.push("/dashboard");
    } else {
      await login();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center">
              <Check className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-xl">Eliza Todo</span>
          </div>
          <nav>
            {isLoading ? (
              <div className="h-10 w-24 bg-muted animate-pulse rounded-lg" />
            ) : isAuthenticated ? (
              <button onClick={() => router.push("/dashboard")} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
                Dashboard
              </button>
            ) : (
              <button onClick={handleGetStarted} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
                Sign In
              </button>
            )}
          </nav>
        </div>
      </header>

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-8">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">AI-Powered Productivity</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Eliza Todo
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            The intelligent task manager that helps you build habits, crush goals, and level up your productivity.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={handleGetStarted} className="px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold text-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center gap-2">
              Get Started Free <ChevronRight className="h-5 w-5" />
            </button>
            <div className="text-muted-foreground text-sm">No credit card required</div>
          </div>
        </div>
      </section>

      <section className="py-12 px-4 border-y border-border/50 bg-card/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <span className="text-muted-foreground mr-4">Level up:</span>
            {levels.map((level) => (
              <div key={level.level} className={`px-4 py-2 rounded-lg bg-gradient-to-r ${level.color} text-white text-sm font-medium`}>
                Lv.{level.level} {level.name}
              </div>
            ))}
            <span className="text-muted-foreground">... and beyond</span>
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Features</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Smart task management with gamification and AI.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="p-6 rounded-2xl bg-card border border-border hover:border-primary/50 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-card/30 border-y border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <Trophy className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
              <div className="text-3xl font-bold mb-1">10 Levels</div>
              <div className="text-muted-foreground">From Beginner to Transcendent</div>
            </div>
            <div>
              <Flame className="h-8 w-8 text-orange-500 mx-auto mb-2 streak-flame" />
              <div className="text-3xl font-bold mb-1">Streak Bonuses</div>
              <div className="text-muted-foreground">Up to 5x points for daily habits</div>
            </div>
            <div>
              <Zap className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <div className="text-3xl font-bold mb-1">Priority Points</div>
              <div className="text-muted-foreground">More rewards for urgent tasks</div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to level up?</h2>
          <p className="text-muted-foreground mb-8">Start free, no credit card required.</p>
          <button onClick={handleGetStarted} className="px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold text-lg hover:bg-primary/90 transition-all hover:scale-105">
            Start Free Today
          </button>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center">
              <Check className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold">Eliza Todo</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Powered by{" "}
            <a href="https://elizacloud.ai" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              Eliza Cloud
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
