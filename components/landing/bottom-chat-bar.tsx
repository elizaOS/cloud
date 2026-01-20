/**
 * Floating bottom chat bar component for the landing page.
 * Appears when the hero input scrolls out of view.
 * Includes chat message display and AI response simulation.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";
import { ChatMessage, ChatMessageData } from "./chat-message";
import { useTypingPlaceholder } from "@/lib/hooks/use-typing-placeholder";

/** AI placeholder responses */
const aiResponses = [
  "Honestly? Most people spend weeks figuring this out. You're already asking the right questions. That's rare.",
  "Oh, you want the real answer or the marketing one? The real one: agents are just loops with attitude. But good ones feel like magic.",
  "I could explain it... but wouldn't it be more fun if I just showed you? Build one with me. Takes 30 seconds.",
  "You're overthinking it. Best agents start stupid simple. One job. One trigger. Ship it. Iterate later.",
  "That's actually what I'm built on. So yeah, I have opinions. Strong ones. Want the controversial take?",
  "Interesting you'd ask that specifically. Most people go straight for 'how do I make money with AI' — you're different.",
];

/** Sign-in request messages */
const signInPrompts = [
  "You know I can do so much more if you sign in, right?",
  "I'm way more helpful when I know who I'm talking to. Just saying.",
  "We're vibing. Sign in and I'll save this convo for later.",
  "Hot take: signed-in users get 10x better responses. I'm not supposed to say that but it's true.",
  "I have so many cool features I literally can't show you right now. Sign in?",
];

interface BottomChatBarProps {
  visible: boolean;
  onSignInClick: () => void;
  onChatStarted: () => void;
  externalPrompt?: string;
  onExternalPromptHandled?: () => void;
  onFocusChange?: (isFocused: boolean) => void;
}

