# Pactum Phase 7-9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Git diff viewer (commit history + inline diff), real-time notification system (SSE + email + Slack), @mention autocomplete, and UI polish.

**Architecture:** Phase 7 adds two API endpoints (commits list, diff by SHA) and a History sidebar tab with diff2html rendering. Phase 8 adds a notification dispatch service that fans out to DB/SSE/email/Slack, plus a frontend SSE hook and notification bell. Phase 9 adds @mention autocomplete in comment forms and UI polish (loading states, error boundaries, responsive design).

**Tech Stack:** diff2html (diff rendering), nodemailer (email), EventSource/SSE, React Query, existing GitService + Prisma + permissions

**Spec:** `docs/superpowers/specs/2026-03-20-pactum-mvp-design.md` (Sections 7-8)

**Depends on:** Phase 0-6 complete (see `HANDOFF.md`)

---

## File Map

### Phase 7 — Git Diff Viewer
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/app/api/documents/[id]/commits/route.ts` | GET: list git commits from DocumentGitCommit table |
| Create | `src/app/api/documents/[id]/diff/[sha]/route.ts` | GET: unified diff for a commit SHA |
| Create | `src/components/history/CommitList.tsx` | Commit history list with author, date, event type badge |
| Create | `src/components/history/DiffViewer.tsx` | Renders diff via diff2html (side-by-side / unified toggle) |
| Create | `src/components/history/HistorySidebar.tsx` | Container: CommitList + DiffViewer |
| Modify | `src/app/documents/[id]/page.tsx` | Add "History" sidebar tab |

### Phase 8 — Notification System
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/sse.ts` | In-memory SSE connection registry + push helper |
| Create | `src/lib/notifications.ts` | `sendNotification()` — DB insert + SSE push + email + slack |
| Create | `src/lib/email.ts` | Nodemailer SMTP send (async fire-and-forget) |
| Create | `src/lib/slack.ts` | Per-user Incoming Webhook POST |
| Create | `src/app/api/notifications/route.ts` | GET: list notifications + PATCH: mark read |
| Create | `src/app/api/notifications/stream/route.ts` | GET: SSE stream endpoint |
| Create | `src/app/api/users/me/route.ts` | GET + PATCH: notification prefs + slack webhook |
| Create | `src/hooks/useSSE.ts` | EventSource hook — invalidate queries + show toast |
| Create | `src/components/notifications/NotificationBell.tsx` | Header bell icon with unread count + dropdown |
| Create | `src/components/notifications/NotificationList.tsx` | Notification list with mark-read |
| Create | `src/app/settings/page.tsx` | User settings page (notification prefs) |
| Modify | `src/components/layout/Header.tsx` | Add NotificationBell |
| Modify | `src/app/api/documents/[id]/review/route.ts` | Add notification trigger |
| Modify | `src/app/api/documents/[id]/signoff/route.ts` | Add notification trigger |
| Modify | `src/app/api/discussions/[discussionId]/resolve/route.ts` | Add notification trigger |
| Modify | `src/app/api/discussions/[discussionId]/signoff/route.ts` | Add notification trigger |
| Modify | `src/app/api/documents/[id]/discussions/route.ts` | Add mention notification on create |

### Phase 9 — @Mention + UI Polish
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/app/api/documents/[id]/members/search/route.ts` | GET: search members for autocomplete |
| Create | `src/components/discussions/MentionSuggestion.tsx` | @mention autocomplete dropdown |
| Modify | `src/components/discussions/CommentForm.tsx` | Integrate MentionSuggestion |
| Modify | `src/app/api/discussions/[discussionId]/comments/route.ts` | Parse mentions, trigger notifications |
| Create | `src/components/ui/LoadingSkeleton.tsx` | Reusable loading skeleton |
| Modify | `src/app/documents/[id]/page.tsx` | Loading skeleton, error boundary |
| Modify | `src/components/documents/DocumentList.tsx` | Loading skeleton, empty state |
| Modify | `src/app/layout.tsx` | Error boundary wrapper |

---

## Task 1: Install diff2html + Create Commits API

**Files:**
- Create: `src/app/api/documents/[id]/commits/route.ts`

- [ ] **Step 1: Install diff2html**

```bash
npm install diff2html
```

- [ ] **Step 2: Implement GET /api/documents/:id/commits**

```typescript
// src/app/api/documents/[id]/commits/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const commits = await prisma.documentGitCommit.findMany({
    where: { documentId: id },
    orderBy: { committedAt: 'desc' },
    include: {
      trigger: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({ data: commits });
});
```

- [ ] **Step 3: Verify API works**

```bash
npm run dev
# In another terminal:
curl -s http://localhost:3000/api/documents/SOME_DOC_ID/commits -H "Cookie: ..." | jq .
```

Expected: JSON array of commits (may be empty for new docs).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/app/api/documents/\[id\]/commits/route.ts
git commit -m "feat: add commits list API and install diff2html"
```

---

## Task 2: Diff API

**Files:**
- Create: `src/app/api/documents/[id]/diff/[sha]/route.ts`

- [ ] **Step 1: Implement GET /api/documents/:id/diff/:sha**

