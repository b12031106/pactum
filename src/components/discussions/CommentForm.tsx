'use client';

import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MentionSuggestion } from './MentionSuggestion';
import { useI18n } from '@/i18n/context';

interface CommentFormProps {
  discussionId: string;
  documentId: string;
  onSuccess?: () => void;
}

export function CommentForm({ discussionId, documentId, onSuccess }: CommentFormProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionVisible, setMentionVisible] = useState(false);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(`/api/discussions/${discussionId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, mentions }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || 'Failed to add comment');
      }
      return res.json();
    },
    onSuccess: () => {
      setContent('');
      setMentions([]);
      queryClient.invalidateQueries({ queryKey: ['discussion', discussionId] });
      queryClient.invalidateQueries({ queryKey: ['discussions'] });
      toast.success(t('comments.added'));
      onSuccess?.();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionVisible(true);
      setMentionPosition({ top: (textareaRef.current?.offsetHeight ?? 0) + 4, left: 0 });
    } else {
      setMentionVisible(false);
    }
  }, []);

  const handleMentionSelect = useCallback((user: { id: string; name: string }) => {
    const cursorPos = textareaRef.current?.selectionStart ?? 0;
    const text = content;
    const beforeAt = text.slice(0, cursorPos).replace(/@\w*$/, '');
    const afterCursor = text.slice(cursorPos);
    setContent(`${beforeAt}@${user.name} ${afterCursor}`);
    setMentions((prev) => [...new Set([...prev, user.id])]);
    setMentionVisible(false);
    textareaRef.current?.focus();
  }, [content]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mentionVisible) return; // Don't submit while selecting mention
    if (!content.trim()) return;
    mutation.mutate(content.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          placeholder={t('comments.placeholder')}
        />
        <MentionSuggestion
          documentId={documentId}
          query={mentionQuery}
          visible={mentionVisible}
          onSelect={handleMentionSelect}
          position={mentionPosition}
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={mutation.isPending || !content.trim()}
        >
          {mutation.isPending ? t('comments.sending') : t('comments.send')}
        </Button>
      </div>
    </form>
  );
}
