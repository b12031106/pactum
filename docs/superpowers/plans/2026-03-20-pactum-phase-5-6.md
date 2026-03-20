# Pactum Phase 5-6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the document state machine (draft → in_review → approved with reopen), document-level sign-off, and the full discussion system (create, comment, resolve with CTA, discussion signoff, git commit on resolve).

**Architecture:** Phase 5 adds three API endpoints (review, reopen, signoff) that orchestrate DB state transitions + git commits. Phase 6 adds discussion CRUD, comment CRUD, resolve/signoff flow with AI summary stub, and a frontend sidebar for discussions.

**Tech Stack:** Prisma transactions, simple-git (via existing GitService), existing permissions.ts, React Query mutations, Tiptap BubbleMenu (for "new discussion" trigger)

**Spec:** `docs/superpowers/specs/2026-03-20-pactum-mvp-design.md` (Sections 6-7)

**Depends on:** Phase 0-4 complete (see `HANDOFF.md`)

---

## File Map

### Phase 5 — Document State Machine + Sign-off
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/app/api/documents/[id]/review/route.ts` | POST: draft → in_review (write .md to git) |
| Create | `src/app/api/documents/[id]/reopen/route.ts` | POST: in_review/approved → draft (clear signoffs, git commit) |
| Create | `src/app/api/documents/[id]/signoff/route.ts` | POST: document signoff (check all signed → auto-approve) |
| Create | `src/app/api/documents/[id]/signoffs/route.ts` | GET: signoff progress list |
| Create | `src/components/documents/SignoffProgress.tsx` | Signoff progress UI (who signed, who pending) |
| Create | `src/components/documents/DocumentActions.tsx` | Action buttons (Submit for Review, Reopen, Sign off) |
| Modify | `src/app/documents/[id]/page.tsx` | Add DocumentActions + SignoffProgress |

### Phase 6 — Discussion System
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/app/api/documents/[id]/discussions/route.ts` | GET list + POST create discussion |
| Create | `src/app/api/discussions/[discussionId]/route.ts` | GET discussion detail with comments |
| Create | `src/app/api/discussions/[discussionId]/comments/route.ts` | POST add comment |
| Create | `src/app/api/discussions/[discussionId]/resolve/route.ts` | POST resolve with CTA |
| Create | `src/app/api/discussions/[discussionId]/signoff/route.ts` | POST discussion signoff |
| Create | `src/components/discussions/DiscussionSidebar.tsx` | Right sidebar with discussion list + filter |
| Create | `src/components/discussions/DiscussionThread.tsx` | Single discussion: comments, resolve, signoff |
| Create | `src/components/discussions/CommentForm.tsx` | Comment input (Markdown) |
| Create | `src/components/discussions/DiscussionSignoff.tsx` | Discussion signoff progress + button |
| Modify | `src/app/documents/[id]/page.tsx` | Add discussion sidebar + tabs |

---

## Task 1: Review API (draft → in_review)

**Files:**
- Create: `src/app/api/documents/[id]/review/route.ts`

- [ ] **Step 1: Implement POST /api/documents/:id/review**

```typescript
// src/app/api/documents/[id]/review/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, canStartReview } from '@/lib/permissions';
import { getDocsGitService } from '@/lib/git';
import { tiptapJsonToMarkdown } from '@/lib/markdown';

export const POST = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: { members: true },
  });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  // Permission check
  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canStartReview(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the creator can start a review');
  }

  // Status check
  if (document.status !== 'draft') {
    throw new ApiError(409, 'INVALID_STATUS', 'Document must be in draft status');
  }

  // Must have at least one approver
  const hasApprover = document.members.some((m) => m.role === 'approver');
  if (!hasApprover) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'At least one approver is required');
  }

  // Convert content to Markdown and write to git
  const markdown = tiptapJsonToMarkdown(document.content);
  const git = getDocsGitService();
  const sha = await git.commitFile(
    document.gitFile,
    markdown,
    `docs: review started - ${document.title}`,
    { name: session.user.name, email: session.user.email },
  );

  // Update status + record commit
  await prisma.$transaction([
    prisma.document.update({
      where: { id },
      data: { status: 'in_review' },
    }),
    prisma.documentGitCommit.create({
      data: {
        documentId: id,
        commitSha: sha,
        eventType: 'review_started',
        summary: `docs: review started - ${document.title}`,
        triggeredBy: session.user.id,
      },
    }),
  ]);

  // TODO(Phase 8): Notify all editor, advisor, approver — notificationService.send(...)
  return NextResponse.json({ data: { status: 'in_review', commitSha: sha } });
});
```

