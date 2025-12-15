"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Loader2, Send, Sparkles, Check, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Workflow, ChatMessage } from "./types";

interface WorkflowChatEditorProps {
  workflow: Workflow;
  onWorkflowUpdated: (workflow: Workflow) => void;
  onBack: () => void;
}

export function WorkflowChatEditor({
  workflow,
  onWorkflowUpdated,
  onBack,
}: WorkflowChatEditorProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentWorkflow, setCurrentWorkflow] = useState(workflow);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMessages([
      {
        id: "init",
        role: "assistant",
        content: `I'm ready to help you edit "${workflow.name}". You can ask me to:\n\n• Add, modify, or remove nodes\n• Change connections between nodes\n• Update workflow settings\n• Rename the workflow\n• Update the description\n\nWhat would you like to change?`,
        timestamp: new Date(),
      },
    ]);
  }, [workflow.name]);

  async function handleSubmit() {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/v1/n8n/workflows/edit-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: currentWorkflow.id,
          currentWorkflow: currentWorkflow,
          message: trimmedInput,
          history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to process request");
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.message,
        timestamp: new Date(),
        proposedChanges: data.proposedChanges,
        changeStatus: data.proposedChanges ? "pending" : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to process request",
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            "I encountered an error processing your request. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function applyChanges(messageId: string) {
    const message = messages.find((m) => m.id === messageId);
    if (!message?.proposedChanges) return;

    setIsLoading(true);

    try {
      const { workflowData, name, description, status } =
        message.proposedChanges;
      const updatePayload = {
        ...(workflowData && { workflowData }),
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
      };

      const response = await fetch(
        `/api/v1/n8n/workflows/${currentWorkflow.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatePayload),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to apply changes");
      }

      const data = await response.json();
      const updatedWorkflow = data.workflow;

      setCurrentWorkflow(updatedWorkflow);
      onWorkflowUpdated(updatedWorkflow);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, changeStatus: "applied" as const } : m,
        ),
      );

      toast.success(
        `Changes applied! Now at version ${updatedWorkflow.version}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to apply changes",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function rejectChanges(messageId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, changeStatus: "rejected" as const } : m,
      ),
    );
    toast.info("Changes rejected");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-white/60 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#FF5800]" />
              Edit with AI
            </h2>
            <p className="text-sm text-white/50">
              {currentWorkflow.name} • v{currentWorkflow.version}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg p-4",
                message.role === "user"
                  ? "bg-[#FF5800] text-white"
                  : "bg-white/5 border border-white/10",
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>

              {message.proposedChanges && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  {message.changeStatus === "pending" && (
                    <div className="flex items-center gap-2">
                      <BrandButton
                        variant="primary"
                        size="sm"
                        onClick={() => applyChanges(message.id)}
                        disabled={isLoading}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Apply Changes
                      </BrandButton>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => rejectChanges(message.id)}
                        className="text-white/60 hover:text-white"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                  {message.changeStatus === "applied" && (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <Check className="h-4 w-4" />
                      Changes applied
                    </div>
                  )}
                  {message.changeStatus === "rejected" && (
                    <div className="flex items-center gap-2 text-white/40 text-sm">
                      <X className="h-4 w-4" />
                      Changes rejected
                    </div>
                  )}

                  <details className="mt-3">
                    <summary className="text-xs text-white/40 cursor-pointer hover:text-white/60">
                      View proposed changes
                    </summary>
                    <pre className="mt-2 p-3 bg-black/30 rounded text-xs font-mono overflow-auto max-h-[200px]">
                      {JSON.stringify(message.proposedChanges, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <Loader2 className="h-5 w-5 animate-spin text-[#FF5800]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the changes you want to make..."
            className="min-h-[60px] bg-white/5 border-white/10 text-white placeholder:text-white/40 resize-none"
            disabled={isLoading}
          />
          <BrandButton
            variant="primary"
            onClick={handleSubmit}
            disabled={isLoading || !input.trim()}
            className="px-4"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </BrandButton>
        </div>
        <p className="text-xs text-white/30 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
