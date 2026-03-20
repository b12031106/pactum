'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/documents/StatusBadge';
import { useAutoSave } from '@/hooks/useAutoSave';
import type { DocumentStatus } from '@/types';

interface DocumentDetail {
  id: string;
  title: string;
  content: unknown;
  status: DocumentStatus;
  tags: { tag: string }[];
  creator: { id: string; name: string; email: string; avatarUrl: string | null };
  updatedAt: string;
}

const saveStatusLabel: Record<string, string> = {
  idle: '',
  saving: 'Saving...',
  saved: 'Saved',
  error: 'Save failed',
};

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['document', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}`);
      if (!res.ok) throw new Error('Failed to fetch document');
      return res.json() as Promise<{ data: DocumentDetail }>;
    },
  });

  const { status: saveStatus, save } = useAutoSave(documentId);
  const [content, setContent] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data?.data && !initialized) {
      const raw = data.data.content;
      setContent(typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
      setInitialized(true);
    }
  }, [data, initialized]);

  const handleChange = (value: string) => {
    setContent(value);
    save(value);
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Loading document...</p>;
  }

  if (error || !data?.data) {
    return <p className="text-destructive">Failed to load document.</p>;
  }

  const doc = data.data;
  const isApproved = doc.status === 'approved';

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{doc.title}</h1>
          <StatusBadge status={doc.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{doc.creator.name}</span>
          {doc.tags.map(({ tag }) => (
            <Badge key={tag} variant="ghost">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Content</span>
          {saveStatus !== 'idle' && (
            <span
              className={`text-xs ${
                saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {saveStatusLabel[saveStatus]}
            </span>
          )}
        </div>
        <textarea
          className="min-h-[400px] w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isApproved}
          placeholder={isApproved ? 'This document is approved and cannot be edited.' : 'Start writing...'}
        />
      </div>
    </div>
  );
}