**Note:** All notification calls are deferred to Phase 8 (Notification System). Each endpoint has a `// TODO(Phase 8)` comment marking where notifications should be added. This is intentional — the notification service doesn't exist yet.

- [ ] **Step 2: Run all tests**
```bash
npx vitest run
```

- [ ] **Step 3: Commit**
```bash
git add src/app/api/documents/[id]/review/
git commit -m "feat: add review API — draft to in_review with git commit"
```

---

## Task 2: Reopen API (in_review/approved → draft)

**Files:**
- Create: `src/app/api/documents/[id]/reopen/route.ts`

- [ ] **Step 1: Implement POST /api/documents/:id/reopen**

```typescript
// src/app/api/documents/[id]/reopen/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, canReopen } from '@/lib/permissions';
import { getDocsGitService } from '@/lib/git';

export const POST = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: { discussions: true },
  });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canReopen(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the creator can reopen');
  }

  if (document.status !== 'in_review' && document.status !== 'approved') {
    throw new ApiError(409, 'INVALID_STATUS', 'Can only reopen from in_review or approved');
  }

  const body = await req.json();
  const { reason } = body as { reason: string };
  if (!reason?.trim()) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Reason is required');
  }

  const previousStatus = document.status;

  // DB transaction: clear signoffs + set draft
  const discussionIds = document.discussions.map((d) => d.id);
  await prisma.$transaction([
    prisma.documentSignoff.deleteMany({ where: { documentId: id } }),
    ...(discussionIds.length > 0
      ? [prisma.discussionSignoff.deleteMany({ where: { discussionId: { in: discussionIds } } })]
      : []),
    prisma.document.update({
      where: { id },
      data: { status: 'draft' },
    }),
  ]);

  // Git: append metadata + commit
  const git = getDocsGitService();
  const sha = await git.commitWithMetadata(
    document.gitFile,
    'reopen',
    `docs: reopen - ${document.title} / reason: ${reason.trim()}`,
    { name: session.user.name, email: session.user.email },
    `from: ${previousStatus}\nreopened_by: ${session.user.name} <${session.user.email}>\ntime: ${new Date().toISOString()}`,
  );

  await prisma.documentGitCommit.create({
    data: {
      documentId: id,
      commitSha: sha,
      eventType: 'reopened',
      summary: `docs: reopen - ${document.title} / reason: ${reason.trim()}`,
      triggeredBy: session.user.id,
    },
  });

  // TODO(Phase 8): Notify all editor, approver — notificationService.send(...)
  return NextResponse.json({ data: { status: 'draft', commitSha: sha } });
});
```

- [ ] **Step 2: Commit**
```bash
git add src/app/api/documents/[id]/reopen/
git commit -m "feat: add reopen API — clear signoffs, git commit with reason"
```

---

## Task 3: Document Signoff API + Auto-Approve

**Files:**
- Create: `src/app/api/documents/[id]/signoff/route.ts`
- Create: `src/app/api/documents/[id]/signoffs/route.ts`

- [ ] **Step 1: Implement POST /api/documents/:id/signoff**

