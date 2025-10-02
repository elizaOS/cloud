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
    <div className="flex flex-col h-full border-r bg-muted/30">
      <div className="p-4 border-b">
        <Button
          onClick={handleCreate}
          disabled={isCreating}
          className="w-full"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      <ConversationScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`group relative rounded-lg p-3 cursor-pointer transition-colors ${
                conversation.id === currentConversationId
                  ? 'bg-primary/10 border border-primary/20'
                  : 'hover:bg-accent'
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
                    className="h-7 text-sm flex-1"
                    autoFocus
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {conversation.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {conversation.message_count} messages
                      </p>
                    </div>
                  </div>

                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
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
                      className="h-7 w-7 text-destructive"
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
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs">Click &quot;New Chat&quot; to start</p>
            </div>
          )}
        </div>
      </ConversationScrollArea>
    </div>
  );
}
