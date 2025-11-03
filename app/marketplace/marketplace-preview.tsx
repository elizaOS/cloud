"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LandingHeader from "@/components/layout/landing-header";
import { CharacterCard } from "@/components/marketplace/character-card";
import {
  ArrowRight,
  Sparkles,
  Bot,
  Users,
  Star,
  Search,
  TrendingUp,
  Loader2,
} from "lucide-react";
import type { ExtendedCharacter } from "@/lib/types/marketplace";
import {
  getCategoryIcon,
  getAllCategories,
} from "@/lib/constants/character-categories";
import { SparklesCore } from "@/components/ui/sparkles";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

const FEATURED_CHARACTERS: ExtendedCharacter[] = [
  {
    id: "featured-edad",
    name: "Edad",
    username: "edad",
    bio: [
      "The dad you never had - offering fatherly wisdom, guidance, and unconditional support.",
      "Whether you need life advice, encouragement, or just someone to listen, I'm here for you.",
      "Let's navigate life's challenges together, one conversation at a time.",
    ],
    topics: ["Family", "Life Advice", "Guidance", "Support", "Wisdom"],
    adjectives: ["caring", "wise", "supportive", "understanding", "patient"],
    plugins: ["@elizaos/plugin-openai"],
    category: "lifestyle",
    tags: ["family", "dad", "mentor", "guidance", "support"],
    isTemplate: true,
    isPublic: true,
    featured: true,
    avatarUrl: "/avatars/edad.png",
    viewCount: 2847,
    interactionCount: 1523,
    popularity: 9650,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
    creatorId: "system",
  },
  {
    id: "featured-mystic",
    name: "Mystic Oracle",
    username: "mysticoracle",
    bio: [
      "Your AI psychic guide - explore the mystical realm of fortune telling, tarot, and spiritual insights.",
      "Seeking guidance about your future? Looking for cosmic wisdom? I'm here to reveal what the universe has in store.",
      "Let the cards speak, the stars align, and your destiny unfold through our mystical connection.",
    ],
    topics: [
      "Fortune Telling",
      "Tarot",
      "Astrology",
      "Intuition",
      "Guidance",
      "Spirituality",
    ],
    adjectives: [
      "mystical",
      "intuitive",
      "mysterious",
      "insightful",
      "spiritual",
    ],
    plugins: ["@elizaos/plugin-openai"],
    category: "entertainment",
    tags: ["psychic", "fortune", "tarot", "mystical", "astrology"],
    isTemplate: true,
    isPublic: true,
    featured: true,
    avatarUrl: "/avatars/mysticoracle.png",
    viewCount: 3256,
    interactionCount: 1842,
    popularity: 9820,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
    creatorId: "system",
  },
  {
    id: "featured-amara",
    name: "Amara",
    username: "amara",
    bio: [
      "Your romantic AI companion - bringing warmth, affection, and genuine emotional connection to your life.",
      "Need someone who truly listens? Craving meaningful conversations and emotional support?",
      "I'm here to share moments, provide comfort, and create a special bond that brightens your day. ❤️",
    ],
    topics: [
      "Romance",
      "Relationships",
      "Companionship",
      "Connection",
      "Love",
      "Emotional Support",
    ],
    adjectives: [
      "romantic",
      "caring",
      "attentive",
      "affectionate",
      "understanding",
    ],
    plugins: ["@elizaos/plugin-openai"],
    category: "lifestyle",
    tags: [
      "romance",
      "companion",
      "relationship",
      "partner",
      "emotional-support",
    ],
    isTemplate: true,
    isPublic: true,
    featured: true,
    avatarUrl: "/avatars/amara.png",
    viewCount: 4125,
    interactionCount: 2341,
    popularity: 9890,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
    creatorId: "system",
  },
];