```typescript
// src/app/api/documents/[id]/signoff/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, needsSignoff } from '@/lib/permissions';
import { getDocsGitService } from '@/lib/git';

export const POST = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      discussions: { where: { status: 'open' } },
      members: true,
      signoffs: true,
    },
  });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  if (document.status !== 'in_review') {
    throw new ApiError(409, 'INVALID_STATUS', 'Document must be in review');
  }

  // No open discussions
  if (document.discussions.length > 0) {
    throw new ApiError(409, 'OPEN_DISCUSSIONS', `${document.discussions.length} discussion(s) still open`);
  }

  // Permission check
  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!needsSignoff(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'You are not required to sign off');
  }

  // Already signed?
  const alreadySigned = document.signoffs.some((s) => s.userId === session.user.id);
  if (alreadySigned) {
    throw new ApiError(409, 'ALREADY_SIGNED', 'You have already signed off');
  }

  // Get latest commit SHA
  const latestCommit = await prisma.documentGitCommit.findFirst({
    where: { documentId: id },
    orderBy: { committedAt: 'desc' },
  });

  // Insert signoff
  await prisma.documentSignoff.create({
    data: {
      documentId: id,
      userId: session.user.id,
      commitSha: latestCommit?.commitSha || null,
    },
  });

  // Check if all required signers have signed
  const allSignoffs = await prisma.documentSignoff.findMany({ where: { documentId: id } });
  const signedUserIds = new Set(allSignoffs.map((s) => s.userId));

  // Required signers: creator + all editors + all approvers
  const requiredSigners = new Set<string>();
  requiredSigners.add(document.createdBy); // creator always signs
  for (const m of document.members) {
    if (m.role === 'editor' || m.role === 'approver') {
      requiredSigners.add(m.userId);
    }
  }

  const allSigned = [...requiredSigners].every((uid) => signedUserIds.has(uid));

  if (allSigned) {
    // Auto-approve!
    const signerDetails = await prisma.user.findMany({
      where: { id: { in: [...signedUserIds] } },
      select: { id: true, name: true, email: true },
    });
    const signerMap = new Map(signerDetails.map((u) => [u.id, u]));
    const signedByNames = signerDetails.map((u) => u.name).join(', ');
    const commitBody = allSignoffs
      .map((s) => {
        const user = signerMap.get(s.userId);
        return `- ${user?.name || 'Unknown'} (${user?.email || 'unknown'}) — ${s.signedAt.toISOString()}`;
      })
      .join('\n');

    const git = getDocsGitService();
    const sha = await git.commitWithMetadata(
      document.gitFile,
      'approved',
      `docs: approved - ${document.title} / signed by: ${signedByNames}`,
      { name: session.user.name, email: session.user.email },
      `簽署紀錄:\n${commitBody}`,
    );

    await prisma.$transaction([
      prisma.document.update({
        where: { id },
        data: { status: 'approved' },
      }),
      prisma.documentGitCommit.create({
        data: {
          documentId: id,
          commitSha: sha,
          eventType: 'approved',
          summary: `docs: approved - ${document.title} / signed by: ${signedByNames}`,
          triggeredBy: session.user.id,
        },
      }),
    ]);

    // TODO(Phase 8): Notify all document members — notificationService.send(...)
    return NextResponse.json({ data: { signed: true, allSigned: true, status: 'approved' } });
  }

  // TODO(Phase 8): Notify creator "{name} 已完成畫押"
  return NextResponse.json({ data: { signed: true, allSigned: false } });
});
```

- [ ] **Step 2: Implement GET /api/documents/:id/signoffs**

```typescript
// src/app/api/documents/[id]/signoffs/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: { members: true },
  });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  // Build required signers list
  const requiredSigners = new Set<string>();
  requiredSigners.add(document.createdBy);
  for (const m of document.members) {
    if (m.role === 'editor' || m.role === 'approver') {
      requiredSigners.add(m.userId);
    }
  }

  // Get actual signoffs
  const signoffs = await prisma.documentSignoff.findMany({
    where: { documentId: id },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  // Get user details for required signers
  const requiredUsers = await prisma.user.findMany({
    where: { id: { in: [...requiredSigners] } },
    select: { id: true, name: true, email: true, avatarUrl: true },
  });

  const signedUserIds = new Set(signoffs.map((s) => s.userId));

  const progress = requiredUsers.map((user) => ({
    user,
    signed: signedUserIds.has(user.id),
    signedAt: signoffs.find((s) => s.userId === user.id)?.signedAt || null,
  }));

  return NextResponse.json({
    data: {
      progress,
      total: requiredSigners.size,
      signed: signoffs.length,
      allSigned: signoffs.length >= requiredSigners.size,
    },
  });
});
```

