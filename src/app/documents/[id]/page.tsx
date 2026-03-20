'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import type { Editor } from '@tiptap/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/documents/StatusBadge';
import { MemberManager } from '@/components/documents/MemberManager';
import { DocumentActions } from '@/components/documents/DocumentActions';
import { SignoffProgress } from '@/components/documents/SignoffProgress';
import { TiptapEditor } from '@/components/editor/TiptapEditor';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { ModeToggle } from '@/components/editor/ModeToggle';
import { DiscussionSidebar } from '@/components/discussions/DiscussionSidebar';
import { HistorySidebar } from '@/components/history/HistorySidebar';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useEditLock } from '@/hooks/useEditLock';
import { canCreateDiscussion as checkCanCreateDiscussion, canResolveDiscussion } from '@/lib/permissions';
import type { DocumentStatus, DocumentRole } from '@/types';

interface DocumentMember {
  id: string;
  documentId: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

interface DocumentDetail {
  id: string;
  title: string;
  content: unknown;
  status: DocumentStatus;
  tags: { tag: string }[];
  creator: { id: string; name: string; email: string; avatarUrl: string | null };
  members: DocumentMember[];
  updatedAt: string;
  lockedBy: string | null;
  locker: { id: string; name: string } | null;
}

interface DiscussionListItem {
  id: string;
  status: string;
}

type EditorMode = 'richtext' | 'markdown';
type SidebarTab = 'discussions' | 'members' | 'history';

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
  const queryClient = useQueryClient();

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
  const userRoles: DocumentRole[] = (() => {
    if (!session?.user?.id || !doc) return ['viewer'];
    if (isCreator) return ['creator'];
    const memberRoles = doc.members
      .filter((m) => m.userId === session.user.id)
      .map((m) => m.role as DocumentRole);
    return memberRoles.length > 0 ? memberRoles : ['viewer'];
  })();
  const isApproved = doc?.status === 'approved';
  const canEditDoc = !isApproved;
  const canResolve = canResolveDiscussion(userRoles);
  const canCreateDisc = checkCanCreateDiscussion(userRoles);

  // Fetch discussions to get open count
  const { data: discussionsData } = useQuery({
    queryKey: ['discussions', documentId, 'all'],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/discussions`);
      if (!res.ok) throw new Error('Failed to fetch discussions');
      return res.json() as Promise<{ data: DiscussionListItem[] }>;
    },
    enabled: !!doc,
  });

  const openDiscussionCount = (discussionsData?.data ?? []).filter(
    (d) => d.status === 'open',
  ).length;
  const hasOpenDiscussions = openDiscussionCount > 0;

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

  // Sidebar state
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('discussions');
  const [newDiscOpen, setNewDiscOpen] = useState(false);
  const [newDiscContent, setNewDiscContent] = useState('');

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
        const md =
          editorRef.current?.storage.markdown?.getMarkdown?.() ?? '';
        setMarkdownContent(md);
        setMode('markdown');
      } else {
        if (editorRef.current) {
          editorRef.current.commands.setContent(markdownContent);
        }
        setMode('richtext');
      }
    },
    [mode, markdownContent],
  );

  // New discussion mutation
  const createDiscussionMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/documents/${documentId}/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorType: 'line',
          anchorData: { lineNumber: 0 },
          content,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || 'Failed to create discussion');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Discussion created');
      setNewDiscOpen(false);
      setNewDiscContent('');
      queryClient.invalidateQueries({ queryKey: ['discussions', documentId] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading document...</p>;
  }

  if (error || !doc) {
    return <p className="text-destructive">Failed to load document.</p>;
  }

  return (
    <div className="flex gap-6">
      {/* Left: Editor */}
      <div className="flex-1 min-w-0 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{doc.title}</h1>
            <StatusBadge status={doc.status} />
            <DocumentActions
              documentId={documentId}
              status={doc.status}
              isCreator={isCreator}
              userRoles={userRoles}
              hasOpenDiscussions={hasOpenDiscussions}
            />
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

        {doc.status === 'in_review' && (
          <SignoffProgress documentId={documentId} />
        )}

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

      {/* Right: Sidebar */}
      <div className="w-[350px] shrink-0 border-l pl-4 space-y-4">
        {/* Tab buttons */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setSidebarTab('discussions')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              sidebarTab === 'discussions'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Discussions
            {hasOpenDiscussions && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive/20 px-1 text-[10px] font-bold text-destructive">
                {openDiscussionCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('members')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              sidebarTab === 'members'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Members
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('history')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              sidebarTab === 'history'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            History
          </button>
        </div>

        {/* New Discussion button */}
        {sidebarTab === 'discussions' &&
          doc.status === 'in_review' &&
          canCreateDisc && (
            <Dialog
              open={newDiscOpen}
              onOpenChange={(open) => {
                setNewDiscOpen(open);
                if (!open) setNewDiscContent('');
              }}
            >
              <DialogTrigger render={<Button size="sm" className="w-full" />}>
                New Discussion
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Discussion</DialogTitle>
                  <DialogDescription>
                    Start a new discussion about this document.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <label htmlFor="new-disc-content" className="text-sm font-medium">
                    Comment
                  </label>
                  <textarea
                    id="new-disc-content"
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-h-[100px]"
                    value={newDiscContent}
                    onChange={(e) => setNewDiscContent(e.target.value)}
                    placeholder="What would you like to discuss?"
                  />
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <Button
                    onClick={() => createDiscussionMutation.mutate(newDiscContent.trim())}
                    disabled={
                      createDiscussionMutation.isPending || !newDiscContent.trim()
                    }
                  >
                    {createDiscussionMutation.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

        {/* Tab content */}
        {sidebarTab === 'discussions' && (
          <DiscussionSidebar
            documentId={documentId}
            canResolve={canResolve}
            currentUserId={session?.user?.id}
          />
        )}
        {sidebarTab === 'members' && (
          <MemberManager documentId={documentId} isCreator={isCreator} />
        )}
        {sidebarTab === 'history' && (
          <HistorySidebar documentId={documentId} />
        )}
      </div>
    </div>
  );
}