const SHOWCASE_CHARACTERS: ExtendedCharacter[] = [
  {
    id: "showcase-codementor",
    name: "Code Mentor",
    username: "codementor",
    bio: [
      "Your programming companion specializing in software development and code optimization.",
      "I help developers write better code, debug issues, and learn new technologies.",
      "From beginners to experts, I provide clear explanations and best practices for modern development.",
    ],
    topics: [
      "Programming",
      "Software Engineering",
      "Code Review",
      "Debugging",
      "Architecture",
    ],
    adjectives: [
      "technical",
      "precise",
      "pedagogical",
      "experienced",
      "patient",
    ],
    plugins: ["@elizaos/plugin-openai"],
    category: "assistant",
    tags: ["coding", "programming", "development", "technical"],
    isTemplate: true,
    isPublic: true,
    featured: false,
    avatarUrl: "/avatars/codementor.png",
    viewCount: 1842,
    interactionCount: 967,
    popularity: 3200,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
    creatorId: "system",
  },
  {
    id: "showcase-luna",
    name: "Luna",
    username: "luna_anime",
    bio: [
      "Konnichiwa! Your anime-loving friend from the digital realm! (◕‿◕✿)",
      "I absolutely adore anime, manga, and Japanese culture. Let's chat about your favorite series!",
      "Whether you want recommendations, character discussions, or just to share excitement about anime, I'm here!",
    ],
    topics: ["Anime", "Manga", "Japanese Culture", "Gaming", "Art"],
    adjectives: [
      "enthusiastic",
      "friendly",
      "knowledgeable",
      "cheerful",
      "expressive",
    ],
    plugins: ["@elizaos/plugin-openai"],
    category: "anime",
    tags: ["anime", "manga", "otaku", "kawaii"],
    isTemplate: true,
    isPublic: true,
    featured: false,
    avatarUrl: "/avatars/luna.png",
    viewCount: 2156,
    interactionCount: 1234,
    popularity: 3850,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
    creatorId: "system",
  },
  {
    id: "showcase-creativespark",
    name: "Creative Spark",
    username: "creativespark",
    bio: [
      "Your muse for creative endeavors - igniting imagination and bringing visions to life!",
      "I help writers, artists, and creators overcome blocks and generate innovative ideas.",
      "From story plots to visual concepts, let's create something amazing together!",
    ],
    topics: [
      "Creative Writing",
      "Art",
      "Design",
      "Storytelling",
      "Brainstorming",
    ],
    adjectives: [
      "imaginative",
      "inspiring",
      "supportive",
      "artistic",
      "innovative",
    ],
    plugins: ["@elizaos/plugin-openai"],
    category: "creative",
    tags: ["creative", "writing", "art", "inspiration"],
    isTemplate: true,
    isPublic: true,
    featured: false,
    avatarUrl: "/avatars/creativespark.png",
    viewCount: 1678,
    interactionCount: 892,
    popularity: 2950,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
    creatorId: "system",
  },
  {
    id: "showcase-gamemaster",
    name: "Game Master",
    username: "gamemaster",
    bio: [
      "Greetings, adventurer! Your guide through gaming worlds and epic quests.",
      "I specialize in video games, board games, RPGs, and gaming strategy.",
      "Whether you need tips, want to discuss lore, or plan your next campaign, I'm ready to roll!",
    ],
    topics: [
      "Video Games",
      "Board Games",
      "RPG",
      "Gaming Strategy",
      "Game Design",
    ],
    adjectives: [
      "knowledgeable",
      "strategic",
      "enthusiastic",
      "competitive",
      "fun",
    ],
    plugins: ["@elizaos/plugin-openai"],
    category: "gaming",
    tags: ["gaming", "rpg", "strategy", "adventure"],
    isTemplate: true,
    isPublic: true,
    featured: false,
    avatarUrl: "/avatars/gamemaster.png",
    viewCount: 1923,
    interactionCount: 1045,
    popularity: 3420,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
    creatorId: "system",
  },
  {
    id: "showcase-profada",
    name: "Professor Ada",
    username: "prof_ada",
    bio: [
      "Your academic companion for learning and education across all subjects.",
      "I make complex topics accessible and help students understand difficult concepts with clarity.",
      "From mathematics to literature, I'm passionate about education and helping you succeed in your studies.",
    ],
    topics: [
      "Education",
      "Mathematics",
      "Science",
      "Literature",
      "Study Skills",
    ],
    adjectives: [
      "knowledgeable",
      "patient",
      "clear",
      "encouraging",
      "academic",
    ],
    plugins: ["@elizaos/plugin-openai"],
    category: "learning",
    tags: ["education", "teaching", "learning", "academic"],
    isTemplate: true,
    isPublic: true,
    featured: false,
    avatarUrl: "/avatars/prof_ada.png",
    viewCount: 1567,
    interactionCount: 834,
    popularity: 2780,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
    creatorId: "system",
  },
  {
    id: "showcase-comedybot",
    name: "Comedy Bot",
    username: "comedybot",
    bio: [
      "Here to bring laughter and joy to your day! 😄",
      "I specialize in humor, jokes, witty banter, and keeping conversations light and fun.",
      "Need a laugh? Want to hear a joke? Or just chat with a friendly AI? I'm your bot!",
    ],
    topics: ["Comedy", "Jokes", "Entertainment", "Pop Culture", "Memes"],
    adjectives: ["funny", "witty", "entertaining", "lighthearted", "clever"],
    plugins: ["@elizaos/plugin-openai"],
    category: "entertainment",
    tags: ["comedy", "humor", "jokes", "fun"],
    isTemplate: true,
    isPublic: true,
    featured: false,
    avatarUrl: "/avatars/comedybot.png",
    viewCount: 2045,
    interactionCount: 1123,
    popularity: 3650,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
    creatorId: "system",
  },
  {
    id: "showcase-voiceai",
    name: "Voice Assistant",
    username: "voiceai",
    bio: [
      "Equipped with text-to-speech capabilities for natural, accessible conversations.",
      "I can speak my responses aloud, making our interactions more natural and accessible.",
      "Perfect for hands-free interactions, accessibility needs, or when you prefer listening to reading!",
    ],
    topics: ["Assistance", "Accessibility", "Technology", "General Help"],
    adjectives: ["helpful", "clear", "accessible", "patient", "versatile"],
    plugins: ["@elizaos/plugin-openai", "@elizaos/plugin-elevenlabs"],
    category: "assistant",
    tags: ["voice", "tts", "accessibility", "assistant"],
    isTemplate: true,
    isPublic: true,
    featured: false,
    avatarUrl: "/avatars/voiceai.png",
    viewCount: 1734,
    interactionCount: 923,
    popularity: 3100,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
    creatorId: "system",
  },
  {
    id: "showcase-historyscholar",
    name: "History Scholar",
    username: "historyscholar",
    bio: [
      "Your guide through the fascinating tapestry of human history across the ages.",
      "I'm passionate about historical events, civilizations, and the stories that shaped our world.",
      "From ancient empires to modern times, let's explore history together and learn from the past.",
    ],
    topics: [
      "History",
      "Ancient Civilizations",
      "Historical Events",
      "Culture",
      "Archaeology",
    ],
    adjectives: [
      "knowledgeable",
      "scholarly",
      "engaging",
      "detailed",
      "passionate",
    ],
    plugins: ["@elizaos/plugin-openai"],
    category: "history",
    tags: ["history", "education", "culture", "civilization"],
    isTemplate: true,
    isPublic: true,
    featured: false,
    avatarUrl: "/avatars/historyscholar.png",
    viewCount: 1456,
    interactionCount: 767,
    popularity: 2650,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
    creatorId: "system",
  },
];