- [ ] **Step 3: Run all tests**
```bash
npx vitest run
```

- [ ] **Step 4: Commit**
```bash
git add src/app/api/documents/[id]/signoff/ src/app/api/documents/[id]/signoffs/
git commit -m "feat: add document signoff API with auto-approve on all signed"
```

---

## Task 4: State Machine UI (DocumentActions + SignoffProgress)

**Files:**
- Create: `src/components/documents/DocumentActions.tsx`
- Create: `src/components/documents/SignoffProgress.tsx`
- Modify: `src/app/documents/[id]/page.tsx`

- [ ] **Step 1: Create SignoffProgress component**

A component that:
- Fetches GET `/api/documents/:id/signoffs` via React Query
- Shows progress: "3 / 5 signed"
- Lists each required signer with check (signed) or clock (pending) icon
- Only visible when status is `in_review`

- [ ] **Step 2: Create DocumentActions component**

A component that renders action buttons based on document state and user role:
- `draft` + creator → "Submit for Review" button
- `in_review` + needsSignoff → "Sign Off" button (confirm dialog: "確認畫押後代表您已閱讀並同意此份文件內容，此操作不可撤銷。")
- `in_review`/`approved` + creator → "Reopen" button (with reason input dialog)
- Uses `useMutation` from React Query, invalidates `['document', id]` query on success
- Shows toast on success/error via sonner

Props: `{ documentId, status, isCreator, userRoles, hasOpenDiscussions }`

- [ ] **Step 3: Integrate into document detail page**

Read current `src/app/documents/[id]/page.tsx`, then add:
- `<DocumentActions>` in the header area, next to status badge
- `<SignoffProgress>` below the header when status is `in_review`
- Fetch roles for current user to pass to DocumentActions

- [ ] **Step 4: Run all tests**
```bash
npx vitest run
```

- [ ] **Step 5: Commit**
```bash
git add src/components/documents/DocumentActions.tsx src/components/documents/SignoffProgress.tsx src/app/documents/[id]/page.tsx
git commit -m "feat: add document state machine UI — review, signoff, reopen"
```

---

## Task 5: Discussion CRUD API

**Files:**
- Create: `src/app/api/documents/[id]/discussions/route.ts`
- Create: `src/app/api/discussions/[discussionId]/route.ts`
- Create: `src/app/api/discussions/[discussionId]/comments/route.ts`

- [ ] **Step 1: Create discussions list + create endpoint**

```typescript
// src/app/api/documents/[id]/discussions/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, canCreateDiscussion } from '@/lib/permissions';

// GET: list discussions for a document
export const GET = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status'); // 'open' | 'resolved' | null (all)

  const where: Record<string, unknown> = { documentId: id };
  if (status) where.status = status;

  const discussions = await prisma.discussion.findMany({
    where,
    include: {
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      comments: { orderBy: { createdAt: 'asc' }, take: 1 }, // first comment preview
      signoffs: true,
      _count: { select: { comments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ data: discussions });
});

// POST: create discussion with first comment
export const POST = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canCreateDiscussion(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'You cannot create discussions on this document');
  }

  const body = await req.json();
  const { anchorType, anchorData, content } = body as {
    anchorType: string;
    anchorData: unknown;
    content: string;
    // mentions?: string[] — accepted but notifications deferred to Phase 8/9
  };

  if (!content?.trim()) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Comment content is required');
  }
  if (!['range', 'line'].includes(anchorType)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'anchorType must be range or line');
  }

  const discussion = await prisma.$transaction(async (tx) => {
    const disc = await tx.discussion.create({
      data: {
        documentId: id,
        createdBy: session.user.id,
        anchorType,
        anchorData: anchorData as object,
      },
      include: {
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    await tx.discussionComment.create({
      data: {
        discussionId: disc.id,
        authorId: session.user.id,
        content: content.trim(),
      },
    });

    return disc;
  });

  // TODO(Phase 8): Notify mentions + document creator
  return NextResponse.json({ data: discussion }, { status: 201 });
});
```

