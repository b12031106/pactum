'use client';

import { useState, useRef, useCallback, lazy, Suspense } from 'react';
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
import { ModeToggle } from '@/components/editor/ModeToggle';
import { Textarea } from '@/components/ui/textarea';
import { DiscussionSidebar } from '@/components/discussions/DiscussionSidebar';
import { DocumentDetailSkeleton } from '@/components/ui/LoadingSkeleton';
import { Pencil, Lock, Eye } from 'lucide-react';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useEditLock } from '@/hooks/useEditLock';
import { canCreateDiscussion as checkCanCreateDiscussion, canResolveDiscussion } from '@/lib/permissions';
import { UserHoverCard } from '@/components/UserHoverCard';
import type { DocumentStatus, DocumentRole } from '@/types';

// Lazy load heavy editor components (Tiptap ~200KB, CodeMirror ~150KB, diff2html ~100KB)
const TiptapEditor = lazy(() => import('@/components/editor/TiptapEditor').then(m => ({ default: m.TiptapEditor })));
const MarkdownEditor = lazy(() => import('@/components/editor/MarkdownEditor').then(m => ({ default: m.MarkdownEditor })));
const HistorySidebar = lazy(() => import('@/components/history/HistorySidebar').then(m => ({ default: m.HistorySidebar })));

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
    staleTime: 30_000,
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
  const [contentInitialized, setContentInitialized] = useState(false);
  const [markdownContent, setMarkdownContent] = useState('');

  if (doc && !contentInitialized) {
    setTiptapContent(doc.content);
    setContentInitialized(true);
  }

  // Sidebar state
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('discussions');
  const [newDiscOpen, setNewDiscOpen] = useState(false);
  const [newDiscContent, setNewDiscContent] = useState('');

  const isEditable = canEditDoc && lockedByMe;
  const isLockedByOther = isLocked && !lockedByMe;

  const handleModeToggle = useCallback(
    (newMode: EditorMode) => {
      if (newMode === mode) return;

      if (newMode === 'markdown') {
        const storage = editorRef.current?.storage as unknown as { markdown?: { getMarkdown?: () => string } } | undefined;
        const md = storage?.markdown?.getMarkdown?.() ?? '';
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
    return <DocumentDetailSkeleton />;
  }

  if (error || !doc) {
    return <p className="text-destructive">Failed to load document.</p>;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: Editor */}
      <div className="flex-1 min-w-0 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl font-bold truncate">{doc.title}</h1>
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
            <span><UserHoverCard user={doc.creator}>{doc.creator.name}</UserHoverCard></span>
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
            {isEditable ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 text-success px-2.5 py-0.5 text-xs font-medium">
                <Pencil className="h-3 w-3" />
                Editing
              </span>
            ) : isApproved ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium">
                <Lock className="h-3 w-3" />
                Approved — Read Only
              </span>
            ) : isLockedByOther ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2.5 py-0.5 text-xs font-medium">
                <Lock className="h-3 w-3" />
                Locked by {lockedByName}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium">
                <Eye className="h-3 w-3" />
                View Only
              </span>
            )}
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

          <Suspense fallback={<div className="min-h-[400px] rounded-lg border border-border animate-pulse bg-muted/30" />}>
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
          </Suspense>
        </div>
      </div>

      {/* Right: Sidebar */}
      <div className="w-full lg:w-[350px] lg:shrink-0 lg:border-l lg:pl-4 border-t lg:border-t-0 pt-4 lg:pt-0 space-y-4">
        {/* Tab buttons */}
        <div role="tablist" className="flex gap-1">
          <button
            type="button"
            role="tab"
            id="tab-discussions"
            aria-selected={sidebarTab === 'discussions'}
            aria-controls="panel-discussions"
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
            role="tab"
            id="tab-members"
            aria-selected={sidebarTab === 'members'}
            aria-controls="panel-members"
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
            role="tab"
            id="tab-history"
            aria-selected={sidebarTab === 'history'}
            aria-controls="panel-history"
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
                  <Textarea
                    id="new-disc-content"
                    value={newDiscContent}
                    onChange={(e) => setNewDiscContent(e.target.value)}
                    placeholder="What would you like to discuss?"
                    className="min-h-[100px]"
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
          <div role="tabpanel" id="panel-discussions" aria-labelledby="tab-discussions">
            <DiscussionSidebar
              documentId={documentId}
              canResolve={canResolve}
              currentUserId={session?.user?.id}
            />
          </div>
        )}
        {sidebarTab === 'members' && (
          <div role="tabpanel" id="panel-members" aria-labelledby="tab-members">
            <MemberManager documentId={documentId} isCreator={isCreator} />
          </div>
        )}
        {sidebarTab === 'history' && (
          <div role="tabpanel" id="panel-history" aria-labelledby="tab-history">
            <Suspense fallback={<p className="text-sm text-muted-foreground">Loading history...</p>}>
              <HistorySidebar documentId={documentId} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