```typescript
// src/app/api/documents/[id]/diff/[sha]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocsGitService } from '@/lib/git';

export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id, sha } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  // Verify commit belongs to this document
  const commit = await prisma.documentGitCommit.findFirst({
    where: { documentId: id, commitSha: sha },
  });
  if (!commit) throw new ApiError(404, 'NOT_FOUND', 'Commit not found for this document');

  const git = getDocsGitService();
  const diff = await git.getDiff(sha, document.gitFile);

  return NextResponse.json({ data: { sha, diff, summary: commit.summary, eventType: commit.eventType } });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/documents/\[id\]/diff/\[sha\]/route.ts
git commit -m "feat: add diff API for commit SHA"
```

---

## Task 3: CommitList Component

**Files:**
- Create: `src/components/history/CommitList.tsx`

- [ ] **Step 1: Install date-fns**

```bash
npm install date-fns
```

- [ ] **Step 2: Create CommitList component**

```tsx
// src/components/history/CommitList.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

interface GitCommit {
  id: string;
  commitSha: string;
  eventType: string;
  summary: string;
  committedAt: string;
  trigger: { id: string; name: string; email: string; avatarUrl: string | null } | null;
}

const EVENT_LABELS: Record<string, string> = {
  create: 'Created',
  review_started: 'Review Started',
  discussion_resolved: 'Discussion Resolved',
  approved: 'Approved',
  reopened: 'Reopened',
};

const EVENT_COLORS: Record<string, string> = {
  create: 'bg-blue-100 text-blue-800',
  review_started: 'bg-yellow-100 text-yellow-800',
  discussion_resolved: 'bg-green-100 text-green-800',
  approved: 'bg-emerald-100 text-emerald-800',
  reopened: 'bg-orange-100 text-orange-800',
};

interface CommitListProps {
  documentId: string;
  selectedSha: string | null;
  onSelectCommit: (sha: string) => void;
}

export function CommitList({ documentId, selectedSha, onSelectCommit }: CommitListProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['commits', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/commits`);
      if (!res.ok) throw new Error('Failed to fetch commits');
      return res.json() as Promise<{ data: GitCommit[] }>;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading history...</p>;

  const commits = data?.data ?? [];
  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground">No commits yet.</p>;
  }

  return (
    <div className="space-y-1">
      {commits.map((commit) => (
        <button
          key={commit.id}
          type="button"
          onClick={() => onSelectCommit(commit.commitSha)}
          className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
            selectedSha === commit.commitSha ? 'bg-accent' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                EVENT_COLORS[commit.eventType] ?? 'bg-gray-100 text-gray-800'
              }`}
            >
              {EVENT_LABELS[commit.eventType] ?? commit.eventType}
            </span>
            <span className="truncate font-medium">{commit.summary}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{commit.trigger?.name ?? 'System'}</span>
            <span>·</span>
            <span>{formatDistanceToNow(new Date(commit.committedAt), { addSuffix: true })}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/history/CommitList.tsx package.json package-lock.json
git commit -m "feat: add CommitList component for git history"
```

---

## Task 4: DiffViewer Component

**Files:**
- Create: `src/components/history/DiffViewer.tsx`

- [ ] **Step 1: Create DiffViewer component**

```tsx
// src/components/history/DiffViewer.tsx
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
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setStyle('line-by-line')}
            className={`rounded px-2 py-1 text-xs ${
              style === 'line-by-line'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            Unified
          </button>
          <button
            type="button"
            onClick={() => setStyle('side-by-side')}
            className={`rounded px-2 py-1 text-xs ${
              style === 'side-by-side'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/history/DiffViewer.tsx
git commit -m "feat: add DiffViewer component with diff2html"
```

---

## Task 5: HistorySidebar + Integrate into Document Page

**Files:**
- Create: `src/components/history/HistorySidebar.tsx`
- Modify: `src/app/documents/[id]/page.tsx`

- [ ] **Step 1: Create HistorySidebar**

```tsx
// src/components/history/HistorySidebar.tsx
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
            ← Back to commits
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
```

- [ ] **Step 2: Add History tab to document page**

In `src/app/documents/[id]/page.tsx`:

1. Change `SidebarTab` type to `'discussions' | 'members' | 'history'`
2. Import `HistorySidebar`
3. Add History tab button
4. Add `HistorySidebar` render in tab content

```tsx
// Add to imports:
import { HistorySidebar } from '@/components/history/HistorySidebar';

// Change type:
type SidebarTab = 'discussions' | 'members' | 'history';

// Add tab button after Members button:
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

// Add in tab content section (after members):
{sidebarTab === 'history' && (
  <HistorySidebar documentId={documentId} />
)}
```

- [ ] **Step 3: Run dev server and verify**

```bash
npm run dev
```

Navigate to a document that has been through review. Check the History tab shows commits, and clicking a commit shows the diff.

- [ ] **Step 4: Commit**

```bash
git add src/components/history/HistorySidebar.tsx src/app/documents/\[id\]/page.tsx
git commit -m "feat: add History sidebar tab with commit list and diff viewer"
```

---

## Task 6: SSE Infrastructure

**Files:**
- Create: `src/lib/sse.ts`

- [ ] **Step 1: Write tests for SSE registry**

```typescript
// src/lib/__tests__/sse.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the module to test pushToSSE and registry behavior
describe('SSE Registry', () => {
  it('should be importable', async () => {
    const mod = await import('@/lib/sse');
    expect(mod.pushToSSE).toBeDefined();
    expect(mod.registerSSEConnection).toBeDefined();
    expect(mod.removeSSEConnection).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/sse.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement SSE registry**

```typescript
// src/lib/sse.ts
const encoder = new TextEncoder();

// Map<userId, Set<ReadableStreamDefaultController>>
// Using Set to support multiple tabs/windows per user
const sseConnections = new Map<string, Set<ReadableStreamDefaultController>>();

export function registerSSEConnection(userId: string, controller: ReadableStreamDefaultController): void {
  let controllers = sseConnections.get(userId);
  if (!controllers) {
    controllers = new Set();
    sseConnections.set(userId, controllers);
  }
  controllers.add(controller);
}

export function removeSSEConnection(userId: string, controller: ReadableStreamDefaultController): void {
  const controllers = sseConnections.get(userId);
  if (controllers) {
    controllers.delete(controller);
    if (controllers.size === 0) {
      sseConnections.delete(userId);
    }
  }
}

export function pushToSSE(userId: string, data: unknown): void {
  const controllers = sseConnections.get(userId);
  if (!controllers) return;
  const message = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  for (const controller of controllers) {
    try {
      controller.enqueue(message);
    } catch {
      // Controller closed, will be cleaned up on abort
    }
  }
}

export function pushToSSEMultiple(userIds: string[], data: unknown): void {
  for (const userId of userIds) {
    pushToSSE(userId, data);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/sse.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sse.ts src/lib/__tests__/sse.test.ts
git commit -m "feat: add SSE connection registry"
```

---

## Task 7: SSE Stream Endpoint

**Files:**
- Create: `src/app/api/notifications/stream/route.ts`

- [ ] **Step 1: Implement SSE stream endpoint**

```typescript
// src/app/api/notifications/stream/route.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { registerSSEConnection, removeSSEConnection } from '@/lib/sse';

const encoder = new TextEncoder();

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = session.user.id;

  const stream = new ReadableStream({
    start(controller) {
      registerSSEConnection(userId, controller);

      // Send initial connection event
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

      // Heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        removeSSEConnection(userId, controller);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/notifications/stream/route.ts
git commit -m "feat: add SSE stream endpoint for notifications"
```

---

## Task 8: Notification Dispatch Service

**Files:**
- Create: `src/lib/email.ts`
- Create: `src/lib/slack.ts`
- Create: `src/lib/notifications.ts`

- [ ] **Step 1: Install nodemailer + types**

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

- [ ] **Step 2: Write tests for notification service**

```typescript
// src/lib/__tests__/notifications.test.ts
import { describe, it, expect, vi } from 'vitest';

// We test the notification type format helper
describe('Notification types', () => {
  it('should export sendNotification function', async () => {
    // Just verify module structure — actual DB/SSE calls tested via integration
    const mod = await import('@/lib/notifications');
    expect(mod.sendNotification).toBeDefined();
    expect(typeof mod.sendNotification).toBe('function');
  });
});
```

- [ ] **Step 3: Run test (should fail)**

```bash
npx vitest run src/lib/__tests__/notifications.test.ts
```

- [ ] **Step 4: Implement email service**

```typescript
// src/lib/email.ts

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn('Email not configured, skipping:', options.subject);
    return;
  }

  try {
    // Dynamic import to avoid bundling nodemailer on client
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || smtpUser,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
  } catch (err) {
    console.error('Failed to send email:', err);
  }
}
```

- [ ] **Step 5: Implement Slack service**

```typescript
// src/lib/slack.ts

interface SlackMessage {
  text: string;
}

export async function sendSlack(webhookUrl: string, message: SlackMessage): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!res.ok) {
      console.error('Slack webhook failed:', res.status);
    }
  } catch (err) {
    console.error('Failed to send Slack message:', err);
  }
}
```

- [ ] **Step 6: Implement notification dispatch service**

```typescript
// src/lib/notifications.ts
import { prisma } from '@/lib/prisma';
import { pushToSSE } from '@/lib/sse';
import { sendEmail } from '@/lib/email';
import { sendSlack } from '@/lib/slack';

export type NotificationType =
  | 'review_started'
  | 'document_signed'
  | 'document_approved'
  | 'discussion_resolve_started'
  | 'discussion_resolved'
  | 'all_discussions_resolved'
  | 'comment_added'
  | 'mentioned';

interface NotificationPayload {
  documentId?: string;
  documentTitle?: string;
  actorName?: string;
  message: string;
  [key: string]: unknown;
}

interface SendNotificationOptions {
  type: NotificationType;
  recipientIds: string[];
  payload: NotificationPayload;
  documentId?: string;
}

export async function sendNotification(options: SendNotificationOptions): Promise<void> {
  const { type, recipientIds, payload, documentId } = options;

  if (recipientIds.length === 0) return;

  // 1. Bulk insert into DB
  const notifications = await prisma.$transaction(
    recipientIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          documentId: documentId ?? null,
          type,
          payload: payload as Record<string, unknown>,
        },
        include: { user: { select: { email: true, notificationPrefs: true, slackWebhookUrl: true } } },
      }),
    ),
  );

  // 2. Push to SSE (real-time in-app)
  const sseData = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    payload: n.payload,
    documentId: n.documentId,
    createdAt: n.createdAt.toISOString(),
  }));

  for (let i = 0; i < recipientIds.length; i++) {
    pushToSSE(recipientIds[i], sseData[i]);
  }

  // 3. Email + Slack (async, fire-and-forget)
  for (const notification of notifications) {
    const prefs = (notification.user.notificationPrefs ?? { inApp: true, email: true, slack: false }) as { inApp?: boolean; email?: boolean; slack?: boolean };

    if (prefs.email && notification.user.email) {
      sendEmail({
        to: notification.user.email,
        subject: `[Pactum] ${payload.message}`,
        html: `<p>${payload.message}</p>${
          documentId ? `<p><a href="${process.env.NEXTAUTH_URL}/documents/${documentId}">View Document</a></p>` : ''
        }`,
      }).catch(() => {}); // fire-and-forget
    }

    if (prefs.slack && notification.user.slackWebhookUrl) {
      sendSlack(notification.user.slackWebhookUrl, {
        text: `[Pactum] ${payload.message}${
          documentId ? ` — ${process.env.NEXTAUTH_URL}/documents/${documentId}` : ''
        }`,
      }).catch(() => {}); // fire-and-forget
    }
  }
}

