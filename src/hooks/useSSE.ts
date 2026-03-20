'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

const NOTIFICATION_MESSAGES: Record<string, (payload: Record<string, unknown>) => string> = {
  review_started: (p) => `${p.actorName} submitted "${p.documentTitle}" for review`,
  document_signed: (p) => `${p.actorName} signed off on "${p.documentTitle}"`,
  document_approved: (p) => `"${p.documentTitle}" has been approved`,
  discussion_resolve_started: (p) => `${p.actorName} initiated discussion resolution`,
  discussion_resolved: (p) => `Discussion resolved in "${p.documentTitle}"`,
  all_discussions_resolved: (p) => `All discussions resolved in "${p.documentTitle}"`,
  comment_added: (p) => `${p.actorName} commented in "${p.documentTitle}"`,
  mentioned: (p) => `${p.actorName} mentioned you in "${p.documentTitle}"`,
};

export function useSSE() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    const es = new EventSource('/api/notifications/stream');
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;

        // Invalidate notification queries
        queryClient.invalidateQueries({ queryKey: ['notifications'] });

        // Invalidate document-specific queries
        if (data.documentId) {
          queryClient.invalidateQueries({ queryKey: ['document', data.documentId] });
          queryClient.invalidateQueries({ queryKey: ['discussions', data.documentId] });
          queryClient.invalidateQueries({ queryKey: ['commits', data.documentId] });
          queryClient.invalidateQueries({ queryKey: ['signoffs', data.documentId] });
        }

        // Show toast
        const payload = data.payload as Record<string, unknown>;
        const getMessage = NOTIFICATION_MESSAGES[data.type];
        const message = getMessage ? getMessage(payload) : (payload.message as string);
        if (message) {
          toast.info(message);
        }
      } catch {
        // Ignore parse errors (heartbeat, etc.)
      }
    };

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [session?.user?.id, queryClient]);
}
