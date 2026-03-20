'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { DiscussionThread, type Discussion } from './DiscussionThread';

type FilterStatus = 'all' | 'open' | 'resolved';

interface DiscussionSidebarProps {
  documentId: string;
  canResolve: boolean;
  currentUserId?: string;
}

export function DiscussionSidebar({
  documentId,
  canResolve,
  currentUserId,
}: DiscussionSidebarProps) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['discussions', documentId, filter],
    queryFn: async () => {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const res = await fetch(`/api/documents/${documentId}/discussions${params}`);
      if (!res.ok) throw new Error('Failed to fetch discussions');
      return res.json() as Promise<{ data: Discussion[] }>;
    },
  });

  const discussions = data?.data ?? [];

  // Count open discussions (always fetch all to get the count)
  const { data: allData } = useQuery({
    queryKey: ['discussions', documentId, 'all'],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/discussions`);
      if (!res.ok) throw new Error('Failed to fetch discussions');
      return res.json() as Promise<{ data: Discussion[] }>;
    },
    enabled: filter !== 'all', // Only fetch separately when we're filtering
  });

  const allDiscussions = filter === 'all' ? discussions : (allData?.data ?? []);
  const openCount = allDiscussions.filter((d) => d.status === 'open').length;

  const filterButtons: { label: string; value: FilterStatus }[] = [
    { label: 'All', value: 'all' },
    { label: 'Open', value: 'open' },
    { label: 'Resolved', value: 'resolved' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Discussions</h3>
        {openCount > 0 && (
          <Badge variant="destructive">{openCount} open</Badge>
        )}
      </div>

      {/* Filter buttons */}
      <div className="flex gap-1" role="group" aria-label="Filter discussions">
        {filterButtons.map((btn) => (
          <button
            key={btn.value}
            type="button"
            aria-pressed={filter === btn.value}
            onClick={() => setFilter(btn.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === btn.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Discussion list */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading discussions...</p>
      ) : discussions.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <p className="text-xs text-muted-foreground">
            {filter === 'all' ? 'No discussions started yet.' : `No ${filter} discussions.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {discussions.map((discussion) => {
            const isExpanded = expandedId === discussion.id;
            const firstComment = discussion.comments[0];
            return (
              <div
                key={discussion.id}
                className="rounded-md border border-border"
              >
                {/* Collapsed header — always visible */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : discussion.id)
                  }
                  aria-expanded={isExpanded}
                  className="flex w-full items-center gap-2 p-2 text-left text-sm hover:bg-muted/50"
                >
                  <span className="flex-1 truncate font-medium">
                    {firstComment?.content.slice(0, 60) ?? 'Discussion'}
                    {(firstComment?.content.length ?? 0) > 60 ? '...' : ''}
                  </span>
                  <Badge
                    variant={
                      discussion.status === 'open' ? 'outline' : 'secondary'
                    }
                  >
                    {discussion.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {discussion._count?.comments ?? discussion.comments.length}
                  </span>
                  <svg className={`size-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 4.5l3 3 3-3" /></svg>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-border p-3 animate-fade-in">
                    <DiscussionThread
                      discussion={discussion}
                      documentId={documentId}
                      canResolve={canResolve}
                      currentUserId={currentUserId}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