/**
 * Helper: get all user IDs with specific roles for a document.
 */
export async function getRecipientsByRoles(
  documentId: string,
  creatorId: string,
  roles: string[],
  excludeUserId?: string,
): Promise<string[]> {
  const ids = new Set<string>();

  // Check if creator role is requested
  if (roles.includes('creator')) {
    ids.add(creatorId);
  }

  // Get members with requested roles
  if (roles.some((r) => r !== 'creator')) {
    const members = await prisma.documentMember.findMany({
      where: {
        documentId,
        role: { in: roles.filter((r) => r !== 'creator') },
      },
      select: { userId: true },
    });
    members.forEach((m) => ids.add(m.userId));
  }

  if (excludeUserId) ids.delete(excludeUserId);
  return Array.from(ids);
}
```

- [ ] **Step 7: Run test**

```bash
npx vitest run src/lib/__tests__/notifications.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/email.ts src/lib/slack.ts src/lib/notifications.ts src/lib/__tests__/notifications.test.ts
git commit -m "feat: add notification dispatch service (DB + SSE + email + Slack)"
```

---

## Task 9: Notifications API (List + Mark Read)

**Files:**
- Create: `src/app/api/notifications/route.ts`

- [ ] **Step 1: Implement GET + PATCH /api/notifications**

```typescript
// src/app/api/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

