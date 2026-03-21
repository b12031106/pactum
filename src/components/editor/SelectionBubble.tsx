'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { MessageSquarePlus } from 'lucide-react';
import { useI18n } from '@/i18n/context';

interface SelectionBubbleProps {
  editor: Editor | null;
  onCreateDiscussion: (anchor: { from: number; to: number; text: string }) => void;
  enabled: boolean;
}

export function SelectionBubble({ editor, onCreateDiscussion, enabled }: SelectionBubbleProps) {
  const { t } = useI18n();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [selection, setSelection] = useState<{ from: number; to: number; text: string } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor || !enabled) {
      setPos(null);
      setSelection(null);
      return;
    }

    const handleSelectionUpdate = () => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, ' ');

      if (from === to || !text.trim()) {
        setPos(null);
        setSelection(null);
        return;
      }

      // Get the DOM coordinates of the selection
      const view = editor.view;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);

      // Position bubble above the selection, centered
      const centerX = (start.left + end.left) / 2;
      const top = start.top - 8; // 8px above selection

      setPos({ top, left: centerX });
      setSelection({ from, to, text: text.trim() });
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    // Also listen for blur to hide the bubble
    editor.on('blur', () => {
      // Small delay so clicking the bubble works
      setTimeout(() => {
        if (!bubbleRef.current?.matches(':hover')) {
          setPos(null);
          setSelection(null);
        }
      }, 200);
    });

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, enabled]);

  if (!pos || !selection) return null;

  return createPortal(
    <div
      ref={bubbleRef}
      className="fixed z-[9999] -translate-x-1/2 -translate-y-full animate-fade-in"
      style={{ top: pos.top, left: pos.left }}
    >
      <button
        type="button"
        onClick={() => {
          onCreateDiscussion(selection);
          setPos(null);
          setSelection(null);
        }}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        {t('discussions.newDiscussion')}
      </button>
    </div>,
    document.body,
  );
}
