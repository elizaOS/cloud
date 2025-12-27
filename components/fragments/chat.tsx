"use client";

import type { FragmentSchema } from "@/lib/fragments/schema";
import type { ExecutionResult } from "@/lib/fragments/types";
import { DeepPartial } from "ai";
import { LoaderIcon, Terminal } from "lucide-react";
import { useEffect, useMemo } from "react";
import Image from "next/image";

export interface Message {
  role: "user" | "assistant";
  content: Array<{
    type: "text" | "image" | "code";
    text?: string;
    image?: string;
    code?: string;
  }>;
  object?: DeepPartial<FragmentSchema>;
  result?: ExecutionResult;
}

export function Chat({
  messages,
  isLoading,
  setCurrentPreview,
}: {
  messages: Message[];
  isLoading: boolean;
  setCurrentPreview: (preview: {
    fragment: DeepPartial<FragmentSchema> | undefined;
    result: ExecutionResult | undefined;
  }) => void;
}) {
  const messagesKey = useMemo(() => JSON.stringify(messages), [messages]);

  useEffect(() => {
    const chatContainer = document.getElementById("chat-container");
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [messagesKey]);

  return (
    <div
      id="chat-container"
      className="flex flex-col pb-12 gap-2 sm:gap-3 overflow-y-auto max-h-full px-2 sm:px-0"
    >
      {messages.map((message: Message, index: number) => (
        <div
          className={`flex flex-col px-3 sm:px-4 shadow-sm whitespace-pre-wrap ${
            message.role !== "user"
              ? "bg-accent dark:bg-white/5 border text-accent-foreground dark:text-muted-foreground py-3 sm:py-4 rounded-xl sm:rounded-2xl gap-3 sm:gap-4 w-full"
              : "bg-gradient-to-b from-black/5 to-black/10 dark:from-black/30 dark:to-black/50 py-2 rounded-lg sm:rounded-xl gap-2 w-fit max-w-[85%] sm:max-w-none"
          } font-serif text-sm sm:text-base`}
          key={index}
        >
          {message.content.map((content, id) => {
            if (content.type === "text") {
              return <span key={id}>{content.text}</span>;
            }
            if (content.type === "image") {
              return (
                <Image
                  key={id}
                  src={content.image || ""}
                  alt="fragment"
                  width={48}
                  height={48}
                  className="mr-2 inline-block w-12 h-12 object-cover rounded-lg bg-white mb-2"
                />
              );
            }
            if (content.type === "code") {
              return (
                <pre key={id} className="text-xs bg-muted p-2 rounded">
                  {content.code}
                </pre>
              );
            }
            return null;
          })}
          {message.object && (
            <div
              onClick={() =>
                setCurrentPreview({
                  fragment: message.object,
                  result: message.result,
                })
              }
              className="py-2 pl-2 w-full sm:w-max flex items-center border rounded-lg sm:rounded-xl select-none hover:bg-white dark:hover:bg-white/5 hover:cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className="rounded-[0.5rem] w-8 h-8 sm:w-10 sm:h-10 bg-black/5 dark:bg-white/5 self-stretch flex items-center justify-center shrink-0">
                <Terminal
                  strokeWidth={2}
                  className="text-[#FF8800] h-4 w-4 sm:h-5 sm:w-5"
                />
              </div>
              <div className="pl-2 pr-3 sm:pr-4 flex flex-col min-w-0">
                <span className="font-bold font-sans text-xs sm:text-sm text-primary truncate">
                  {message.object.title}
                </span>
                <span className="font-sans text-xs sm:text-sm text-muted-foreground">
                  Tap to preview
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
      {isLoading && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <LoaderIcon strokeWidth={2} className="animate-spin w-4 h-4" />
          <span>Generating...</span>
        </div>
      )}
    </div>
  );
}