export const GET = apiHandler(async (req) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get('unread') === 'true';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20));

  const where = {
    userId: session.user.id,
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        document: { select: { id: true, title: true } },
      },
    }),
    prisma.notification.count({ where }),
  ]);

  return NextResponse.json({
    data: notifications,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

export const PATCH = apiHandler(async (req) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const body = await req.json();
  const { ids, markAllRead } = body as { ids?: string[]; markAllRead?: boolean };

  if (markAllRead) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });
  } else if (ids?.length) {
    await prisma.notification.updateMany({
      where: { id: { in: ids }, userId: session.user.id },
      data: { isRead: true },
    });
  } else {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Provide ids or markAllRead');
  }

  return NextResponse.json({ data: { success: true } });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/notifications/route.ts
git commit -m "feat: add notifications list and mark-read API"
```

---

## Task 10: User Settings API

**Files:**
- Create: `src/app/api/users/me/route.ts`

- [ ] **Step 1: Implement GET + PATCH /api/users/me**

```typescript
// src/app/api/users/me/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

export const GET = apiHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      notificationPrefs: true,
      slackWebhookUrl: true,
    },
  });

  return NextResponse.json({ data: user });
});

export const PATCH = apiHandler(async (req) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const body = await req.json();
  const { notificationPrefs, slackWebhookUrl } = body as {
    notificationPrefs?: { inApp?: boolean; email?: boolean; slack?: boolean };
    slackWebhookUrl?: string | null;
  };

  const data: Record<string, unknown> = {};
  if (notificationPrefs !== undefined) data.notificationPrefs = notificationPrefs;
  if (slackWebhookUrl !== undefined) data.slackWebhookUrl = slackWebhookUrl;

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      notificationPrefs: true,
      slackWebhookUrl: true,
    },
  });

  return NextResponse.json({ data: user });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/users/me/route.ts
git commit -m "feat: add user settings API (notification prefs + Slack webhook)"
```

---

## Task 11: useSSE Hook

**Files:**
- Create: `src/hooks/useSSE.ts`

- [ ] **Step 1: Implement useSSE hook**

```typescript
// src/hooks/useSSE.ts
'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

const NOTIFICATION_MESSAGES: Record<string, (payload: Record<string, unknown>) => string> = {
  review_started: (p) => `${p.actorName} submitted "${p.documentTitle}" for review`,
  document_signed: (p) => `${p.actorName} signed off on "${p.documentTitle}"`,
  document_approved: (p) => `"${p.documentTitle}" has been approved`,
  discussion_resolve_started: (p) => `${p.actorName} initiated discussion resolution`,
  discussion_resolved: (p) => `Discussion resolved in "${p.documentTitle}"`,
  all_discussions_resolved: (p) => `All discussions resolved in "${p.documentTitle}"`,
  comment_added: (p) => `${p.actorName} commented in "${p.documentTitle}"`,
  mentioned: (p) => `${p.actorName} mentioned you in "${p.documentTitle}"`,
};

