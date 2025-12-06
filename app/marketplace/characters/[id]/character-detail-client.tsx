"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Users, Eye, TrendingUp, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { UserCharacter } from "@/db/schemas/user-characters";

interface CharacterDetailClientProps {
  character: UserCharacter;
}

/**
 * Client component for displaying detailed information about a marketplace character.
 * Shows character avatar, bio, personality traits, topics, and statistics.
 *
 * @param character - The character data to display.
 * @returns The rendered character detail page with character information and action buttons.
 */
export function CharacterDetailClient({
  character,
}: CharacterDetailClientProps) {
  const bio = Array.isArray(character.bio)
    ? character.bio.join(" ")
    : character.bio;
  const topics = character.topics || [];
  const adjectives = character.adjectives || [];
  const tags = character.tags || [];

  return (
    <div className="container max-w-5xl mx-auto py-12 px-4">
      {/* Back Navigation */}
      <div className="mb-8 border-b border-white/10 pb-4">
        <Link
          href="/marketplace/gallery"
          className="group flex items-center gap-2 text-sm text-white/70 hover:text-white transition-all duration-200 w-fit"
          style={{ fontFamily: "var(--font-roboto-mono)" }}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-none border border-white/10 bg-black/40 group-hover:bg-white/5 group-hover:border-[#FF5800]/50 transition-all duration-200">
            <ArrowLeft className="h-4 w-4" />
          </div>
          <span className="font-medium">Back to Gallery</span>
        </Link>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-1">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <Avatar className="h-32 w-32">
                  <AvatarImage
                    src={character.avatar_url || undefined}
                    alt={character.name}
                  />
                  <AvatarFallback className="text-3xl">
                    {character.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <CardTitle className="text-2xl">{character.name}</CardTitle>
              {character.username && (
                <CardDescription className="text-base">
                  @{character.username}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-around text-center pt-4 border-t">
                <div>
                  <div className="flex items-center justify-center text-2xl font-bold text-primary">
                    <Eye className="h-5 w-5 mr-1" />
                    {character.view_count}
                  </div>
                  <div className="text-xs text-muted-foreground">Views</div>
                </div>
                <div>
                  <div className="flex items-center justify-center text-2xl font-bold text-primary">
                    <MessageSquare className="h-5 w-5 mr-1" />
                    {character.interaction_count}
                  </div>
                  <div className="text-xs text-muted-foreground">Chats</div>
                </div>
              </div>

              <div className="pt-4">
                <Button asChild className="w-full" size="lg">
                  <Link href={`/dashboard/chat?characterId=${character.id}`}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Start Chatting
                  </Link>
                </Button>
              </div>

              {tags.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag, i) => (
                      <Badge key={i} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">{bio}</p>
            </CardContent>
          </Card>

          {adjectives.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Personality</CardTitle>
                <CardDescription>
                  Key traits that define this character
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {adjectives.map((adj, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="text-base px-3 py-1"
                    >
                      {adj}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {topics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Topics of Interest</CardTitle>
                <CardDescription>
                  Areas this character is knowledgeable about
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-base px-3 py-1"
                    >
                      {topic}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Get Started</CardTitle>
              <CardDescription>
                Sign in to start chatting with {character.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Start a Conversation</h4>
                    <p className="text-sm text-muted-foreground">
                      Chat with {character.name} using the full ElizaOS runtime
                      with persistent memory
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Clone & Customize</h4>
                    <p className="text-sm text-muted-foreground">
                      Create your own version and customize the personality
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Deploy Your Own</h4>
                    <p className="text-sm text-muted-foreground">
                      Deploy containers and scale your AI agents
                    </p>
                  </div>
                </div>
                <Button asChild className="w-full mt-4" size="lg">
                  <Link href="/dashboard">Get Started</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
