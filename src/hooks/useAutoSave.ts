'use client';
import { useState, useCallback } from 'react';
import { useDebouncedCallback } from './useDebounce';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useAutoSave(documentId: string) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const save = useCallback(async (content: unknown) => {
    setStatus('saving');
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('Save failed');
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }, [documentId]);
  const debouncedSave = useDebouncedCallback(save, 2000);
  return { status, save: debouncedSave, saveImmediate: save };
}
