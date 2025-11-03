"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, MessageSquare, Trash2, Edit2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConversationInput } from "./conversation-input";
import { ConversationScrollArea } from "./conversation-scroll-area";
import type { Conversation } from "@/lib/types";
import {
  createConversationAction,
  updateConversationTitleAction,
  deleteConversationAction,
} from "@/app/actions/conversations";
import { cn } from "@/lib/utils";
import { BrandButton, SectionLabel } from "@/components/brand";

interface ConversationListProps {
  conversations: Conversation[];
  currentConversationId?: string;
  onSelectConversation: (id: string) => void;
}

export function ConversationList({
  conversations,
  currentConversationId,
  onSelectConversation,
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleCreate = async () => {
    setIsCreating(true);
    const result = await createConversationAction({
      title: "New Conversation",
      model: "gpt-4o",
    });
    if (result.success && result.conversation) {
      onSelectConversation(result.conversation.id);
    }
    setIsCreating(false);
  };

  const handleStartEdit = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleSaveEdit = useCallback(
    async (id: string) => {
      if (editTitle.trim()) {
        setIsSaving(true);
        try {
          await updateConversationTitleAction(id, editTitle.trim());
        } catch (error) {
          console.error("Failed to update conversation title:", error);
        } finally {
          setIsSaving(false);
        }
      }
      setEditingId(null);
      setEditTitle("");
    },
    [editTitle],
  );

  const handleCancelEdit = useCallback(() => {
    if (!isSaving) {
      setEditingId(null);
      setEditTitle("");
    }
  }, [isSaving]);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this conversation?")) {
      setDeletingId(id);
      try {
        await deleteConversationAction(id);
        if (id === currentConversationId) {
          const nextConv = conversations.find((c) => c.id !== id);
          if (nextConv) {
            onSelectConversation(nextConv.id);
          } else {
            router.push("/dashboard/text");
          }
        }
      } catch (error) {
        console.error("Failed to delete conversation:", error);
      } finally {
        setDeletingId(null);
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        editingId &&
        !isSaving &&
        editInputRef.current &&
        !editInputRef.current.contains(event.target as Node)
      ) {
        handleSaveEdit(editingId);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (editingId && !isSaving) {
        if (event.key === "Enter") {
          event.preventDefault();
          handleSaveEdit(editingId);
        } else if (event.key === "Escape") {
          event.preventDefault();
          handleCancelEdit();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingId, editTitle, isSaving, handleSaveEdit, handleCancelEdit]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col relative z-10">
      <div className="border-b border-white/10 px-4 pb-4 pt-5">
        <div className="mb-3">
          <SectionLabel>Conversations</SectionLabel>
        </div>
        <BrandButton
          onClick={handleCreate}
          disabled={isCreating}
          variant="primary"
          className="w-full justify-center gap-2"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New Chat
        </BrandButton>
      </div>

      <ConversationScrollArea className="flex-1">
        <div className="space-y-2 px-3 pb-4 pt-3">
          {conversations.map((conversation) => {
            const isActive = conversation.id === currentConversationId;

            return (
              <div
                key={conversation.id}
                className={cn(
                  "group relative flex cursor-pointer flex-col gap-3 rounded-none border-l-2 p-3 transition-all duration-150",
                  isActive
                    ? "border-[#FF5800] bg-white/10"
                    : "border-transparent hover:bg-white/5",
                )}
                onClick={() => onSelectConversation(conversation.id)}
              >
                {isSaving && editingId === conversation.id ? (
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <Loader2 className="h-4 w-4 animate-spin text-[#FF5800]" />
                    <span>Saving changes</span>
                  </div>
                ) : editingId === conversation.id ? (
                  <div
                    ref={editInputRef}
                    className="flex items-center gap-2"
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <ConversationInput
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-8 rounded-none border-white/10 bg-black/40 text-sm text-white"
                      autoFocus
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-none border bg-black/60",
                          isActive
                            ? "border-[#FF5800] bg-[#FF580020] text-[#FF5800]"
                            : "border-white/10 text-white/60",
                        )}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {conversation.title}
                        </p>
                        <p className="text-xs text-white/50">
                          {conversation.message_count} messages
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <BrandButton
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(conversation);
                        }}
                        disabled={deletingId === conversation.id}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </BrandButton>
                      <BrandButton
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-rose-400 hover:bg-rose-500/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(conversation.id);
                        }}
                        disabled={deletingId === conversation.id}
                      >
                        {deletingId === conversation.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </BrandButton>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {conversations.length === 0 && (
            <div className="rounded-none border border-dashed border-white/10 px-4 py-10 text-center text-white/60">
              <MessageSquare className="mx-auto mb-3 h-8 w-8 opacity-60 text-[#FF5800]" />
              <p className="text-sm font-medium text-white">
                No conversations yet
              </p>
              <p className="text-xs">Start a new chat to see it appear here.</p>
            </div>
          )}
        </div>
      </ConversationScrollArea>
    </div>
  );
}
