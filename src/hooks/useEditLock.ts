'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

interface EditLockState {
  isLocked: boolean;
  lockedByMe: boolean;
  lockedByName: string | null;
  acquiring: boolean;
}

interface UseEditLockOptions {
  documentId: string;
  enabled: boolean;
}

export function useEditLock({ documentId, enabled }: UseEditLockOptions) {
  const [state, setState] = useState<EditLockState>({
    isLocked: false,
    lockedByMe: false,
    lockedByName: null,
    acquiring: false,
  });
  const acquiredRef = useRef(false);

  const acquire = useCallback(async () => {
    setState((prev) => ({ ...prev, acquiring: true }));
    try {
      const res = await fetch(`/api/documents/${documentId}/lock`, {
        method: 'POST',
      });
      if (res.ok) {
        acquiredRef.current = true;
        setState({ isLocked: true, lockedByMe: true, lockedByName: null, acquiring: false });
        return true;
      }
      if (res.status === 409) {
        const body = await res.json();
        const message = body?.error?.message || 'Someone is currently editing';
        setState({
          isLocked: true,
          lockedByMe: false,
          lockedByName: message,
          acquiring: false,
        });
        return false;
      }
      setState((prev) => ({ ...prev, acquiring: false }));
      return false;
    } catch {
      setState((prev) => ({ ...prev, acquiring: false }));
      return false;
    }
  }, [documentId]);

  const release = useCallback(async () => {
    if (!acquiredRef.current) return;
    try {
      await fetch(`/api/documents/${documentId}/lock`, {
        method: 'DELETE',
      });
    } catch {
      // best effort
    }
    acquiredRef.current = false;
    setState({ isLocked: false, lockedByMe: false, lockedByName: null, acquiring: false });
  }, [documentId]);

  const releaseSync = useCallback(() => {
    if (!acquiredRef.current) return;
    fetch(`/api/documents/${documentId}/lock`, {
      method: 'DELETE',
      keepalive: true,
    });
    acquiredRef.current = false;
  }, [documentId]);

  useEffect(() => {
    if (!enabled) return;
    acquire();

    const handleBeforeUnload = () => {
      releaseSync();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Release on unmount
      if (acquiredRef.current) {
        fetch(`/api/documents/${documentId}/lock`, {
          method: 'DELETE',
          keepalive: true,
        });
        acquiredRef.current = false;
      }
    };
  }, [enabled, acquire, releaseSync, documentId]);

  return { ...state, acquire, release };
}
