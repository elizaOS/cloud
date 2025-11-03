export const SEO_CONSTANTS = {
  siteName: "elizaOS Platform",
  twitterHandle: "@elizaos",
  defaultTitle: "elizaOS Platform - AI Agent Development Platform",
  defaultDescription:
    "Complete AI agent development platform with inference, hosting, storage, and rapid deployment. Build, deploy, and scale intelligent agents with ease.",
  defaultKeywords: [
    "AI",
    "agents",
    "elizaOS",
    "platform",
    "development",
    "hosting",
    "machine learning",
    "artificial intelligence",
    "LLM",
    "deployment",
  ],
  ogImageDimensions: {
    width: 1200,
    height: 630,
  },
  twitterCardType: "summary_large_image" as const,
  locale: "en_US",
} as const;

export const ROUTE_METADATA = {
  home: {
    title: "elizaOS Platform - AI Agent Development Platform",
    description:
      "Complete AI agent development platform with inference, hosting, storage, and rapid deployment. Build, deploy, and scale intelligent agents with ease.",
    keywords: [
      "AI platform",
      "agent development",
      "elizaOS",
      "AI hosting",
      "LLM deployment",
    ],
  },
  marketplace: {
    title: "AI Agent Marketplace | Discover Intelligent Characters",
    description:
      "Explore our collection of AI agents including creative assistants, gaming companions, learning tutors, and more. Sign up to interact with intelligent characters powered by elizaOS Cloud.",
    keywords: [
      "AI agents",
      "AI marketplace",
      "AI characters",
      "AI assistants",
      "chatbots",
      "elizaOS",
      "AI companions",
    ],
  },
  dashboard: {
    title: "Dashboard",
    description:
      "Manage your AI agents, containers, credits, and platform resources from your elizaOS dashboard.",
    keywords: ["dashboard", "AI management", "elizaOS dashboard"],
  },
  containers: {
    title: "Containers",
    description:
      "Deploy and manage ElizaOS containers on AWS ECS. Monitor health, view logs, and scale your deployments.",
    keywords: [
      "containers",
      "deployment",
      "AWS ECS",
      "Docker",
      "ElizaOS deploy",
    ],
  },
  eliza: {
    title: "Eliza Agent",
    description:
      "Chat with Eliza using the full ElizaOS runtime with persistent memory and room-based conversations.",
    keywords: ["Eliza", "AI chat", "ElizaOS runtime", "AI agent"],
  },
  characterCreator: {
    title: "Character Creator",
    description:
      "Create custom AI characters with our AI-assisted builder. Define personality, knowledge, and behaviors for your agents.",
    keywords: [
      "character creator",
      "AI characters",
      "agent builder",
      "ElizaOS characters",
    ],
  },
  agentMarketplace: {
    title: "Agent Marketplace",
    description:
      "Discover and explore AI agents from the community. Find templates, clone characters, and start conversations.",
    keywords: [
      "agent marketplace",
      "community agents",
      "AI templates",
      "character library",
    ],
  },
  textGeneration: {
    title: "Text Generation",
    description:
      "Generate text with advanced AI models. Access GPT-4, Claude, Gemini, and more through our unified API.",
    keywords: ["text generation", "GPT-4", "Claude", "AI writing", "LLM API"],
  },
  imageGeneration: {
    title: "Image Generation",
    description:
      "Create stunning images with Google Gemini 2.5 Flash. High-quality 1024x1024 images with automatic storage.",
    keywords: ["image generation", "AI images", "Gemini", "AI art", "image AI"],
  },
  videoGeneration: {
    title: "Video Generation",
    description:
      "Generate videos with Veo3, Kling v2.1, and MiniMax Hailuo. Create up to 5-minute videos with AI.",
    keywords: ["video generation", "AI video", "Veo3", "Kling", "video AI"],
  },
  voiceCloning: {
    title: "Voice Cloning",
    description:
      "Clone voices with ElevenLabs integration. Create custom voices for your AI agents.",
    keywords: [
      "voice cloning",
      "ElevenLabs",
      "voice AI",
      "TTS",
      "voice synthesis",
    ],
  },
  apiExplorer: {
    title: "API Explorer",
    description:
      "Explore and test elizaOS Platform APIs. Interactive documentation and live testing environment.",
    keywords: ["API explorer", "API docs", "REST API", "elizaOS API"],
  },
  mcpPlayground: {
    title: "MCP Playground",
    description:
      "Interactive Model Context Protocol (MCP) explorer. Test and experiment with MCP servers and tools.",
    keywords: ["MCP", "Model Context Protocol", "MCP playground", "AI tools"],
  },
  billing: {
    title: "Billing & Credits",
    description:
      "Manage your credits, view usage, and purchase credit packs. Transparent pricing for all AI operations.",
    keywords: ["billing", "credits", "pricing", "payment", "Stripe"],
  },
  apiKeys: {
    title: "API Keys",
    description:
      "Generate and manage API keys for programmatic access to elizaOS Platform.",
    keywords: ["API keys", "authentication", "API access", "tokens"],
  },
  analytics: {
    title: "Analytics",
    description:
      "View usage analytics, track costs, and monitor performance across all your AI operations.",
    keywords: ["analytics", "usage tracking", "metrics", "monitoring"],
  },
  storage: {
    title: "Storage",
    description:
      "Manage your files and generated content. View images, videos, and documents in Vercel Blob storage.",
    keywords: ["storage", "files", "Vercel Blob", "cloud storage"],
  },
  gallery: {
    title: "Gallery",
    description:
      "Browse your generated images and videos. View, download, and share your AI-created content.",
    keywords: ["gallery", "generated images", "AI art", "content library"],
  },
  account: {
    title: "Account Settings",
    description:
      "Manage your account settings, profile, and preferences on elizaOS Platform.",
    keywords: ["account", "settings", "profile", "preferences"],
  },
} as const;