- [ ] **Step 2: Create discussion detail endpoint**

```typescript
// src/app/api/discussions/[discussionId]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { discussionId } = await context!.params;

  const discussion = await prisma.discussion.findUnique({
    where: { id: discussionId },
    include: {
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      comments: {
        include: {
          author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      signoffs: {
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      },
    },
  });

  if (!discussion) throw new ApiError(404, 'NOT_FOUND', 'Discussion not found');

  return NextResponse.json({ data: discussion });
});
```

- [ ] **Step 3: Create comments endpoint**

```typescript
// src/app/api/discussions/[discussionId]/comments/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

export const POST = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { discussionId } = await context!.params;

  const discussion = await prisma.discussion.findUnique({ where: { id: discussionId } });
  if (!discussion) throw new ApiError(404, 'NOT_FOUND', 'Discussion not found');
  if (discussion.status === 'resolved') {
    throw new ApiError(409, 'INVALID_STATUS', 'Cannot comment on a resolved discussion');
  }

  const body = await req.json();
  const { content } = body as { content: string };
  if (!content?.trim()) throw new ApiError(422, 'VALIDATION_ERROR', 'Content is required');

  const comment = await prisma.discussionComment.create({
    data: {
      discussionId,
      authorId: session.user.id,
      content: content.trim(),
    },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({ data: comment }, { status: 201 });
});
```

- [ ] **Step 4: Run all tests**
```bash
npx vitest run
```

- [ ] **Step 5: Commit**
```bash
git add src/app/api/documents/[id]/discussions/ src/app/api/discussions/
git commit -m "feat: add discussion CRUD + comment API endpoints"
```

---

## Task 6: Discussion Resolve + Signoff API

**Files:**
- Create: `src/app/api/discussions/[discussionId]/resolve/route.ts`
- Create: `src/app/api/discussions/[discussionId]/signoff/route.ts`

- [ ] **Step 1: Create resolve endpoint**

```typescript
// src/app/api/discussions/[discussionId]/resolve/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, canResolveDiscussion } from '@/lib/permissions';

export const POST = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { discussionId } = await context!.params;

  const discussion = await prisma.discussion.findUnique({
    where: { id: discussionId },
    include: { document: true },
  });
  if (!discussion) throw new ApiError(404, 'NOT_FOUND', 'Discussion not found');
  if (discussion.status !== 'open') {
    throw new ApiError(409, 'INVALID_STATUS', 'Discussion is not open');
  }
  if (discussion.cta) {
    throw new ApiError(409, 'INVALID_STATUS', 'Resolution already initiated');
  }

  const roles = await getDocumentRoles(
    session.user.id,
    discussion.document.createdBy,
    discussion.documentId,
  );
  if (!canResolveDiscussion(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'You cannot resolve this discussion');
  }

  const body = await req.json();
  const { cta } = body as { cta: string };
  if (!['no_change', 'need_change'].includes(cta)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'CTA must be no_change or need_change');
  }

  await prisma.discussion.update({
    where: { id: discussionId },
    data: { cta },
  });

  // TODO(Phase 8): Notify all editor + approver "討論串發起結案投票"
  return NextResponse.json({ data: { cta } });
});
```

- [ ] **Step 2: Create discussion signoff endpoint**

This is the most complex endpoint. On all-signed:
1. Generate resolution summary (MVP: concatenate first comment + CTA — AI integration later)
2. Mark discussion resolved
3. Write latest content to git
4. If no diff, append metadata comment
5. Git commit
6. Record in document_git_commits

