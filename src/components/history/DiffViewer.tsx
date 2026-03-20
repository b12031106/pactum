'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { html as diffHtml, parse as diffParse } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';

interface DiffViewerProps {
  documentId: string;
  sha: string;
}

type DiffStyle = 'line-by-line' | 'side-by-side';

export function DiffViewer({ documentId, sha }: DiffViewerProps) {
  const [style, setStyle] = useState<DiffStyle>('line-by-line');

  const { data, isLoading, error } = useQuery({
    queryKey: ['diff', documentId, sha],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/diff/${sha}`);
      if (!res.ok) throw new Error('Failed to fetch diff');
      return res.json() as Promise<{
        data: { sha: string; diff: string; summary: string; eventType: string };
      }>;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading diff...</p>;
  if (error) return <p className="text-sm text-destructive">Failed to load diff.</p>;

  const diffData = data?.data;
  if (!diffData?.diff) {
    return <p className="text-sm text-muted-foreground">No changes in this commit (metadata only).</p>;
  }

  const parsed = diffParse(diffData.diff);
  const rendered = diffHtml(parsed, {
    outputFormat: style,
    drawFileList: false,
    matching: 'lines',
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium truncate">{diffData.summary}</p>
        <div className="flex gap-1" role="group" aria-label="Diff view style">
          <button
            type="button"
            aria-pressed={style === 'line-by-line'}
            onClick={() => setStyle('line-by-line')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              style === 'line-by-line'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Unified
          </button>
          <button
            type="button"
            aria-pressed={style === 'side-by-side'}
            onClick={() => setStyle('side-by-side')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              style === 'side-by-side'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Side by Side
          </button>
        </div>
      </div>
      <div
        className="overflow-auto rounded border text-sm"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </div>
  );
}
