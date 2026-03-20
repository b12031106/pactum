'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CommentForm } from './CommentForm';
import { DiscussionSignoff } from './DiscussionSignoff';
import type { DiscussionStatus, DiscussionCta, AnchorType } from '@/types';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface Comment {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  author: User;
}

interface Signoff {
  id: string;
  userId: string;
  user: User;
  createdAt: string;
}

export interface Discussion {
  id: string;
  documentId: string;
  createdBy: string;
  anchorType: AnchorType;
  anchorData: Record<string, unknown>;
  status: DiscussionStatus;
  cta: DiscussionCta | null;
  resolution: string | null;
  resolvedAt: string | null;
  creator: User;
  comments: Comment[];
  signoffs: Signoff[];
  _count?: { comments: number };
}

interface DiscussionThreadProps {
  discussion: Discussion;
  documentId: string;
  canResolve: boolean;
  currentUserId?: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AnchorLabel({ type, data }: { type: AnchorType; data: Record<string, unknown> }) {
  if (type === 'line') {
    const line = (data as { lineNumber?: number }).lineNumber;
    return <span className="text-xs text-muted-foreground">Line {line ?? '?'}</span>;
  }
  if (type === 'range') {
    const from = (data as { from?: number }).from;
    const to = (data as { to?: number }).to;
    return (
      <span className="text-xs text-muted-foreground">
        Range {from ?? '?'}–{to ?? '?'}
      </span>
    );
  }
  return null;
}

export function DiscussionThread({
  discussion,
  documentId,
  canResolve,
  currentUserId,
}: DiscussionThreadProps) {
  const queryClient = useQueryClient();
  const isOpen = discussion.status === 'open';

  const resolveMutation = useMutation({
    mutationFn: async (cta: 'no_change' | 'need_change') => {
      const res = await fetch(`/api/discussions/${discussion.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cta }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || 'Failed to resolve');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Discussion CTA set');
      queryClient.invalidateQueries({ queryKey: ['discussion', discussion.id] });
      queryClient.invalidateQueries({ queryKey: ['discussions'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <AnchorLabel type={discussion.anchorType} data={discussion.anchorData} />
        <Badge variant={isOpen ? 'outline' : 'secondary'}>
          {discussion.status}
        </Badge>
      </div>

      {/* Comments */}
      <div className="space-y-2">
        {discussion.comments.map((comment) => (
          <div key={comment.id} className="rounded-md bg-muted/50 p-2 text-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{comment.author.name}</span>
              <span>{formatTime(comment.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{comment.content}</p>
          </div>
        ))}
      </div>

      {/* Resolve section — only when open and no CTA set */}
      {isOpen && !discussion.cta && canResolve && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => resolveMutation.mutate('no_change')}
            disabled={resolveMutation.isPending}
          >
            No Change
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => resolveMutation.mutate('need_change')}
            disabled={resolveMutation.isPending}
          >
            Need Change
          </Button>
        </div>
      )}

      {/* Signoff section — when CTA is set and still open */}
      {isOpen && discussion.cta && (
        <DiscussionSignoff
          discussionId={discussion.id}
          cta={discussion.cta}
          signoffs={discussion.signoffs}
          documentId={documentId}
          currentUserId={currentUserId}
        />
      )}

      {/* Resolution text — when resolved */}
      {!isOpen && discussion.resolution && (
        <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          <span className="font-medium">Resolution:</span> {discussion.resolution}
        </div>
      )}

      {/* Comment form — only when open */}
      {isOpen && <CommentForm discussionId={discussion.id} documentId={documentId} />}
    </div>
  );
}
