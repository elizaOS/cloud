"use client";

import { useState } from "react";
import { Plus, Trash2, MessageSquare, User, Bot } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ElizaCharacter } from "@/lib/types";

type MessageExample = NonNullable<ElizaCharacter["messageExamples"]>[number][number];

interface MessageExamplesEditorProps {
  examples: ElizaCharacter["messageExamples"];
  onChange: (examples: ElizaCharacter["messageExamples"]) => void;
  characterName: string;
}

export function MessageExamplesEditor({
  examples = [],
  onChange,
  characterName,
}: MessageExamplesEditorProps) {
  const addConversation = () => {
    const newConversation = [
      {
        name: "{{user1}}",
        content: { text: "" },
      },
      {
        name: characterName || "{{char}}",
        content: { text: "" },
      },
    ];
    onChange([...(examples || []), newConversation]);
  };

  const removeConversation = (index: number) => {
    const newExamples = [...(examples || [])];
    newExamples.splice(index, 1);
    onChange(newExamples);
  };

  const addMessage = (conversationIndex: number) => {
    const newExamples = [...(examples || [])];
    const conversation = newExamples[conversationIndex];
    
    // Auto-detect next speaker
    const lastMessage = conversation[conversation.length - 1];
    const nextName = lastMessage?.name === "{{user1}}" ? (characterName || "{{char}}") : "{{user1}}";
    
    conversation.push({
      name: nextName,
      content: { text: "" },
    });
    onChange(newExamples);
  };

  const removeMessage = (conversationIndex: number, messageIndex: number) => {
    const newExamples = [...(examples || [])];
    newExamples[conversationIndex].splice(messageIndex, 1);
    onChange(newExamples);
  };

  const updateMessage = (
    conversationIndex: number,
    messageIndex: number,
    field: "name" | "text",
    value: string
  ) => {
    const newExamples = [...(examples || [])];
    const message = newExamples[conversationIndex][messageIndex];
    
    if (field === "name") {
      message.name = value;
    } else {
      message.content = { ...message.content, text: value };
    }
    
    onChange(newExamples);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
          Dialogue Examples
        </label>
        <button
          onClick={addConversation}
          className="flex items-center gap-2 text-xs font-medium text-[#FF5800] hover:text-[#FF5800]/80 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Conversation
        </button>
      </div>

      <div className="space-y-4">
        {(!examples || examples.length === 0) && (
          <div className="text-center p-8 border border-dashed border-white/10 bg-white/5 rounded-none">
            <MessageSquare className="h-8 w-8 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/40 mb-2">
              No dialogue examples yet.
            </p>
            <button
              onClick={addConversation}
              className="text-sm text-[#FF5800] hover:underline"
            >
              Add your first example conversation
            </button>
          </div>
        )}

        {examples?.map((conversation, convIndex) => (
          <div
            key={convIndex}
            className="group relative border border-white/10 bg-black/40 p-4 space-y-4"
          >
            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => removeConversation(convIndex)}
                className="p-1 text-white/40 hover:text-rose-400 transition-colors"
                title="Remove conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {conversation.map((msg, msgIndex) => (
                <div key={msgIndex} className="flex gap-3 items-start">
                  <div className="shrink-0 mt-2">
                    {msg.name === "{{user1}}" || msg.name === "{{user}}" ? (
                      <User className="h-4 w-4 text-blue-400" />
                    ) : (
                      <Bot className="h-4 w-4 text-[#FF5800]" />
                    )}
                  </div>
                  
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Input
                        value={msg.name}
                        onChange={(e) => updateMessage(convIndex, msgIndex, "name", e.target.value)}
                        className="h-6 w-32 text-xs bg-transparent border-transparent hover:border-white/10 focus:border-white/20 px-1 py-0 text-white/70"
                        placeholder="Speaker"
                      />
                      <div className="flex-1" />
                      <button
                        onClick={() => removeMessage(convIndex, msgIndex)}
                        className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-rose-400 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <Textarea
                      value={msg.content.text}
                      onChange={(e) => updateMessage(convIndex, msgIndex, "text", e.target.value)}
                      className="min-h-[60px] rounded-none border-white/10 bg-white/5 text-sm text-white placeholder:text-white/20 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                      placeholder="Type message..."
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => addMessage(convIndex)}
              className="w-full py-2 text-xs text-white/40 hover:text-white hover:bg-white/5 border border-dashed border-white/10 transition-colors"
            >
              + Add Message
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function X(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

