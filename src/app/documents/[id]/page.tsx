'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import type { Editor } from '@tiptap/react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/documents/StatusBadge';
import { MemberManager } from '@/components/documents/MemberManager';
import { TiptapEditor } from '@/components/editor/TiptapEditor';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { ModeToggle } from '@/components/editor/ModeToggle';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useEditLock } from '@/hooks/useEditLock';
import type { DocumentStatus } from '@/types';

interface DocumentDetail {
  id: string;
  title: string;
  content: unknown;
  status: DocumentStatus;
  tags: { tag: string }[];
  creator: { id: string; name: string; email: string; avatarUrl: string | null };
  updatedAt: string;
  lockedBy: string | null;
  locker: { id: string; name: string } | null;
}

type EditorMode = 'richtext' | 'markdown';

const saveStatusLabel: Record<string, string> = {
  idle: '',
  saving: 'Saving...',
  saved: 'Saved',
  error: 'Save failed',
};

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = params.id;
  const { data: session } = useSession();

  const { data, isLoading, error } = useQuery({
    queryKey: ['document', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}`);
      if (!res.ok) throw new Error('Failed to fetch document');
      return res.json() as Promise<{ data: DocumentDetail }>;
    },
  });

  const doc = data?.data;
  const isCreator = !!session?.user?.id && !!doc && session.user.id === doc.creator.id;
  const isApproved = doc?.status === 'approved';
  const canEditDoc = !isApproved;

  const { isLocked, lockedByMe, lockedByName, acquiring } = useEditLock({
    documentId,
    enabled: !!doc && canEditDoc,
  });

  const { status: saveStatus, save } = useAutoSave(documentId);

  // Editor state
  const [mode, setMode] = useState<EditorMode>('richtext');
  const editorRef = useRef<Editor | null>(null);
  const [tiptapContent, setTiptapContent] = useState<unknown>(null);
  const [markdownContent, setMarkdownContent] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (doc && !initialized) {
      setTiptapContent(doc.content);
      setInitialized(true);
    }
  }, [doc, initialized]);

  const isEditable = canEditDoc && lockedByMe;
  const isLockedByOther = isLocked && !lockedByMe;

  const handleModeToggle = useCallback(
    (newMode: EditorMode) => {
      if (newMode === mode) return;

      if (newMode === 'markdown') {
        // richtext -> markdown: extract markdown from Tiptap
        const md =
          editorRef.current?.storage.markdown?.getMarkdown?.() ?? '';
        setMarkdownContent(md);
        setMode('markdown');
      } else {
        // markdown -> richtext: feed markdown back into Tiptap
        // We set tiptapContent to the markdown string; Tiptap's Markdown extension
        // will parse it when setContent is called.
        if (editorRef.current) {
          editorRef.current.commands.setContent(markdownContent);
        }
        setMode('richtext');
      }
    },
    [mode, markdownContent],
  );

  if (isLoading) {
    return <p className="text-muted-foreground">Loading document...</p>;
  }

  if (error || !doc) {
    return <p className="text-destructive">Failed to load document.</p>;
  }

  return (
    <div className="flex gap-8">
      <div className="flex-1 space-y-6">
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

        {acquiring && (
          <p className="text-sm text-muted-foreground">Acquiring edit lock...</p>
        )}

        {isLockedByOther && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {lockedByName || 'Someone is currently editing this document.'}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Content</span>
            <div className="flex items-center gap-3">
              {saveStatus !== 'idle' && (
                <span
                  className={`text-xs ${
                    saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  {saveStatusLabel[saveStatus]}
                </span>
              )}
              <ModeToggle mode={mode} onToggle={handleModeToggle} />
            </div>
          </div>

          {mode === 'richtext' ? (
            <TiptapEditor
              content={tiptapContent}
              onUpdate={(json) => save(json)}
              onEditorReady={(editor) => {
                editorRef.current = editor;
              }}
              editable={isEditable}
              documentId={documentId}
              placeholder={
                isApproved
                  ? 'This document is approved and cannot be edited.'
                  : isLockedByOther
                    ? 'This document is locked by another user.'
                    : 'Start writing...'
              }
            />
          ) : (
            <MarkdownEditor
              value={markdownContent}
              onChange={(md) => {
                setMarkdownContent(md);
                save(md);
              }}
              editable={isEditable}
            />
          )}
        </div>
      </div>

      <aside className="w-72 shrink-0 space-y-6">
        <MemberManager documentId={documentId} isCreator={isCreator} />
      </aside>
    </div>
  );
}
