'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, MessageSquare, Trash2, Edit2 } from 'lucide-react';
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

  const handleSaveEdit = useCallback(async (id: string) => {
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
  }, [editTitle]);

  const handleCancelEdit = useCallback(() => {
    if (!isSaving) {
      setEditingId(null);
      setEditTitle('');
    }
  }, [isSaving]);

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
  }, [editingId, editTitle, isSaving, handleSaveEdit, handleCancelEdit]);

  return (
    <div className="flex flex-col h-full border rounded-xl bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-4 border-b bg-gradient-to-b from-background to-muted/20">
        <Button
          onClick={handleCreate}
          disabled={isCreating}
          className="w-full rounded-lg shadow-sm"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      <ConversationScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`group relative rounded-xl p-3 cursor-pointer transition-all ${
                conversation.id === currentConversationId
                  ? 'bg-primary/10 border border-primary/30 shadow-sm'
                  : 'hover:bg-accent/50 border border-transparent'
              }`}
              onClick={() => onSelectConversation(conversation.id)}
            >
              {isSaving && editingId === conversation.id ? (
                <div className="flex items-center gap-2 py-1">
                  <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="flex gap-1">
                      <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                      <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                      <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                    </div>
                    <span>Saving changes</span>
                  </div>
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
                    className="h-8 text-sm flex-1 rounded-lg"
                    autoFocus
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/10 to-blue-600/10 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate mb-1">
                        {conversation.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {conversation.message_count} messages
                      </p>
                    </div>
                  </div>

                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1 shadow-sm">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 rounded-md hover:bg-accent"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(conversation);
                      }}
                      disabled={deletingId === conversation.id}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 rounded-md text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(conversation.id);
                      }}
                      disabled={deletingId === conversation.id}
                    >
                      {deletingId === conversation.id ? (
                        <div className="flex gap-0.5">
                          <span className="animate-bounce text-[8px]" style={{ animationDelay: '0ms' }}>.</span>
                          <span className="animate-bounce text-[8px]" style={{ animationDelay: '150ms' }}>.</span>
                          <span className="animate-bounce text-[8px]" style={{ animationDelay: '300ms' }}>.</span>
                        </div>
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}

          {conversations.length === 0 && (
            <div className="text-center py-12 px-4 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-600/10 flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium mb-1">No conversations yet</p>
              <p className="text-xs">Click &quot;New Chat&quot; to start</p>
            </div>
          )}
        </div>
      </ConversationScrollArea>
    </div>
  );
}
