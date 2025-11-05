/**
 * Clone Ur Crush Signup Modal
 * 
 * Shows when a user arrives from Clone Ur Crush with character data
 * Displays the character's photo and name to entice signup
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePrivy } from "@privy-io/react-auth";
import { Heart, Sparkles, Loader2, Send } from "lucide-react";
import { BrandButton } from "@/components/brand";
import type { ElizaCharacter } from "@/lib/types";

interface CloneUrCrushSignupModalProps {
  character: ElizaCharacter;
}

export function CloneUrCrushSignupModal({
  character,
}: CloneUrCrushSignupModalProps) {
  const { login } = usePrivy();

  const photoUrl = (character.settings?.photoUrl || character.settings?.avatarUrl) as
    | string
    | undefined;

  // Lightweight chat simulation to boost conversions
  const [messages, setMessages] = useState<
    Array<{ id: string; text: string; isAgent: boolean; isThinking?: boolean }>
  >([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const initialGreeting = useMemo(() => {
    // Use the LLM-generated greeting from character settings
    const greeting = (character.settings as any)?.initialGreeting;
    if (greeting && typeof greeting === 'string' && greeting.trim().length > 0) {
      return greeting.trim();
    }
    // Simple fallback
    return `Hey babe`;
  }, [character]);

  useEffect(() => {
    // Show typing then reveal greeting
    setMessages([{ id: "thinking-1", text: "", isAgent: true, isThinking: true }]);
    const delay = 1200 + Math.floor(Math.random() * 1000); // 1200-2200ms
    const t = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === "thinking-1"
            ? { ...m, isThinking: false, text: initialGreeting }
            : m,
        ),
      );
    }, delay);
    return () => clearTimeout(t);
  }, [initialGreeting]);

  // Always keep scroll pinned to bottom for new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-md"
      >
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 via-purple-500/20 to-indigo-500/20 rounded-2xl blur-xl" />
        
        <div className="relative bg-black/90 border border-white/20 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center space-y-4 mb-6">
            <div className="flex justify-center">
              <div className="relative">
                {photoUrl ? (
                  <div className="relative">
                    <motion.img
                      src={photoUrl}
                      alt={character.name}
                      className="w-32 h-32 rounded-full object-cover border-4 border-pink-500/50 shadow-lg"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                    />
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18 }}
                      className="absolute -bottom-2 -right-2 bg-pink-500 rounded-full p-2 shadow-lg"
                    >
                      <Heart className="w-5 h-5 text-white fill-white animate-pulse" />
                    </motion.div>
                  </div>
                ) : (
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 border-4 border-pink-500/50 flex items-center justify-center">
                    <Sparkles className="w-12 h-12 text-pink-500" />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-white">
                Meet {character.name}! 💕
              </h2>
              <p className="text-white/60 text-sm">Your personalized AI character is ready</p>
            </div>
          </div>

          {/* Chat only (fixed height) */}
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5">
            <div
              ref={scrollRef}
              className="space-y-2 h-64 overflow-y-auto pr-1 p-3"
            >
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className={`flex items-start gap-2 ${m.isAgent ? "" : "justify-end"}`}
                  >
                    {m.isAgent && (
                      <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
                        {photoUrl ? (
                          <img src={photoUrl} alt={character.name} className="w-full h-full object-cover" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                        )}
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm ${
                        m.isAgent
                          ? "bg-white/10 border border-white/10 text-white/90"
                          : "bg-pink-500 text-white"
                      }`}
                    >
                      {m.isThinking ? (
                        <div className="flex items-center gap-1 w-12 min-h-[22px]">
                          <motion.span className="w-1.5 h-1.5 rounded-full bg-white/70"
                            animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 0.9 }} />
                          <motion.span className="w-1.5 h-1.5 rounded-full bg-white/70"
                            animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 0.9, delay: 0.15 }} />
                          <motion.span className="w-1.5 h-1.5 rounded-full bg-white/70"
                            animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 0.9, delay: 0.3 }} />
                        </div>
                      ) : (
                        m.text
                      )}
                    </div>
                    {!m.isAgent && (
                      <div className="w-7 h-7 rounded-full bg-pink-500/20 flex items-center justify-center text-[10px] text-pink-200 font-semibold">
                        You
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const text = input.trim();
                if (text.length === 0) return;
                // Show user's message only; then humanized delay and CTA
                setMessages((prev) => [
                  ...prev,
                  { id: `u-${Date.now()}`, text, isAgent: false },
                ]);
                setInput("");
                setTimeout(() => {
                  setMessages((prev) => [
                    ...prev,
                    { id: `thinking-${Date.now()}`, text: "", isAgent: true, isThinking: true },
                  ]);
                }, 250);
                const delay = 1200 + Math.floor(Math.random() * 1000);
                setTimeout(() => login(), delay);
              }}
              className="flex items-center gap-2 p-3 border-t border-white/10"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-pink-500/40"
                placeholder={`Send a message to ${character.name}…`}
              />
              <motion.button
                type="submit"
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-1 rounded-lg bg-pink-500 hover:bg-pink-600 px-3 py-2 text-sm font-medium text-white transition"
              >
                <Send className="w-4 h-4" />
                Send
              </motion.button>
            </form>
          </div>

          {/* CTAs: Sign up and Log in */}
          <div className="flex gap-2">
            <BrandButton
              variant="primary"
              size="lg"
              onClick={login}
              className="w-full text-base font-semibold"
            >
              Sign up free
            </BrandButton>
            <BrandButton
              variant="outline"
              size="lg"
              onClick={login}
              className="w-full text-base font-semibold"
            >
              Log in
            </BrandButton>
          </div>

          <p className="text-center text-xs text-white/40 mt-3">
            Free chat • No credit card required
          </p>
        </div>
      </motion.div>
    </div>
  );
}


