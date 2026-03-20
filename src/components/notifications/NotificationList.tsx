'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

interface NotificationItem {
  id: string;
  type: string;
  payload: { message?: string; [key: string]: unknown };
  isRead: boolean;
  createdAt: string;
  document: { id: string; title: string } | null;
}

interface NotificationListProps {
  onNavigate?: (documentId: string) => void;
}

export function NotificationList({ onNavigate }: NotificationListProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?pageSize=30');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json() as Promise<{ data: NotificationItem[] }>;
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading...</p>;

  const notifications = data?.data ?? [];
  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center py-6 text-center px-4">
        <p className="text-sm text-muted-foreground">You&apos;re all caught up!</p>
      </div>
    );
  }

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="max-h-96 overflow-y-auto">
      {hasUnread && (
        <div className="border-b px-4 py-2">
          <button
            type="button"
            onClick={() => markAllReadMutation.mutate()}
            className="text-xs text-primary hover:underline"
          >
            Mark all as read
          </button>
        </div>
      )}
      {notifications.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => {
            if (!n.isRead) markReadMutation.mutate([n.id]);
            if (n.document?.id && onNavigate) onNavigate(n.document.id);
          }}
          className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-accent transition-colors ${
            n.isRead ? 'opacity-60' : ''
          }`}
        >
          <p className="text-sm">
            {!n.isRead && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" />}
            {n.payload.message ?? n.type}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
          </p>
        </button>
      ))}
    </div>
  );
}