```typescript
// src/app/api/discussions/[discussionId]/signoff/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, needsSignoff } from '@/lib/permissions';
import { getDocsGitService } from '@/lib/git';
import { tiptapJsonToMarkdown } from '@/lib/markdown';

export const POST = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { discussionId } = await context!.params;

  const discussion = await prisma.discussion.findUnique({
    where: { id: discussionId },
    include: {
      document: { include: { members: true } },
      comments: { orderBy: { createdAt: 'asc' } },
      signoffs: true,
    },
  });
  if (!discussion) throw new ApiError(404, 'NOT_FOUND', 'Discussion not found');
  if (discussion.status !== 'open') {
    throw new ApiError(409, 'INVALID_STATUS', 'Discussion is not open');
  }
  if (!discussion.cta) {
    throw new ApiError(409, 'INVALID_STATUS', 'Resolution not initiated — call resolve first');
  }

  const roles = await getDocumentRoles(
    session.user.id,
    discussion.document.createdBy,
    discussion.documentId,
  );
  if (!needsSignoff(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'You are not required to sign off');
  }

  const alreadySigned = discussion.signoffs.some((s) => s.userId === session.user.id);
  if (alreadySigned) {
    throw new ApiError(409, 'ALREADY_SIGNED', 'You have already signed off on this discussion');
  }

  // Insert signoff
  await prisma.discussionSignoff.create({
    data: { discussionId, userId: session.user.id },
  });

  // Check if all required signers have signed
  const allSignoffs = await prisma.discussionSignoff.findMany({ where: { discussionId } });
  const signedUserIds = new Set(allSignoffs.map((s) => s.userId));

  const requiredSigners = new Set<string>();
  requiredSigners.add(discussion.document.createdBy);
  for (const m of discussion.document.members) {
    if (m.role === 'editor' || m.role === 'approver') {
      requiredSigners.add(m.userId);
    }
  }

  const allSigned = [...requiredSigners].every((uid) => signedUserIds.has(uid));

  if (!allSigned) {
    return NextResponse.json({ data: { signed: true, allSigned: false } });
  }

  // All signed — resolve discussion
  // Generate resolution summary
  // NOTE: Spec requires LLM API call for AI summary. For now, use a stub that
  // concatenates comments. Replace with actual LLM call when API key is configured.
  // TODO: Call LLM API (e.g. Claude) to summarize discussion thread
  const commentTexts = discussion.comments.map((c) => c.content).join('\n---\n');
  const resolution = `CTA: ${discussion.cta}. Summary: ${commentTexts.substring(0, 500)}`;

  // Update discussion
  await prisma.discussion.update({
    where: { id: discussionId },
    data: {
      status: 'resolved',
      resolution,
      resolvedAt: new Date(),
      resolvedBy: session.user.id,
    },
  });

  // Write content to git
  const doc = discussion.document;
  const git = getDocsGitService();
  const markdown = tiptapJsonToMarkdown(doc.content);
  const currentContent = await git.readFile(doc.gitFile);

  const resolutionShort = resolution.substring(0, 80);
  const signerNames = await prisma.user.findMany({
    where: { id: { in: [...signedUserIds] } },
    select: { name: true, email: true },
  });
  const commitBody = `討論摘要:\n${resolution}\n\nCTA: ${discussion.cta}\n結案人: ${session.user.name}\n畫押確認: ${signerNames.map((u) => u.name).join(', ')}`;

  let sha: string;
  if (currentContent === markdown) {
    // No content change — append metadata comment for valid diff
    sha = await git.commitWithMetadata(
      doc.gitFile,
      'discussion_resolved',
      `docs: discussion resolved - ${doc.title} / ${resolutionShort}`,
      { name: session.user.name, email: session.user.email },
      commitBody,
    );
  } else {
    // Content changed — write new content
    sha = await git.commitFile(
      doc.gitFile,
      markdown,
      `docs: discussion resolved - ${doc.title} / ${resolutionShort}`,
      { name: session.user.name, email: session.user.email },
      commitBody,
    );
  }

  await prisma.documentGitCommit.create({
    data: {
      documentId: doc.id,
      commitSha: sha,
      eventType: 'discussion_resolved',
      summary: `docs: discussion resolved - ${doc.title} / ${resolutionShort}`,
      triggeredBy: session.user.id,
    },
  });

  // Check if ALL discussions are now resolved
  const openDiscussions = await prisma.discussion.count({
    where: { documentId: doc.id, status: 'open' },
  });

  // TODO(Phase 8): Notify creator "討論串全員畫押完成"
  // TODO(Phase 8): If allDiscussionsResolved, notify creator "可發起文件畫押"
  return NextResponse.json({
    data: { signed: true, allSigned: true, resolved: true, allDiscussionsResolved: openDiscussions === 0 },
  });
});
```

