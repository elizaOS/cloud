"use client";

import { Heart, MessageCircle, Sparkles, Zap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { getCloudUrl } from "@/lib/cloud-url";

function ConnectingContent() {
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(0);
  const [hearts, setHearts] = useState<Array<{ id: number; left: number }>>([]);

  const name = searchParams.get("name") || "Your Character";
  const characterId = searchParams.get("characterId");
  const sessionId = searchParams.get("sessionId");
  const avatarUrl = searchParams.get("avatarUrl");

  const steps = [
    {
      icon: Sparkles,
      text: "Analyzing your preferences",
      color: "text-brand-400",
    },
    {
      icon: Heart,
      text: "Creating your perfect companion",
      color: "text-fuchsia-400",
    },
    {
      icon: MessageCircle,
      text: "Finalizing everything for you",
      color: "text-accent-brand-400",
    },
  ];

  useEffect(() => {
    // Step progression
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => (prev < 2 ? prev + 1 : prev));
    }, 2000);

    // Floating hearts animation
    const heartsInterval = setInterval(() => {
      setHearts((prev) => {
        const newHearts = [
          ...prev,
          { id: Date.now(), left: 45 + Math.random() * 10 },
        ];
        return newHearts.slice(-5); // Keep only last 5
      });
    }, 800);

    // Redirect after animation
    let redirectTimeout: NodeJS.Timeout | null = null;

    if (characterId) {
      redirectTimeout = setTimeout(() => {
        // If we have a sessionId, this is an unauthenticated user
        // They need to go to the Cloud chat page where their session is valid
        if (sessionId) {
          const cloudUrl = getCloudUrl();
          const cloudChatUrl = `${cloudUrl}/chat/${characterId}?session=${sessionId}`;
          window.location.href = cloudChatUrl;
        } else {
          // Authenticated user - go to miniapp chat
          window.location.href = `/chats/${characterId}`;
        }
      }, 6000); // 6 seconds for animation
    }

    return () => {
      clearInterval(stepInterval);
      clearInterval(heartsInterval);
      if (redirectTimeout) {
        clearTimeout(redirectTimeout);
      }
    };
  }, [characterId, sessionId]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050109] p-4">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient orbs */}
        <div className="bg-brand/10 absolute top-1/4 left-1/4 size-96 animate-pulse rounded-full blur-3xl" />
        <div className="absolute right-1/4 bottom-1/4 size-96 animate-pulse rounded-full bg-fuchsia-500/10 blur-3xl delay-1000" />

        {/* Floating hearts */}
        {hearts.map((heart) => (
          <div
            key={heart.id}
            className="animate-float-up absolute top-3/4 left-1/2 opacity-0"
            style={{
              animationDelay: "0s",
              left: `${heart.left}%`,
            }}
          >
            <Heart className="fill-brand/30 text-brand/50 size-6" />
          </div>
        ))}
      </div>

      {/* Main content card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.02] to-white/[0.01] p-8 shadow-2xl backdrop-blur-sm sm:p-10">
          {/* Subtle inner shadow */}
          <div className="absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]" />

          <div className="relative space-y-8">
            {/* Avatar or Animated icon */}
            <div className="flex justify-center">
              <div className="relative">
                {/* Pulsing ring */}
                <div className="bg-brand/20 absolute -inset-2 animate-ping rounded-full" />
                <div className="from-brand/30 absolute -inset-2 animate-pulse rounded-full bg-gradient-to-r to-fuchsia-500/30 blur-md" />
                {/* Avatar or fallback icon */}
                {avatarUrl ? (
                  <div className="border-brand/50 shadow-brand/30 relative size-24 overflow-hidden rounded-full border-2 shadow-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatarUrl}
                      alt={name}
                      className="size-full object-cover"
                    />
                    {/* Animated glow overlay */}
                    <div className="from-brand/20 absolute inset-0 animate-pulse bg-gradient-to-t to-transparent" />
                  </div>
                ) : (
                  <div className="from-brand to-brand-600 shadow-brand/30 relative flex size-20 items-center justify-center rounded-full bg-gradient-to-b shadow-lg">
                    <Zap
                      className="size-10 animate-pulse text-white"
                      fill="white"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Main heading */}
            <div className="text-center">
              <h1 className="text-2xl leading-tight font-bold text-balance text-white sm:text-3xl">
                {`Bringing ${name} to life...`}
              </h1>
            </div>

            {/* Progress steps */}
            <div className="space-y-3">
              {steps.map((step) => {
                const stepIndex = steps.indexOf(step);
                const Icon = step.icon;
                const isActive = stepIndex <= currentStep;
                const isComplete = stepIndex < currentStep;

                return (
                  <div
                    key={step.text}
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-all duration-500 ${
                      isActive
                        ? "border-white/10 bg-white/[0.02]"
                        : "border-white/5 bg-transparent opacity-40"
                    }`}
                  >
                    {/* Icon */}
                    <div
                      className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isComplete
                          ? "bg-brand/20"
                          : isActive
                            ? "bg-brand/10"
                            : "bg-white/5"
                      }`}
                    >
                      {isComplete ? (
                        <div className="bg-brand flex size-4 items-center justify-center rounded-full">
                          <svg
                            className="size-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-label="Completed"
                          >
                            <title>Completed</title>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      ) : (
                        <Icon
                          className={`size-4 ${isActive ? `${step.color} animate-pulse` : "text-white/30"}`}
                        />
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 pt-0.5">
                      <p
                        className={`text-sm leading-relaxed transition-colors ${
                          isActive ? "text-white/90" : "text-white/40"
                        }`}
                      >
                        {step.text}
                      </p>
                    </div>

                    {/* Loading spinner for active step */}
                    {isActive && !isComplete && (
                      <div className="border-brand/30 border-t-brand mt-1 size-4 shrink-0 animate-spin rounded-full border-2" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Custom animation for floating hearts */}
      <style jsx>{`
        @keyframes float-up {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          80% {
            opacity: 1;
          }
          100% {
            transform: translateY(-300px) scale(0.5);
            opacity: 0;
          }
        }
        .animate-float-up {
          animation: float-up 3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

export default function ConnectingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#050109]">
          <div className="border-brand/30 border-t-brand size-8 animate-spin rounded-full border-2" />
        </div>
      }
    >
      <ConnectingContent />
    </Suspense>
  );
}
