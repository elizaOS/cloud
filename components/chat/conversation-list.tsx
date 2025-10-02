'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, MessageSquare, Trash2, Edit2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConversationInput } from './conversation-input';
import { ConversationScrollArea } from './conversation-scroll-area';
import type { Conversation } from '@/lib/types';
import {
  createConversationAction,
  updateConversationTitleAction,
  deleteConversationAction,
} from '@/app/actions/conversations';
import { cn } from '@/lib/utils';

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
  const [editTitle, setEditTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleCreate = async () => {
    setIsCreating(true);
    const result = await createConversationAction({
      title: 'New Conversation',
      model: 'gpt-4o',
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

  const handleSaveEdit = async (id: string) => {
    if (editTitle.trim()) {
      setIsSaving(true);
      try {
        await updateConversationTitleAction(id, editTitle.trim());
      } catch (error) {
        console.error('Failed to update conversation title:', error);
      } finally {
        setIsSaving(false);
      }
    }
    setEditingId(null);
    setEditTitle('');
  };

  const handleCancelEdit = () => {
    if (!isSaving) {
      setEditingId(null);
      setEditTitle('');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this conversation?')) {
      setDeletingId(id);
      try {
        await deleteConversationAction(id);
        if (id === currentConversationId) {
          const nextConv = conversations.find(c => c.id !== id);
          if (nextConv) {
            onSelectConversation(nextConv.id);
          } else {
            router.push('/dashboard/text');
          }
        }
      } catch (error) {
        console.error('Failed to delete conversation:', error);
      } finally {
        setDeletingId(null);
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editingId && !isSaving && editInputRef.current && !editInputRef.current.contains(event.target as Node)) {
        handleSaveEdit(editingId);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (editingId && !isSaving) {
        if (event.key === 'Enter') {
          event.preventDefault();
          handleSaveEdit(editingId);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          handleCancelEdit();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingId, editTitle, isSaving]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="border-b px-4 pb-4 pt-5">
        <Button
          onClick={handleCreate}
          disabled={isCreating}
          className="w-full justify-center gap-2 rounded-xl shadow-sm transition-shadow hover:shadow"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New Chat
        </Button>
      </div>

      <ConversationScrollArea className="flex-1">
        <div className="space-y-2 px-3 pb-4 pt-3">
          {conversations.map((conversation) => {
            const isActive = conversation.id === currentConversationId;

            return (
              <div
                key={conversation.id}
                className={cn(
                  'group relative flex cursor-pointer flex-col gap-3 rounded-2xl border border-transparent bg-background/70 p-3 transition-colors duration-150',
                  isActive
                    ? 'border-primary/30 bg-primary/[0.08] shadow-sm'
                    : 'hover:border-border/60 hover:bg-muted/70'
                )}
                onClick={() => onSelectConversation(conversation.id)}
              >
                {isSaving && editingId === conversation.id ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
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
                      className="h-8 rounded-lg border-border bg-background text-sm"
                      autoFocus
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-transparent bg-muted text-muted-foreground',
                        isActive && 'border-primary/40 bg-primary/10 text-primary'
                      )}>
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {conversation.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {conversation.message_count} messages
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(conversation);
                        }}
                        disabled={deletingId === conversation.id}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-full text-destructive"
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
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {conversations.length === 0 && (
            <div className="rounded-xl border border-dashed border-muted-foreground/40 px-4 py-10 text-center text-muted-foreground">
              <MessageSquare className="mx-auto mb-3 h-8 w-8 opacity-60" />
              <p className="text-sm font-medium text-foreground">No conversations yet</p>
              <p className="text-xs">Start a new chat to see it appear here.</p>
            </div>
          )}
        </div>
      </ConversationScrollArea>
    </div>
  );
}