export function useSSE() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    const es = new EventSource('/api/notifications/stream');
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;

        // Invalidate notification queries
        queryClient.invalidateQueries({ queryKey: ['notifications'] });

        // Invalidate document-specific queries
        if (data.documentId) {
          queryClient.invalidateQueries({ queryKey: ['document', data.documentId] });
          queryClient.invalidateQueries({ queryKey: ['discussions', data.documentId] });
          queryClient.invalidateQueries({ queryKey: ['commits', data.documentId] });
          queryClient.invalidateQueries({ queryKey: ['signoffs', data.documentId] });
        }

        // Show toast
        const payload = data.payload as Record<string, unknown>;
        const getMessage = NOTIFICATION_MESSAGES[data.type];
        const message = getMessage ? getMessage(payload) : (payload.message as string);
        if (message) {
          toast.info(message);
        }
      } catch {
        // Ignore parse errors (heartbeat, etc.)
      }
    };

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [session?.user?.id, queryClient]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSSE.ts
git commit -m "feat: add useSSE hook for real-time notifications"
```

---

## Task 12: NotificationBell + NotificationList

**Files:**
- Create: `src/components/notifications/NotificationBell.tsx`
- Create: `src/components/notifications/NotificationList.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Create NotificationList component**

```tsx
// src/components/notifications/NotificationList.tsx
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

interface NotificationItem {
  id: string;
  type: string;
  payload: { message?: string; documentTitle?: string; actorName?: string; [key: string]: unknown };
  isRead: boolean;
  createdAt: string;
  document: { id: string; title: string } | null;
}

interface NotificationListProps {
  onNavigate?: (documentId: string) => void;
}

export function NotificationList({ onNavigate }: NotificationListProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?pageSize=30');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json() as Promise<{ data: NotificationItem[] }>;
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading...</p>;

  const notifications = data?.data ?? [];
  if (notifications.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No notifications.</p>;
  }

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="max-h-96 overflow-y-auto">
      {hasUnread && (
        <div className="border-b px-4 py-2">
          <button
            type="button"
            onClick={() => markAllReadMutation.mutate()}
            className="text-xs text-primary hover:underline"
          >
            Mark all as read
          </button>
        </div>
      )}
      {notifications.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => {
            if (!n.isRead) markReadMutation.mutate([n.id]);
            if (n.document?.id && onNavigate) onNavigate(n.document.id);
          }}
          className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-accent transition-colors ${
            n.isRead ? 'opacity-60' : ''
          }`}
        >
          <p className="text-sm">
            {!n.isRead && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" />}
            {n.payload.message ?? n.type}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
          </p>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create NotificationBell component**

```tsx
// src/components/notifications/NotificationBell.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { NotificationList } from './NotificationList';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?unread=true&pageSize=1');
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ pagination: { total: number } }>;
    },
    refetchInterval: 60000, // Fallback poll every 60s
  });

  const unreadCount = data?.pagination?.total ?? 0;

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-2 hover:bg-accent transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50">
          <div className="border-b px-4 py-2">
            <h3 className="text-sm font-medium">Notifications</h3>
          </div>
          <NotificationList
            onNavigate={(docId) => {
              setOpen(false);
              router.push(`/documents/${docId}`);
            }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add NotificationBell to Header + useSSE to layout**

In `src/components/layout/Header.tsx`, import and add `NotificationBell` next to the avatar.

In `src/app/layout.tsx` or `src/components/Providers.tsx`, add `useSSE()` call. Since `useSSE` needs to be inside QueryProvider and SessionProvider, create a small wrapper or call it in Providers.

```tsx
// In src/components/Providers.tsx, add:
import { useSSE } from '@/hooks/useSSE';

function SSEProvider({ children }: { children: React.ReactNode }) {
  useSSE();
  return <>{children}</>;
}

// Wrap children with SSEProvider inside QueryProvider + SessionProvider
```

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/NotificationBell.tsx src/components/notifications/NotificationList.tsx src/components/layout/Header.tsx src/components/Providers.tsx
git commit -m "feat: add NotificationBell, NotificationList, and useSSE integration"
```

---

## Task 13: Integrate Notifications into Business APIs

**Files:**
- Modify: `src/app/api/documents/[id]/review/route.ts`
- Modify: `src/app/api/documents/[id]/signoff/route.ts`
- Modify: `src/app/api/discussions/[discussionId]/resolve/route.ts`
- Modify: `src/app/api/discussions/[discussionId]/signoff/route.ts`

- [ ] **Step 1: Add notifications to review API**

In `src/app/api/documents/[id]/review/route.ts`, after updating status, add:

```typescript
import { sendNotification, getRecipientsByRoles } from '@/lib/notifications';

// After status update, before return:
const recipientIds = await getRecipientsByRoles(id, document.createdBy, ['editor', 'advisor', 'approver'], session.user.id);
sendNotification({
  type: 'review_started',
  recipientIds,
  documentId: id,
  payload: {
    message: `${session.user.name} submitted "${document.title}" for review`,
    documentTitle: document.title,
    actorName: session.user.name,
  },
}).catch(() => {}); // fire-and-forget
```

- [ ] **Step 2: Add notifications to signoff API**

In `src/app/api/documents/[id]/signoff/route.ts`, add notification after signoff:

```typescript
import { sendNotification, getRecipientsByRoles } from '@/lib/notifications';

// After inserting signoff, notify creator:
sendNotification({
  type: 'document_signed',
  recipientIds: [document.createdBy],
  documentId: id,
  payload: {
    message: `${session.user.name} signed off on "${document.title}"`,
    documentTitle: document.title,
    actorName: session.user.name,
  },
}).catch(() => {});

// If auto-approved, notify all members:
// (inside the "all signed" block)
const allRecipients = await getRecipientsByRoles(id, document.createdBy, ['creator', 'editor', 'approver', 'advisor']);
sendNotification({
  type: 'document_approved',
  recipientIds: allRecipients,
  documentId: id,
  payload: {
    message: `"${document.title}" has been approved by all signers`,
    documentTitle: document.title,
  },
}).catch(() => {});
```

- [ ] **Step 3: Add notifications to discussion resolve API**

In `src/app/api/discussions/[discussionId]/resolve/route.ts`:

```typescript
import { sendNotification, getRecipientsByRoles } from '@/lib/notifications';

// After setting CTA:
const recipientIds = await getRecipientsByRoles(
  discussion.documentId,
  discussion.document.createdBy,
  ['editor', 'approver'],
  session.user.id,
);
sendNotification({
  type: 'discussion_resolve_started',
  recipientIds,
  documentId: discussion.documentId,
  payload: {
    message: `${session.user.name} initiated discussion resolution in "${discussion.document.title}"`,
    documentTitle: discussion.document.title,
    actorName: session.user.name,
  },
}).catch(() => {});
```

- [ ] **Step 4: Add notifications to discussion signoff API**

In `src/app/api/discussions/[discussionId]/signoff/route.ts`:

```typescript
import { sendNotification, getRecipientsByRoles } from '@/lib/notifications';

// When all discussion signoffs complete:
sendNotification({
  type: 'discussion_resolved',
  recipientIds: [discussion.document.createdBy],
  documentId: discussion.documentId,
  payload: {
    message: `Discussion resolved in "${discussion.document.title}"`,
    documentTitle: discussion.document.title,
  },
}).catch(() => {});

// If all discussions resolved:
sendNotification({
  type: 'all_discussions_resolved',
  recipientIds: [discussion.document.createdBy],
  documentId: discussion.documentId,
  payload: {
    message: `All discussions resolved in "${discussion.document.title}" — ready for signoff`,
    documentTitle: discussion.document.title,
  },
}).catch(() => {});
```

- [ ] **Step 5: Add mention notification to create-discussion API**

In `src/app/api/documents/[id]/discussions/route.ts`, the POST handler already accepts `mentions` in the request body. After creating the discussion, add notification:

```typescript
import { sendNotification } from '@/lib/notifications';

// After creating discussion + first comment, if mentions provided:
const { anchorType, anchorData, content, mentions } = body;
// ... existing create logic ...

if (mentions?.length) {
  sendNotification({
    type: 'mentioned',
    recipientIds: mentions.filter((uid: string) => uid !== session.user.id),
    documentId: id,
    payload: {
      message: `${session.user.name} mentioned you in a discussion on "${document.title}"`,
      documentTitle: document.title,
      actorName: session.user.name,
    },
  }).catch(() => {});
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/documents/\[id\]/review/route.ts src/app/api/documents/\[id\]/signoff/route.ts src/app/api/discussions/\[discussionId\]/resolve/route.ts src/app/api/discussions/\[discussionId\]/signoff/route.ts src/app/api/documents/\[id\]/discussions/route.ts
git commit -m "feat: integrate notification triggers into business APIs"
```

---

## Task 14: User Settings Page

**Files:**
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: Create settings page**

```tsx
// src/app/settings/page.tsx
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface UserSettings {
  id: string;
  name: string;
  email: string;
  notificationPrefs: { inApp: boolean; email: boolean; slack: boolean };
  slackWebhookUrl: string | null;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['user-settings'],
    queryFn: async () => {
      const res = await fetch('/api/users/me');
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json() as Promise<{ data: UserSettings }>;
    },
  });

  const [prefs, setPrefs] = useState({ inApp: true, email: true, slack: false });
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    if (data?.data) {
      setPrefs(data.data.notificationPrefs);
      setWebhookUrl(data.data.slackWebhookUrl ?? '');
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationPrefs: prefs,
          slackWebhookUrl: webhookUrl || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
    },
    onError: () => toast.error('Failed to save settings'),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading settings...</p>;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Notification Preferences</h2>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={prefs.inApp}
            onChange={(e) => setPrefs({ ...prefs, inApp: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-sm">In-app notifications</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={prefs.email}
            onChange={(e) => setPrefs({ ...prefs, email: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-sm">Email notifications</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={prefs.slack}
            onChange={(e) => setPrefs({ ...prefs, slack: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-sm">Slack notifications</span>
        </label>

        {prefs.slack && (
          <div className="space-y-1">
            <label htmlFor="slack-webhook" className="text-sm font-medium">
              Slack Webhook URL
            </label>
            <input
              id="slack-webhook"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        )}
      </div>

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving...' : 'Save Settings'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Add Settings link to Header**

In `src/components/layout/Header.tsx`, add a "Settings" link (gear icon or text) that navigates to `/settings`.

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/page.tsx src/components/layout/Header.tsx
git commit -m "feat: add user settings page for notification preferences"
```

---

## Task 15: Member Search API for @Mention

**Files:**
- Create: `src/app/api/documents/[id]/members/search/route.ts`

- [ ] **Step 1: Implement member search**

```typescript
// src/app/api/documents/[id]/members/search/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

export const GET = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';

  // Get all members + creator
  const document = await prisma.document.findUnique({
    where: { id },
    select: {
      createdBy: true,
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      members: {
        select: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        distinct: ['userId'],
      },
    },
  });

  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  // Deduplicate users
  const usersMap = new Map<string, { id: string; name: string; email: string; avatarUrl: string | null }>();
  usersMap.set(document.creator.id, document.creator);
  document.members.forEach((m) => usersMap.set(m.user.id, m.user));

  let users = Array.from(usersMap.values());

  // Filter by query
  if (q) {
    const lower = q.toLowerCase();
    users = users.filter(
      (u) => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower),
    );
  }

  // Exclude self
  users = users.filter((u) => u.id !== session.user.id);

  return NextResponse.json({ data: users.slice(0, 10) });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/documents/\[id\]/members/search/route.ts
git commit -m "feat: add member search API for @mention autocomplete"
```

---

## Task 16: MentionSuggestion Component + CommentForm Integration

**Files:**
- Create: `src/components/discussions/MentionSuggestion.tsx`
- Modify: `src/components/discussions/CommentForm.tsx`

- [ ] **Step 1: Create MentionSuggestion component**

```tsx
// src/components/discussions/MentionSuggestion.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

interface MentionUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface MentionSuggestionProps {
  documentId: string;
  query: string;
  visible: boolean;
  onSelect: (user: MentionUser) => void;
  position: { top: number; left: number };
}

export function MentionSuggestion({ documentId, query, visible, onSelect, position }: MentionSuggestionProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['member-search', documentId, query],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/members/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ data: MentionUser[] }>;
    },
    enabled: visible && query.length > 0,
  });

  const users = data?.data ?? [];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!visible || users.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, users.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        onSelect(users[selectedIndex]);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, users, selectedIndex, onSelect]);

  if (!visible || users.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute z-50 w-60 rounded-md border bg-popover shadow-md"
      style={{ top: position.top, left: position.left }}
    >
      {users.map((user, i) => (
        <button
          key={user.id}
          type="button"
          className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
            i === selectedIndex ? 'bg-accent' : ''
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(user);
          }}
        >
          <span className="font-medium">{user.name}</span>
          <span className="ml-2 text-muted-foreground">{user.email}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update CommentForm to support @mentions**

In `src/components/discussions/CommentForm.tsx`, add mention detection logic:

- On textarea input, detect `@` followed by characters
- Show `MentionSuggestion` dropdown
- On select, replace `@query` with `@[Name](userId)`
- Track mentioned user IDs
- Pass mentions along with comment content on submit

Key changes to CommentForm:

```tsx
// Add state:
const [mentionQuery, setMentionQuery] = useState('');
const [mentionVisible, setMentionVisible] = useState(false);
const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
const [mentions, setMentions] = useState<string[]>([]);
const textareaRef = useRef<HTMLTextAreaElement>(null);

// On textarea change, detect @ pattern:
function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
  const value = e.target.value;
  setContent(value);

  const cursorPos = e.target.selectionStart;
  const textBeforeCursor = value.slice(0, cursorPos);
  const atMatch = textBeforeCursor.match(/@(\w*)$/);

  if (atMatch) {
    setMentionQuery(atMatch[1]);
    setMentionVisible(true);
    // Position dropdown below textarea
    setMentionPosition({ top: textareaRef.current?.offsetHeight ?? 0, left: 0 });
  } else {
    setMentionVisible(false);
  }
}