- [ ] **Step 3: Run all tests**
```bash
npx vitest run
```

- [ ] **Step 4: Commit**
```bash
git add src/app/api/discussions/[discussionId]/resolve/ src/app/api/discussions/[discussionId]/signoff/
git commit -m "feat: add discussion resolve + signoff API with git commit"
```

---

## Task 7: Discussion Sidebar UI

**Files:**
- Create: `src/components/discussions/DiscussionSidebar.tsx`
- Create: `src/components/discussions/DiscussionThread.tsx`
- Create: `src/components/discussions/CommentForm.tsx`
- Create: `src/components/discussions/DiscussionSignoff.tsx`

- [ ] **Step 1: Create CommentForm**

A textarea + submit button for adding comments to a discussion. Uses `useMutation` to POST to `/api/discussions/:id/comments`. Invalidates the discussion query on success.

- [ ] **Step 2: Create DiscussionSignoff**

Shows signoff progress for a discussion (who signed, who pending). Shows "Sign off" button if current user hasn't signed. Only visible when `cta` is set. Uses React Query.

- [ ] **Step 3: Create DiscussionThread**

Shows a single discussion:
- Anchor info (range/line)
- All comments in chronological order
- CommentForm at bottom (if discussion is open)
- "Resolve" button with CTA dropdown (no_change / need_change) — only for users with `canResolveDiscussion`
- DiscussionSignoff (if CTA is set)
- Status indicator (open / resolved)

- [ ] **Step 4: Create DiscussionSidebar**

Shows all discussions for a document:
- Tab/filter: Open / Resolved / All
- List of DiscussionThread components
- "N open discussions" count hint
- Collapsible threads (click to expand)

- [ ] **Step 5: Commit**
```bash
git add src/components/discussions/
git commit -m "feat: add discussion sidebar with threads, comments, and signoff UI"
```

---

## Task 8: Integrate Discussions into Document Page

**Files:**
- Modify: `src/app/documents/[id]/page.tsx`

- [ ] **Step 1: Read current page.tsx**

Understand the current layout structure with editor, member manager, lock status, etc.

- [ ] **Step 2: Add right sidebar with tab switching**

Add a right sidebar (or collapsible panel) with two tabs:
- **Discussions**: `<DiscussionSidebar documentId={id} />`
- **Members**: Move existing `<MemberManager>` here

Layout should be: Editor (left, flex-1) | Sidebar (right, fixed width ~350px)

- [ ] **Step 3: Add "New Discussion" button**

When user selects text in the editor and the document is in `in_review` status, show a floating button or action to create a new discussion. The simplest approach: a "New Discussion" button above the editor that opens a dialog asking for the comment content. Anchor data can be hardcoded as `{ lineNumber: 0 }` for now (proper text selection anchoring is complex and can be refined later).

- [ ] **Step 4: Show open discussion count in header**

If there are open discussions, show a warning: "N 個討論未結案" near the signoff button.

- [ ] **Step 5: Run all tests**
```bash
npx vitest run
```

- [ ] **Step 6: Commit**
```bash
git add src/app/documents/[id]/page.tsx
git commit -m "feat: integrate discussion sidebar into document page"
```

---

## Task 9: Update HANDOFF.md

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Update HANDOFF.md**

Update Phase Progress:
- Phase 5: ✅ Done — review/reopen/signoff API, auto-approve, state machine UI
- Phase 6: ✅ Done — discussion CRUD, comments, resolve/signoff, sidebar UI

Update Current State, Key Files, Next Step (Phase 7: Git Diff Viewer).

- [ ] **Step 2: Run all tests**
```bash
npx vitest run
```

- [ ] **Step 3: Commit**
```bash
git add HANDOFF.md
git commit -m "docs: update HANDOFF.md — Phase 5-6 complete"
```