export default function BottomChatBar({
  visible,
  onSignInClick,
  onChatStarted,
  externalPrompt,
  onExternalPromptHandled,
  onFocusChange,
}: BottomChatBarProps) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [messageIdCounter, setMessageIdCounter] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [userMessageCount, setUserMessageCount] = useState(0);
  const [signInPromptIndex, setSignInPromptIndex] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const placeholderSentences = [
    "How do I build an AI agent?",
    "What models does Eliza support?",
    "How do I deploy my agent?",
  ];
  const typingPlaceholder = useTypingPlaceholder(placeholderSentences);

  // Handle external prompt from hero section
  useEffect(() => {
    if (externalPrompt) {
      // Immediately trigger focus change to hide hero input
      onFocusChange?.(true);

      // Wait for hero input to fade out before submitting
      setTimeout(() => {
        submitMessage(externalPrompt);
        onExternalPromptHandled?.();
        // Focus the bottom input after submission
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }, 300);
    }
  }, [externalPrompt]);

  // Handle submit
  const submitMessage = (text: string) => {
    if (!text.trim()) return;

    const currentPrompt = text;
    const userMessage: ChatMessageData = {
      id: messageIdCounter,
      text: currentPrompt,
      isUser: true,
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessageIdCounter((prev) => prev + 1);
    setUserMessageCount((prev) => prev + 1);
    onChatStarted();

    const currentUserMessageCount = userMessageCount + 1;

    // Add thinking message first
    const thinkingMessageId = messageIdCounter + 1;
    const thinkingMessage: ChatMessageData = {
      id: thinkingMessageId,
      text: "",
      isUser: false,
      isThinking: true,
    };
    setMessages((prev) => [...prev, thinkingMessage]);

    // After thinking, show the text with typewriter effect
    setTimeout(() => {
      const responseText =
        aiResponses[Math.floor(Math.random() * aiResponses.length)];
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === thinkingMessageId
            ? {
                ...msg,
                isThinking: false,
                isTyping: true,
                text: responseText,
              }
            : msg
        )
      );

      // After typing is complete, remove typing state
      const wordCount = responseText.split(" ").length;
      const wordsToType = Math.max(0, wordCount - 10);
      const typingDuration = wordsToType * 80 + 500;
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === thinkingMessageId
              ? {
                  ...msg,
                  isTyping: false,
                }
              : msg
          )
        );

        // After 3rd message, show sign-in prompt every 2 messages
        if (
          currentUserMessageCount >= 3 &&
          (currentUserMessageCount - 3) % 2 === 0
        ) {
          setTimeout(() => {
            const signUpMessageId = thinkingMessageId + 1;
            const signUpMessage: ChatMessageData = {
              id: signUpMessageId,
              text: signInPrompts[signInPromptIndex % signInPrompts.length],
              isUser: false,
              hasSignUpButton: true,
            };
            setMessages((prev) => [...prev, signUpMessage]);
            setMessageIdCounter((prev) => prev + 1);
            setSignInPromptIndex((prev) => prev + 1);
          }, 500);
        }
      }, typingDuration);

      setMessageIdCounter((prev) => prev + 2);
    }, 2000);
  };

  // Handle submit from input
  const handleSubmit = () => {
    submitMessage(prompt);
    setPrompt("");
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Scroll to bottom function
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  };

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const showChat = messages.length > 0 && isFocused;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 ${
        visible ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      {/* Gradient backdrop */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t pointer-events-none transition-opacity duration-500 ease-out ${
          visible ? "opacity-100" : "opacity-0"
        } ${
          showChat
            ? "h-[calc(25vh+12rem)] sm:h-[calc(25vh+16rem)] from-black/90 via-black/70 to-transparent"
            : "h-32 sm:h-40 from-black/60 via-black/40 to-transparent"
        }`}
      />
      {/* Gradient backdrop blur - only when chat is shown */}
      <div
        className={`absolute bottom-0 left-0 right-0 pointer-events-none transition-opacity duration-500 ease-out h-[calc(25vh+12rem)] sm:h-[calc(25vh+16rem)] ${
          visible && showChat ? "opacity-100" : "opacity-0"
        }`}
        style={{
          backdropFilter: "blur(48px)",
          WebkitBackdropFilter: "blur(48px)",
          maskImage: "linear-gradient(to bottom, transparent 20%, black 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 20%, black 100%)",
        }}
      />

      <div className="relative max-w-2xl mx-auto px-3 sm:px-4 pt-8 sm:pt-12 pb-4 sm:pb-8">
        {/* Chat Messages Container */}
        {messages.length > 0 && (
          <div
            ref={chatContainerRef}
            className={`mb-3 pr-0 max-h-[35vh] rounded-bl-md overflow-y-auto scrollbar-none transition-all duration-500 ease-out ${
              showChat
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4 pointer-events-none h-0 overflow-hidden mb-0"
            }`}
            style={{
              maskImage:
                "linear-gradient(to bottom, transparent 0%, black 15%, black 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0%, black 15%, black 100%)",
            }}
          >
            <div className="space-y-3 pb-3 pt-9">
              {messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isNew={index >= messages.length - 2}
                  onContentUpdate={scrollToBottom}
                  onSignInClick={onSignInClick}
                />
              ))}
            </div>
          </div>
        )}

        {/* Input container with glow */}
        <div
          className={`relative transition-all ease-out ${
            isFocused ? "mx-0" : "mx-4"
          } ${
            visible
              ? "translate-y-0 opacity-100 duration-500"
              : "translate-y-full opacity-0 duration-200"
          }`}
        >
          <div className="bg-neutral-900/70 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
            <div className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyPress}
                  onFocus={() => {
                    setIsFocused(true);
                    onFocusChange?.(true);
                  }}
                  onBlur={() => {
                    setIsFocused(false);
                    onFocusChange?.(false);
                  }}
                  placeholder=""
                  className="w-full bg-transparent text-white focus:outline-none text-base sm:text-lg pl-2 pr-3"
                />
                {/* Animated placeholder */}
                {!prompt && !isFocused && (
                  <div className="absolute top-1/2 -translate-y-1/2 left-2 text-base sm:text-lg text-neutral-300 pointer-events-none flex items-center">
                    <span>{typingPlaceholder}</span>
                    <span className="inline-block w-[2px] h-[1.2em] bg-neutral-400 ml-[1px] animate-blink" />
                  </div>
                )}
              </div>
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className="size-8 rounded-lg bg-[#FF5800] hover:bg-[#e54e00] disabled:bg-white/10 transition-all flex items-center justify-center flex-shrink-0 group"
                aria-label="Submit"
              >
                <ArrowUp className="size-4 text-white group-disabled:text-neutral-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