// On mention select:
function handleMentionSelect(user: { id: string; name: string }) {
  const cursorPos = textareaRef.current?.selectionStart ?? 0;
  const text = content;
  const beforeAt = text.slice(0, cursorPos).replace(/@\w*$/, '');
  const afterCursor = text.slice(cursorPos);
  setContent(`${beforeAt}@${user.name} ${afterCursor}`);
  setMentions((prev) => [...new Set([...prev, user.id])]);
  setMentionVisible(false);
}

// Update the existing mutation to include mentions in the request body:
// The existing CommentForm has an internal mutation that POSTs to the comments API.
// Change the mutation's body from { content } to { content, mentions }:
const mutation = useMutation({
  mutationFn: async (text: string) => {
    const res = await fetch(`/api/discussions/${discussionId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, mentions }),
    });
    if (!res.ok) throw new Error('Failed');
    return res.json();
  },
  onSuccess: () => {
    setContent('');
    setMentions([]);
    // ... existing invalidation logic
  },
});

// Reset mentions on submit (already handled in onSuccess above)
```

- [ ] **Step 3: Update comments API to handle mentions**

In `src/app/api/discussions/[discussionId]/comments/route.ts`, accept `mentions` array and trigger notifications:

```typescript
import { sendNotification } from '@/lib/notifications';

// In POST handler, after creating comment:
const { content, mentions } = body;

// ... create comment ...

// Notify mentioned users
if (mentions?.length) {
  sendNotification({
    type: 'mentioned',
    recipientIds: mentions.filter((id: string) => id !== session.user.id),
    documentId: discussion.documentId,
    payload: {
      message: `${session.user.name} mentioned you in a discussion on "${discussion.document.title}"`,
      documentTitle: discussion.document.title,
      actorName: session.user.name,
    },
  }).catch(() => {});
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/discussions/MentionSuggestion.tsx src/components/discussions/CommentForm.tsx src/app/api/discussions/\[discussionId\]/comments/route.ts
git commit -m "feat: add @mention autocomplete in discussion comments"
```

---

## Task 17: UI Polish — Loading Skeletons + Error Boundaries

**Files:**
- Create: `src/components/ui/LoadingSkeleton.tsx`
- Modify: `src/app/documents/[id]/page.tsx`
- Modify: `src/components/documents/DocumentList.tsx`

- [ ] **Step 1: Create LoadingSkeleton component**

```tsx
// src/components/ui/LoadingSkeleton.tsx
export function LoadingSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

export function DocumentCardSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <LoadingSkeleton className="h-5 w-3/4" />
      <LoadingSkeleton className="h-4 w-1/2" />
      <div className="flex gap-2">
        <LoadingSkeleton className="h-5 w-16 rounded-full" />
        <LoadingSkeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function DocumentDetailSkeleton() {
  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-4">
        <LoadingSkeleton className="h-8 w-1/3" />
        <LoadingSkeleton className="h-4 w-1/4" />
        <LoadingSkeleton className="h-64 w-full" />
      </div>
      <div className="w-[350px] space-y-3">
        <LoadingSkeleton className="h-8 w-full" />
        <LoadingSkeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update document detail page with skeleton**

In `src/app/documents/[id]/page.tsx`, replace the plain "Loading document..." with:

```tsx
import { DocumentDetailSkeleton } from '@/components/ui/LoadingSkeleton';

// Replace:
if (isLoading) {
  return <p className="text-muted-foreground">Loading document...</p>;
}
// With:
if (isLoading) {
  return <DocumentDetailSkeleton />;
}
```

- [ ] **Step 3: Update document list with skeleton**

In `src/components/documents/DocumentList.tsx`, add loading skeleton and empty state:

```tsx
import { DocumentCardSkeleton } from '@/components/ui/LoadingSkeleton';

// In loading state:
if (isLoading) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <DocumentCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Empty state:
if (documents.length === 0) {
  return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">No documents found.</p>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/LoadingSkeleton.tsx src/app/documents/\[id\]/page.tsx src/components/documents/DocumentList.tsx
git commit -m "feat: add loading skeletons and empty states for UI polish"
```

---

## Task 18: Run All Tests + Update HANDOFF.md

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All existing tests pass + new tests pass.

- [ ] **Step 2: Run dev server and verify end-to-end**

```bash
npm run dev
```

Manual verification checklist:
1. History tab shows commits in document detail page
2. Clicking a commit shows diff with unified/side-by-side toggle
3. Notification bell appears in header
4. Settings page loads at /settings
5. @mention autocomplete appears when typing @ in comment form

- [ ] **Step 3: Update HANDOFF.md**

Update HANDOFF.md to mark Phase 7-9 as complete, update current state, set next step.

```markdown
| Phase 7: Git Diff Viewer | ✅ Done | Commit history list, diff viewer with diff2html (unified/side-by-side) |
| Phase 8: Notifications | ✅ Done | SSE real-time, email (nodemailer), Slack (webhook), notification prefs, NotificationBell |
| Phase 9: @Mention + Polish | ✅ Done | @mention autocomplete, loading skeletons, empty states |
```

- [ ] **Step 4: Commit**

```bash
git add HANDOFF.md
git commit -m "docs: update HANDOFF.md — Phase 7-9 complete"
```

---

## Summary

| Task | Phase | Description |
|------|-------|-------------|
| 1 | 7 | Commits list API + install diff2html |
| 2 | 7 | Diff API by commit SHA |
| 3 | 7 | CommitList component (+ install date-fns) |
| 4 | 7 | DiffViewer component (diff2html) |
| 5 | 7 | HistorySidebar + integrate into document page |
| 6 | 8 | SSE connection registry |
| 7 | 8 | SSE stream endpoint |
| 8 | 8 | Install nodemailer + notification dispatch service (DB + SSE + email + Slack) |
| 9 | 8 | Notifications list + mark-read API |
| 10 | 8 | User settings API |
| 11 | 8 | useSSE hook |
| 12 | 8 | NotificationBell + NotificationList + Header integration |
| 13 | 8 | Integrate notifications into business APIs (incl. create-discussion mentions) |
| 14 | 8 | User settings page |
| 15 | 9 | Member search API for @mention |
| 16 | 9 | MentionSuggestion component + CommentForm integration |
| 17 | 9 | Loading skeletons + empty states |
| 18 | — | Run tests + update HANDOFF.md |
