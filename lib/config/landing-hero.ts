import type { LucideIcon } from "lucide-react";
import { Terminal, Rocket, DollarSign, Megaphone } from "lucide-react";

export type TabValue = "agent" | "app" | "image" | "video";

export interface TabConfig {
  prompts: string[];
  placeholder: string;
  destination: string;
}

export interface JourneyStep {
  icon: LucideIcon;
  label: string;
  color: string;
}

export const TAB_CONFIG: Record<TabValue, TabConfig> = {
  agent: {
    prompts: [
      "An agent based on my dead father who gives life advice",
      "A support buddy for people trying to stay sober",
      "A brutally honest fitness coach that roasts my excuses",
    ],
    placeholder: "What kind of agent do you want to build?",
    destination: "/dashboard/build",
  },
  app: {
    prompts: [
      "A landing page for my AI dating app for plants",
      "A dashboard to track my caffeine addiction",
      "An MCP service that connects to my smart fridge",
    ],
    placeholder: "Describe the app or service you want to create...",
    destination: "/dashboard/fragments",
  },
  image: {
    prompts: [
      "My cat as a Renaissance oil painting",
      "A photorealistic founder doing absolutely nothing",
      "Corporate Memphis art but it's honest about capitalism",
    ],
    placeholder: "Describe the image you want to generate...",
    destination: "/dashboard/image",
  },
  video: {
    prompts: [
      "An explainer video for my unnecessarily complex startup",
      "A promo reel that makes my app look funded",
      "A demo video where everything actually works",
    ],
    placeholder: "Describe the video you want to create...",
    destination: "/dashboard/video",
  },
};

export const JOURNEY_STEPS: JourneyStep[] = [
  { icon: Terminal, label: "Create", color: "#FF5800" },
  { icon: Rocket, label: "Deploy", color: "#8B5CF6" },
  { icon: DollarSign, label: "Monetize", color: "#10B981" },
  { icon: Megaphone, label: "Publicize", color: "#F59E0B" },
];

export const ALL_TABS: TabValue[] = ["agent", "app", "image", "video"];