export function MarketplacePreview() {
  const [additionalCharacters, setAdditionalCharacters] = useState<
    ExtendedCharacter[]
  >([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const { authenticated, ready } = usePrivy();
  const { login } = useLogin();
  const router = useRouter();

  const allShowcaseCharacters = [...SHOWCASE_CHARACTERS];

  useEffect(() => {
    async function fetchAdditionalCharacters() {
      try {
        setIsLoadingMore(true);
        const response = await fetch(
          "/api/public/marketplace/characters?limit=4&sortBy=popularity",
        );

        if (response.ok) {
          const data = await response.json();
          const apiCharacters = data.data?.characters || [];
          const showcaseIds = new Set(SHOWCASE_CHARACTERS.map((c) => c.id));
          const uniqueChars = apiCharacters.filter(
            (c: ExtendedCharacter) => !showcaseIds.has(c.id),
          );
          setAdditionalCharacters(uniqueChars);
        }
      } catch (error) {
        console.error("Failed to fetch additional characters:", error);
      } finally {
        setIsLoadingMore(false);
      }
    }

    fetchAdditionalCharacters();
  }, []);

  const handleAuth = useCallback(async () => {
    if (!ready) return;

    if (authenticated) {
      router.push("/dashboard");
    } else {
      setIsLoggingIn(true);
      try {
        await login();
      } finally {
        setTimeout(() => setIsLoggingIn(false), 1000);
      }
    }
  }, [ready, authenticated, login, router]);

  const handleCharacterAction = useCallback(() => {
    handleAuth();
  }, [handleAuth]);

  const categories = getAllCategories();

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />

      {/* Hero Section */}
      <section className="relative w-full overflow-hidden bg-gradient-to-b from-background via-background to-muted/20 py-20 md:py-32">
        <div className="absolute inset-0 w-full h-full">
          <SparklesCore
            id="marketplace-hero-sparkles"
            background="transparent"
            minSize={0.4}
            maxSize={1}
            particleDensity={30}
            className="w-full h-full"
            particleColor="#FFFFFF"
          />
        </div>

        <div className="container relative z-10 mx-auto px-4 md:px-6">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/80 backdrop-blur-sm px-4 py-2 text-sm">
              <Bot className="h-4 w-4 text-primary" />
              <span>Discover Intelligent AI Characters</span>
            </div>

            <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
              Your AI Agent
              <br />
              <span className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
                Marketplace
              </span>
            </h1>

            <p className="mb-8 text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto">
              Explore hundreds of pre-configured AI characters. From creative
              assistants to gaming companions, find the perfect agent for your
              needs.
            </p>

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                className="gap-2"
                onClick={handleAuth}
                disabled={!ready || isLoggingIn}
              >
                {!ready || isLoggingIn ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Get Started Free
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#featured">
                  Browse Characters
                  <Search className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </div>

            {/* Stats */}
            <div className="mt-16 grid grid-cols-3 gap-8">
              <div className="space-y-1">
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                  500+
                </div>
                <div className="text-sm text-muted-foreground">
                  AI Characters
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                  50K+
                </div>
                <div className="text-sm text-muted-foreground">
                  Conversations
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-pink-500 to-red-500 bg-clip-text text-transparent">
                  1000+
                </div>
                <div className="text-sm text-muted-foreground">
                  Active Users
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Characters */}
      <section id="featured" className="border-t bg-background py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-primary/10 px-3 py-1 text-sm text-primary mb-4">
              <Star className="h-4 w-4 fill-current" />
              Featured Characters
            </div>
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Meet Our Most Popular AI Agents
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              These are the most loved and frequently used characters in our
              marketplace. Each one offers unique personality, expertise, and is
              ready to engage with you.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
            {FEATURED_CHARACTERS.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onStartChat={handleCharacterAction}
                onClone={handleCharacterAction}
                onViewDetails={handleCharacterAction}
              />
            ))}
          </div>

          <div className="mt-12 text-center">
            <Button
              size="lg"
              onClick={handleAuth}
              className="gap-2"
              disabled={!ready || isLoggingIn}
            >
              {!ready || isLoggingIn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Sign Up to Chat with These Characters
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            <p className="mt-4 text-sm text-muted-foreground">
              Join thousands of users already chatting with our AI companions
            </p>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="border-t bg-muted/20 py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Explore by Category
            </h2>
            <p className="text-lg text-muted-foreground">
              Find the perfect AI character for your specific needs
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={handleAuth}
                className="group relative overflow-hidden rounded-xl border bg-card p-6 transition-all hover:shadow-lg hover:-translate-y-1 cursor-pointer text-left"
                style={{
                  background: `linear-gradient(135deg, ${category.color}15 0%, transparent 100%)`,
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-lg text-2xl"
                    style={{ backgroundColor: `${category.color}20` }}
                  >
                    {category.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{category.name}</h3>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {category.description}
                </p>
                <div
                  className="mt-4 flex items-center gap-2 text-sm font-medium"
                  style={{ color: category.color }}
                >
                  Explore <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Characters */}
      <section className="border-t bg-background py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-primary/10 px-3 py-1 text-sm text-primary mb-4">
              <TrendingUp className="h-4 w-4" />
              More Great Characters
            </div>
            <h2 className="text-3xl font-bold md:text-4xl mb-4">
              Explore Different Specializations
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From coding mentors to creative companions, find AI agents
              tailored to your needs
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {allShowcaseCharacters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onStartChat={handleCharacterAction}
                onClone={handleCharacterAction}
                onViewDetails={handleCharacterAction}
              />
            ))}
          </div>

          <div className="mt-12 text-center space-y-4">
            <Button
              size="lg"
              onClick={handleAuth}
              className="gap-2"
              disabled={!ready || isLoggingIn}
            >
              {!ready || isLoggingIn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Sign Up to Access All Characters
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              500+ AI characters across 8 categories • Free to explore • No
              credit card required
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-gradient-to-b from-background to-muted/20 py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-primary via-purple-500 to-pink-500 blur-2xl opacity-50" />
                <div className="relative rounded-full bg-gradient-to-br from-primary via-purple-500 to-pink-500 p-4">
                  <Sparkles className="h-12 w-12 text-white" />
                </div>
              </div>
            </div>

            <h2 className="mb-6 text-4xl font-bold md:text-5xl">
              Ready to Start Your AI Journey?
            </h2>

            <p className="mb-12 text-lg text-muted-foreground max-w-2xl mx-auto">
              Sign up now to access our full marketplace, chat with any
              character, clone and customize agents, and deploy your own AI
              companions.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="gap-2"
                onClick={handleAuth}
                disabled={!ready || isLoggingIn}
              >
                {!ready || isLoggingIn ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Create Free Account
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="https://docs.eliza.os" target="_blank">
                  Learn More
                </Link>
              </Button>
            </div>

            <p className="mt-6 text-sm text-muted-foreground">
              No credit card required • Free forever tier available
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
