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
import { MentionTextarea, type MentionTextareaRef } from '@/components/discussions/MentionTextarea';
import { DiscussionSidebar } from '@/components/discussions/DiscussionSidebar';
import { SelectionBubble } from '@/components/editor/SelectionBubble';
import { DocumentDetailSkeleton } from '@/components/ui/LoadingSkeleton';
import { Pencil, Lock, Eye } from 'lucide-react';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useEditLock } from '@/hooks/useEditLock';
import { canCreateDiscussion as checkCanCreateDiscussion, canResolveDiscussion } from '@/lib/permissions';
import { UserHoverCard } from '@/components/UserHoverCard';
import { useI18n } from '@/i18n/context';
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
  cta: string | null;
  anchorType: string;
  anchorData: Record<string, unknown>;
}

type EditorMode = 'richtext' | 'markdown';
type SidebarTab = 'discussions' | 'members' | 'history';

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = params.id;
  const { data: session } = useSession();
  const { t } = useI18n();
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

  // Match backend logic: in_review requires at least one need_change discussion to edit
  const hasNeedChange = (discussionsData?.data ?? []).some(
    (d) => d.status === 'open' && d.cta === 'need_change',
  );
  const canEditDoc = !isApproved && (doc?.status !== 'in_review' || hasNeedChange);

  // Build anchor highlights for editor
  const discussionAnchors = (discussionsData?.data ?? [])
    .filter((d) => d.anchorType === 'range' && d.anchorData?.from != null && d.anchorData?.to != null)
    .map((d) => ({
      discussionId: d.id,
      from: d.anchorData.from as number,
      to: d.anchorData.to as number,
      status: d.status,
    }));

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('discussions');
  const [newDiscOpen, setNewDiscOpen] = useState(false);
  const [newDiscContent, setNewDiscContent] = useState('');
  const [newDiscMentionVisible, setNewDiscMentionVisible] = useState(false);
  const newDiscMentionRef = useRef<MentionTextareaRef>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<{ from: number; to: number; text: string } | null>(null);
  const [activeDiscussionId, setActiveDiscussionId] = useState<string | null>(null);

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
    mutationFn: async ({ content, anchor }: { content: string; anchor?: { from: number; to: number; text: string } }) => {
      const mentions = newDiscMentionRef.current?.getMentions() ?? [];
      const res = await fetch(`/api/documents/${documentId}/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorType: anchor ? 'range' : 'line',
          anchorData: anchor ? { from: anchor.from, to: anchor.to, text: anchor.text } : { lineNumber: 0 },
          content,
          mentions,
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
      setSelectionAnchor(null);
      newDiscMentionRef.current?.reset();
      queryClient.invalidateQueries({ queryKey: ['discussions', documentId] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSelectionDiscussion = useCallback((anchor: { from: number; to: number; text: string }) => {
    setSelectionAnchor(anchor);
    setNewDiscOpen(true);
    setSidebarTab('discussions');
  }, []);

  const handleHighlightClick = useCallback((discussionId: string) => {
    setSidebarTab('discussions');
    setActiveDiscussionId(discussionId);
  }, []);

  const handleLocateAnchor = useCallback((from: number) => {
    if (editorRef.current) {
      editorRef.current.commands.focus();
      editorRef.current.commands.setTextSelection(from);
      // Scroll the selection into view
      const view = editorRef.current.view;
      const coords = view.coordsAtPos(from);
      window.scrollTo({ top: window.scrollY + coords.top - 120, behavior: 'smooth' });
    }
  }, []);

  if (isLoading) {
    return <DocumentDetailSkeleton />;
  }

  if (error || !doc) {
    return <p className="text-destructive">{t('document.loadFailed')}</p>;
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
          <p className="text-sm text-muted-foreground">{t('document.acquiringLock')}</p>
        )}

        {isLockedByOther && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {t('document.lockedByOther', { name: lockedByName || 'Someone' })}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            {isEditable ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 text-success px-2.5 py-0.5 text-xs font-medium">
                <Pencil className="h-3 w-3" />
                {t('document.editing')}
              </span>
            ) : isApproved ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium">
                <Lock className="h-3 w-3" />
                {t('document.approvedReadOnly')}
              </span>
            ) : doc.status === 'in_review' && !canEditDoc ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium">
                <Lock className="h-3 w-3" />
                {t('document.inReviewReadOnly')}
              </span>
            ) : isLockedByOther ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2.5 py-0.5 text-xs font-medium">
                <Lock className="h-3 w-3" />
                {t('document.lockedBy', { name: lockedByName || '' })}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium">
                <Eye className="h-3 w-3" />
                {t('document.viewOnly')}
              </span>
            )}
            <div className="flex items-center gap-3">
              {saveStatus !== 'idle' && (
                <span
                  className={`text-xs ${
                    saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  {saveStatus === 'saving' ? t('save.saving') : saveStatus === 'saved' ? t('save.saved') : saveStatus === 'error' ? t('save.failed') : ''}
                </span>
              )}
              <ModeToggle mode={mode} onToggle={handleModeToggle} />
            </div>
          </div>

          <Suspense fallback={<div className="min-h-[400px] rounded-lg border border-border animate-pulse bg-muted/30" />}>
            {mode === 'richtext' ? (
              <>
                <TiptapEditor
                  content={tiptapContent}
                  onUpdate={(json) => save(json)}
                  onEditorReady={(editor) => {
                    editorRef.current = editor;
                  }}
                  editable={isEditable}
                  documentId={documentId}
                  discussionAnchors={discussionAnchors}
                  onDiscussionClick={handleHighlightClick}
                  placeholder={
                    isApproved
                      ? t('document.placeholderApproved')
                      : isLockedByOther
                        ? t('document.placeholderLocked')
                        : t('document.placeholderStart')
                  }
                />
                {canCreateDisc && (
                  <SelectionBubble
                    editor={editorRef.current}
                    onCreateDiscussion={handleSelectionDiscussion}
                    enabled={mode === 'richtext'}
                  />
                )}
              </>
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

      {/* Sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 items-center justify-center w-6 h-12 rounded-l-md bg-muted border border-r-0 border-border hover:bg-accent transition-colors"
        aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        <svg className={`h-4 w-4 text-muted-foreground transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
      </button>

      {/* Right: Sidebar */}
      {sidebarOpen && (
      <div className="w-full lg:w-[350px] lg:shrink-0 lg:border-l lg:pl-4 border-t lg:border-t-0 pt-4 lg:pt-0 space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
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
            {t('discussions.title')}
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
            {t('members.title')}
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
            {t('history.title')}
          </button>
        </div>

        {/* New Discussion button */}
        {sidebarTab === 'discussions' &&
          canCreateDisc && (
            <Dialog
              open={newDiscOpen}
              onOpenChange={(open) => {
                setNewDiscOpen(open);
                if (!open) {
                  setNewDiscContent('');
                  setSelectionAnchor(null);
                }
              }}
            >
              <DialogTrigger render={<Button size="sm" className="w-full" />}>
                {t('discussions.newDiscussion')}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('discussions.newDiscussion')}</DialogTitle>
                  <DialogDescription>
                    {t('discussions.newDiscussionDesc')}
                  </DialogDescription>
                </DialogHeader>
                {selectionAnchor && (
                  <div className="rounded-md border-l-2 border-primary/30 bg-muted/50 px-3 py-2 text-sm italic text-muted-foreground">
                    &ldquo;{selectionAnchor.text.length > 120 ? selectionAnchor.text.slice(0, 117) + '...' : selectionAnchor.text}&rdquo;
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="new-disc-content" className="text-sm font-medium">
                    {t('discussions.commentLabel')}
                  </label>
                  <MentionTextarea
                    ref={newDiscMentionRef}
                    id="new-disc-content"
                    documentId={documentId}
                    value={newDiscContent}
                    onChange={setNewDiscContent}
                    placeholder={t('discussions.commentPlaceholder')}
                    className="min-h-[100px]"
                    onMentionVisibleChange={setNewDiscMentionVisible}
                  />
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    {t('actions.cancel')}
                  </DialogClose>
                  <Button
                    onClick={() => createDiscussionMutation.mutate({ content: newDiscContent.trim(), anchor: selectionAnchor ?? undefined })}
                    disabled={
                      createDiscussionMutation.isPending || !newDiscContent.trim()
                    }
                  >
                    {createDiscussionMutation.isPending ? t('discussions.creating') : t('discussions.create')}
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
              members={[doc.creator, ...doc.members.map((m) => m.user)]}
              activeDiscussionId={activeDiscussionId}
              onActiveDiscussionHandled={() => setActiveDiscussionId(null)}
              onLocateAnchor={handleLocateAnchor}
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
            <Suspense fallback={<p className="text-sm text-muted-foreground">{t('history.loading')}</p>}>
              <HistorySidebar documentId={documentId} />
            </Suspense>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
