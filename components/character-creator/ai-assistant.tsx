"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Bot, User, Send, Sparkles } from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

interface AiAssistantProps {
  character: ElizaCharacter;
  onCharacterUpdate: (updates: Partial<ElizaCharacter>) => void;
}

export function AiAssistant({ character, onCharacterUpdate }: AiAssistantProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [quickPrompts, setQuickPrompts] = useState<string[]>([
    "Customer support specialist with empathy",
    "Technical documentation writer",
    "Social media content strategist",
    "Personal productivity coach",
  ]);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(true);
  
  // Track the character ID to detect when we switch characters
  const characterIdRef = useRef(character.id);

  // Determine if this is an existing character
  const isEditMode = !!(character.name && character.bio);

  const { messages, sendMessage, status, setMessages } = useChat({
    id: "character-assistant",
    transport: new DefaultChatTransport({
      api: "/api/v1/character-assistant",
      body: {
        character: isEditMode ? character : undefined,
        isEditMode,
      },
    }),
  });

  // Generate prompts on mount using a simple fetch
  useEffect(() => {
    const generatePrompts = async () => {
      try {
        const response = await fetch("/api/v1/generate-prompts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            seed: `${Date.now()}-${Math.random()}`,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate prompts");
        }

        // Read the streamed response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
          }
        }

        console.log("Prompts generation complete:", fullText);

        // Extract JSON array from the response
        const jsonMatch = fullText.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          try {
            const prompts = JSON.parse(jsonMatch[0]);
            if (Array.isArray(prompts) && prompts.length > 0) {
              console.log("Setting new prompts:", prompts);
              setQuickPrompts(prompts);
            }
          } catch (error) {
            console.error("Failed to parse prompts:", error);
          }
        }
      } catch (error) {
        console.error("Failed to generate prompts:", error);
      } finally {
        setIsLoadingPrompts(false);
      }
    };

    generatePrompts();
  }, []);

  // Set initial welcome message (only reset when switching characters, not when editing)
  useEffect(() => {
    // Check if we've switched to a different character
    const characterChanged = characterIdRef.current !== character.id;
    
    if (characterChanged || messages.length === 0) {
      characterIdRef.current = character.id;
      
      const welcomeText = isEditMode 
        ? `Hi! I'm here to help you edit **${character.name}**.

**Current Character Summary:**
- **Name:** ${character.name}
- **Bio:** ${character.bio}
${character.adjectives && character.adjectives.length > 0 ? `- **Traits:** ${character.adjectives.join(', ')}\n` : ''}${character.topics && character.topics.length > 0 ? `- **Topics:** ${character.topics.join(', ')}\n` : ''}
What would you like to change or improve about this character? I can help you refine the personality, add more details, adjust the style, or anything else!`
        : `Hi! I'm here to help you create an amazing character for your ElizaOS agent. Let's start with the basics:

1. What should we name your character?
2. What's their personality like?
3. What will they be used for?

Tell me about your vision, and I'll help you craft a detailed character definition!`;

      setMessages([
        {
          id: "welcome",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: welcomeText,
            },
          ],
        },
      ]);
    }
  }, [character.id, character.name, character.bio, character.adjectives, character.topics, isEditMode, setMessages, messages.length]);

  // Auto-scroll to bottom on new messages and during streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Extract and apply character updates in real-time as the AI streams
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    
    // Process assistant messages (including while streaming)
    if (lastMessage && lastMessage.role === "assistant" && lastMessage.id !== "welcome") {
      const content = lastMessage.parts
        .filter((part) => part.type === "text")
        .map((part) => (part as { text: string }).text)
        .join("");

      // Try to extract JSON from code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)(\n```|$)/);
      if (jsonMatch) {
        const jsonText = jsonMatch[1].trim();
        
        // Try to parse even partial JSON
        try {
          // First, try parsing as complete JSON
          const updates = JSON.parse(jsonText);
          onCharacterUpdate(updates);
        } catch {
          // If that fails, try to extract individual fields that are complete
          try {
            // Look for complete field definitions (strings, numbers, booleans, complete arrays)
            const fieldMatches = jsonText.matchAll(/"(\w+)":\s*("(?:[^"\\]|\\.)*"|true|false|null|\d+(?:\.\d+)?|\[[^\]]*\])/g);
            const partialUpdates: Record<string, unknown> = {};
            
            for (const match of fieldMatches) {
              const [, key, value] = match;
              try {
                // Parse the value
                const parsedValue = JSON.parse(value);
                
                // Only add if it's a meaningful value
                if (parsedValue !== null && parsedValue !== undefined) {
                  partialUpdates[key] = parsedValue;
                }
              } catch {
                // Skip invalid values
              }
            }
            
            // Apply partial updates if we got any valid fields
            if (Object.keys(partialUpdates).length > 0) {
              onCharacterUpdate(partialUpdates);
            }
          } catch {
            // Silently ignore parsing errors during streaming
          }
        }
      }
    }
  }, [messages, onCharacterUpdate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === "streaming") return;

    const userMessage = input;
    setInput("");

    sendMessage({ text: userMessage });
  };

  const isLoading = status === "streaming";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-shrink-0 border-b">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          AI Character Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
        {/* Messages */}
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                    <Bot className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === "user"
                      ? "bg-blue-600 text-white dark:bg-blue-700"
                      : "bg-muted"
                  }`}
                >
                  <div className={`prose prose-sm max-w-none [&_pre]:bg-transparent [&_pre]:p-0 ${
                    message.role === "user" 
                      ? "prose-invert [&_p]:text-white [&_code]:text-white" 
                      : "dark:prose-invert"
                  }`}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                    >
                      {message.parts
                        .filter((part) => part.type === "text")
                        .map((part) => (part as { text: string }).text)
                        .join("")
                        .trim()}
                    </ReactMarkdown>
                  </div>
                </div>
                {message.role === "user" && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                    <User className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                  <Bot className="h-4 w-4 animate-pulse text-purple-600 dark:text-purple-300" />
                </div>
                <div className="rounded-lg bg-muted px-4 py-2">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400"></div>
                  </div>
                </div>
              </div>
            )}
            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Quick Prompts */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2">
            {isLoadingPrompts && !isEditMode ? (
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-8 w-32 animate-pulse rounded-md bg-muted"
                  />
                ))}
              </div>
            ) : isEditMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInput("Add more personality traits")}
                  className="text-xs"
                >
                  Add personality traits
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInput("Improve the bio description")}
                  className="text-xs"
                >
                  Improve bio
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInput("Add conversation examples")}
                  className="text-xs"
                >
                  Add examples
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInput("Refine the writing style")}
                  className="text-xs"
                >
                  Refine style
                </Button>
              </>
            ) : (
              quickPrompts.map((prompt, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInput(prompt);
                  }}
                  className="text-xs"
                >
                  {prompt}
                </Button>
              ))
            )}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your character or ask for help..."
            className="min-h-[60px] max-h-[120px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="h-[60px] w-[60px]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

