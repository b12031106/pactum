'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { CommentForm } from './CommentForm';
import { DiscussionSignoff } from './DiscussionSignoff';
import { UserHoverCard } from '@/components/UserHoverCard';
import { useI18n } from '@/i18n/context';
import type { ReactNode } from 'react';
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
  members?: User[];
  onLocateAnchor?: (from: number) => void;
}

function formatTime(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

function renderMentions(text: string, usersByName: Map<string, User>): ReactNode[] {
  if (usersByName.size === 0) return [text];

  // Build a regex that matches any known @Name, longest names first to avoid partial matches
  const names = Array.from(usersByName.keys()).sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`@(${escaped.join('|')})`, 'g');

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const user = usersByName.get(match[1]);
    if (!user) continue;
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <UserHoverCard key={match.index} user={user} className="font-medium text-primary">
        @{user.name}
      </UserHoverCard>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function CommentContent({ content, users }: { content: string; users: Map<string, User> }) {
  return <p className="mt-1 whitespace-pre-wrap">{renderMentions(content, users)}</p>;
}

function AnchorLabel({ type, data, onLocate }: { type: AnchorType; data: Record<string, unknown>; onLocate?: () => void }) {
  if (type === 'line') {
    const line = (data as { lineNumber?: number }).lineNumber;
    return <span className="text-xs text-muted-foreground">Line {line ?? '?'}</span>;
  }
  if (type === 'range') {
    const text = (data as { text?: string }).text;
    if (text) {
      const displayText = text.length > 60 ? text.slice(0, 57) + '...' : text;
      return (
        <span className="flex items-center gap-1.5">
          <span className="flex-1 text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-2 py-0.5 line-clamp-2">
            &ldquo;{displayText}&rdquo;
          </span>
          {onLocate && (
            <button
              type="button"
              onClick={onLocate}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Locate in editor"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
        </span>
      );
    }
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
  members,
  onLocateAnchor,
}: DiscussionThreadProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isOpen = discussion.status === 'open';

  // Build name→user map for mention rendering
  const usersByName = new Map<string, User>();
  if (members) {
    for (const m of members) usersByName.set(m.name, m);
  }
  usersByName.set(discussion.creator.name, discussion.creator);
  for (const comment of discussion.comments) {
    usersByName.set(comment.author.name, comment.author);
  }

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
      toast.success(t('discussions.ctaSet'));
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
        <AnchorLabel
          type={discussion.anchorType}
          data={discussion.anchorData}
          onLocate={
            discussion.anchorType === 'range' && discussion.anchorData?.from != null && onLocateAnchor
              ? () => onLocateAnchor(discussion.anchorData.from as number)
              : undefined
          }
        />
        <Badge variant={isOpen ? 'outline' : 'secondary'}>
          {discussion.status}
        </Badge>
      </div>

      {/* Comments */}
      <div className="space-y-2">
        {discussion.comments.map((comment) => (
          <div key={comment.id} className="rounded-md bg-muted/50 p-2 text-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground"><UserHoverCard user={comment.author}>{comment.author.name}</UserHoverCard></span>
              <span>{formatTime(comment.createdAt)}</span>
            </div>
            <CommentContent content={comment.content} users={usersByName} />
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
            {t('discussions.noChange')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => resolveMutation.mutate('need_change')}
            disabled={resolveMutation.isPending}
          >
            {t('discussions.needChange')}
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
          <span className="font-medium">{t('discussions.resolution')}</span> {discussion.resolution}
        </div>
      )}

      {/* Comment form — only when open */}
      {isOpen && <CommentForm discussionId={discussion.id} documentId={documentId} />}
    </div>
  );
}
