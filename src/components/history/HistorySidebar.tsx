'use client';

import { useState } from 'react';
import { CommitList } from './CommitList';
import { DiffViewer } from './DiffViewer';

interface HistorySidebarProps {
  documentId: string;
}

export function HistorySidebar({ documentId }: HistorySidebarProps) {
  const [selectedSha, setSelectedSha] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {selectedSha ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setSelectedSha(null)}
            className="text-sm text-primary hover:underline"
          >
            &larr; Back to commits
          </button>
          <DiffViewer documentId={documentId} sha={selectedSha} />
        </div>
      ) : (
        <CommitList
          documentId={documentId}
          selectedSha={selectedSha}
          onSelectCommit={setSelectedSha}
        />
      )}
    </div>
  );
}
