'use client';

import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MentionTextarea, type MentionTextareaRef } from './MentionTextarea';
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
  const [mentionVisible, setMentionVisible] = useState(false);
  const mentionRef = useRef<MentionTextareaRef>(null);

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      const mentions = mentionRef.current?.getMentions() ?? [];
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
      mentionRef.current?.reset();
      queryClient.invalidateQueries({ queryKey: ['discussion', discussionId] });
      queryClient.invalidateQueries({ queryKey: ['discussions'] });
      toast.success(t('comments.added'));
      onSuccess?.();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (mentionVisible) return;
    if (!content.trim()) return;
    mutation.mutate(content.trim());
  }, [mentionVisible, content, mutation]);

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <MentionTextarea
        ref={mentionRef}
        documentId={documentId}
        value={content}
        onChange={setContent}
        onMentionVisibleChange={setMentionVisible}
      />
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
