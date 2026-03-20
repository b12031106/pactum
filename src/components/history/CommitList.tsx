'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { UserHoverCard } from '@/components/UserHoverCard';
import { useI18n } from '@/i18n/context';

interface GitCommit {
  id: string;
  commitSha: string;
  eventType: string;
  summary: string;
  committedAt: string;
  trigger: { id: string; name: string; email: string; avatarUrl: string | null } | null;
}

const EVENT_COLORS: Record<string, string> = {
  create: 'bg-primary/10 text-primary',
  review_started: 'bg-accent text-accent-foreground',
  discussion_resolved: 'bg-success/15 text-success',
  approved: 'bg-success/15 text-success',
  reopened: 'bg-destructive/10 text-destructive',
};

interface CommitListProps {
  documentId: string;
  selectedSha: string | null;
  onSelectCommit: (sha: string) => void;
}

export function CommitList({ documentId, selectedSha, onSelectCommit }: CommitListProps) {
  const { t } = useI18n();

  const eventLabels = useMemo<Record<string, string>>(() => ({
    create: t('history.created'),
    review_started: t('history.reviewStarted'),
    discussion_resolved: t('history.discussionResolved'),
    approved: t('history.approved'),
    reopened: t('history.reopened'),
  }), [t]);

  const { data, isLoading } = useQuery({
    queryKey: ['commits', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/commits`);
      if (!res.ok) throw new Error('Failed to fetch commits');
      return res.json() as Promise<{ data: GitCommit[] }>;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('history.loading')}</p>;

  const commits = data?.data ?? [];
  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('history.noCommits')}</p>;
  }

  return (
    <div className="space-y-1">
      {commits.map((commit) => (
        <button
          key={commit.id}
          type="button"
          onClick={() => onSelectCommit(commit.commitSha)}
          className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
            selectedSha === commit.commitSha ? 'bg-accent' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                EVENT_COLORS[commit.eventType] ?? 'bg-muted text-muted-foreground'
              }`}
            >
              {eventLabels[commit.eventType] ?? commit.eventType}
            </span>
            <span className="truncate font-medium">{commit.summary}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{commit.trigger ? <UserHoverCard user={commit.trigger}>{commit.trigger.name}</UserHoverCard> : t('history.system')}</span>
            <span>·</span>
            <span>{formatDistanceToNow(new Date(commit.committedAt), { addSuffix: true })}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
