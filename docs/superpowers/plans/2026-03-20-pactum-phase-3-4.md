# Pactum Phase 3-4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add role & permission system, edit locking, Tiptap rich text editor with Markdown mode toggle, image upload, and server-side Markdown conversion — making the editor production-ready.

**Architecture:** Phase 3 adds `src/lib/permissions.ts` (pure functions), member CRUD API, and lock API. Phase 4 replaces the textarea with Tiptap, adds CodeMirror Markdown mode, image upload to R2, and a server-side headless Tiptap for JSON→Markdown conversion.

**Tech Stack:** Prisma, Tiptap (@tiptap/react + extensions), CodeMirror 6 (@codemirror/lang-markdown), tiptap-markdown, @aws-sdk/client-s3 (R2), Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-pactum-mvp-design.md` (Sections 4-5)

**Depends on:** Phase 0-2 complete (see `HANDOFF.md`)

---

## File Map

### Phase 3 — Roles & Permissions + Edit Locking
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/permissions.ts` | Pure permission functions (getDocumentRoles, canEdit, etc.) |
| Create | `src/lib/__tests__/permissions.test.ts` | Permission logic tests |
| Create | `src/app/api/documents/[id]/members/route.ts` | GET + POST members |
| Create | `src/app/api/documents/[id]/members/[uid]/route.ts` | PATCH + DELETE member |
| Create | `src/app/api/documents/[id]/lock/route.ts` | POST (acquire) + DELETE (release) |
| Create | `src/hooks/useEditLock.ts` | Lock acquire/release + beforeunload |
| Create | `src/components/documents/MemberManager.tsx` | Member list + add/remove/role UI |
| Modify | `src/app/documents/[id]/page.tsx` | Add member panel + lock UI |

### Phase 4 — Tiptap Editor + Image Upload
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/components/editor/TiptapEditor.tsx` | Rich text editor with all extensions |
| Create | `src/components/editor/EditorToolbar.tsx` | Formatting toolbar |
| Create | `src/components/editor/MarkdownEditor.tsx` | CodeMirror 6 markdown editor |
| Create | `src/components/editor/ModeToggle.tsx` | Rich Text / Markdown toggle |
| Create | `src/components/editor/extensions/image-upload.ts` | Paste/drop image upload extension |
| Create | `src/lib/r2.ts` | Cloudflare R2 upload client |
| Create | `src/lib/markdown.ts` | Server-side headless Tiptap JSON→Markdown |
| Create | `src/lib/__tests__/markdown.test.ts` | Markdown conversion tests |
| Create | `src/app/api/upload/image/route.ts` | POST image upload endpoint |
| Modify | `src/app/documents/[id]/page.tsx` | Replace textarea with TiptapEditor |
| Modify | `src/hooks/useAutoSave.ts` | Save Tiptap JSON instead of plain text |

---

## Task 1: Permission Functions (TDD)

**Files:**
- Create: `src/lib/permissions.ts`
- Create: `src/lib/__tests__/permissions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/__tests__/permissions.test.ts
import { describe, it, expect } from 'vitest';
import {
  getHighestRole,
  canEdit,
  canManageMembers,
  canStartReview,
  canReopen,
  canResolveDiscussion,
  canForceLock,
  needsSignoff,
  canCreateDiscussion,
} from '@/lib/permissions';
import type { DocumentRole } from '@/types';

describe('getHighestRole', () => {
  it('returns creator as highest', () => {
    expect(getHighestRole(['creator'])).toBe('creator');
  });

  it('returns editor over approver', () => {
    expect(getHighestRole(['approver', 'editor'])).toBe('editor');
  });

  it('returns approver over advisor', () => {
    expect(getHighestRole(['advisor', 'approver'])).toBe('approver');
  });

  it('handles single viewer', () => {
    expect(getHighestRole(['viewer'])).toBe('viewer');
  });
});

describe('permission functions', () => {
  const check = (fn: (roles: DocumentRole[]) => boolean) => ({
    creator: fn(['creator']),
    editor: fn(['editor']),
    advisor: fn(['advisor']),
    approver: fn(['approver']),
    viewer: fn(['viewer']),
    editorApprover: fn(['editor', 'approver']),
  });

  it('canEdit: creator and editor only', () => {
    const r = check(canEdit);
    expect(r.creator).toBe(true);
    expect(r.editor).toBe(true);
    expect(r.advisor).toBe(false);
    expect(r.approver).toBe(false);
    expect(r.viewer).toBe(false);
    expect(r.editorApprover).toBe(true);
  });

  it('canManageMembers: creator only', () => {
    const r = check(canManageMembers);
    expect(r.creator).toBe(true);
    expect(r.editor).toBe(false);
    expect(r.approver).toBe(false);
  });

  it('canStartReview: creator only', () => {
    const r = check(canStartReview);
    expect(r.creator).toBe(true);
    expect(r.editor).toBe(false);
  });

  it('canReopen: creator only', () => {
    const r = check(canReopen);
    expect(r.creator).toBe(true);
    expect(r.editor).toBe(false);
  });

  it('canResolveDiscussion: creator, editor, approver', () => {
    const r = check(canResolveDiscussion);
    expect(r.creator).toBe(true);
    expect(r.editor).toBe(true);
    expect(r.approver).toBe(true);
    expect(r.advisor).toBe(false);
    expect(r.viewer).toBe(false);
  });

  it('canForceLock: creator only', () => {
    const r = check(canForceLock);
    expect(r.creator).toBe(true);
    expect(r.editor).toBe(false);
  });

  it('needsSignoff: creator, editor, approver', () => {
    const r = check(needsSignoff);
    expect(r.creator).toBe(true);
    expect(r.editor).toBe(true);
    expect(r.approver).toBe(true);
    expect(r.advisor).toBe(false);
    expect(r.viewer).toBe(false);
  });

  it('canCreateDiscussion: creator, editor, advisor, approver', () => {
    const r = check(canCreateDiscussion);
    expect(r.creator).toBe(true);
    expect(r.editor).toBe(true);
    expect(r.advisor).toBe(true);
    expect(r.approver).toBe(true);
    expect(r.viewer).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**
```bash
npx vitest run src/lib/__tests__/permissions.test.ts
```

- [ ] **Step 3: Implement permissions**

```typescript
// src/lib/permissions.ts
import type { DocumentRole } from '@/types';
import { prisma } from '@/lib/prisma';

const ROLE_PRIORITY: Record<DocumentRole, number> = {
  creator: 4,
  editor: 3,
  approver: 2,
  advisor: 1,
  viewer: 0,
};

export function getHighestRole(roles: DocumentRole[]): DocumentRole {
  return [...roles].sort((a, b) => ROLE_PRIORITY[b] - ROLE_PRIORITY[a])[0];
}

function hasAnyRole(roles: DocumentRole[], allowed: DocumentRole[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

export function canEdit(roles: DocumentRole[]): boolean {
  return hasAnyRole(roles, ['creator', 'editor']);
}

export function canManageMembers(roles: DocumentRole[]): boolean {
  return hasAnyRole(roles, ['creator']);
}

export function canStartReview(roles: DocumentRole[]): boolean {
  return hasAnyRole(roles, ['creator']);
}

export function canReopen(roles: DocumentRole[]): boolean {
  return hasAnyRole(roles, ['creator']);
}

export function canResolveDiscussion(roles: DocumentRole[]): boolean {
  return hasAnyRole(roles, ['creator', 'editor', 'approver']);
}

export function canForceLock(roles: DocumentRole[]): boolean {
  return hasAnyRole(roles, ['creator']);
}

export function needsSignoff(roles: DocumentRole[]): boolean {
  return hasAnyRole(roles, ['creator', 'editor', 'approver']);
}

export function canCreateDiscussion(roles: DocumentRole[]): boolean {
  return hasAnyRole(roles, ['creator', 'editor', 'advisor', 'approver']);
}

export async function getDocumentRoles(
  userId: string,
  documentCreatedBy: string,
  documentId: string,
): Promise<DocumentRole[]> {
  if (userId === documentCreatedBy) return ['creator'];

  const members = await prisma.documentMember.findMany({
    where: { documentId, userId },
  });

  if (members.length === 0) return ['viewer'];
  return members.map((m) => m.role as DocumentRole);
}
```

- [ ] **Step 4: Run tests — expect PASS**
```bash
npx vitest run src/lib/__tests__/permissions.test.ts
```

- [ ] **Step 5: Commit**
```bash
git add src/lib/permissions.ts src/lib/__tests__/permissions.test.ts
git commit -m "feat: add permission system with role-based access control"
```

---

## Task 2: Member CRUD API

**Files:**
- Create: `src/app/api/documents/[id]/members/route.ts`
- Create: `src/app/api/documents/[id]/members/[uid]/route.ts`

- [ ] **Step 1: Create GET + POST members endpoint**

```typescript
// src/app/api/documents/[id]/members/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, canManageMembers } from '@/lib/permissions';

// GET /api/documents/:id/members
export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const members = await prisma.documentMember.findMany({
    where: { documentId: id },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { addedAt: 'asc' },
  });

  return NextResponse.json({ data: members });
});

// POST /api/documents/:id/members
export const POST = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canManageMembers(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the creator can manage members');
  }

  const body = await req.json();
  const { email, role } = body as { email: string; role: string };

  if (!email?.trim()) throw new ApiError(422, 'VALIDATION_ERROR', 'Email is required');
  if (!['editor', 'advisor', 'approver'].includes(role)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid role. Must be editor, advisor, or approver');
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found. They must log in at least once.');

  if (user.id === document.createdBy) {
    throw new ApiError(409, 'INVALID_STATUS', 'Cannot add the creator as a member');
  }

  // Upsert: unique on [documentId, userId, role]
  const member = await prisma.documentMember.upsert({
    where: {
      documentId_userId_role: { documentId: id, userId: user.id, role },
    },
    update: {},
    create: { documentId: id, userId: user.id, role },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({ data: member }, { status: 201 });
});
```

- [ ] **Step 2: Create PATCH + DELETE member endpoint**

```typescript
// src/app/api/documents/[id]/members/[uid]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, canManageMembers } from '@/lib/permissions';

// PATCH /api/documents/:id/members/:uid — change role
export const PATCH = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id, uid } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canManageMembers(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the creator can manage members');
  }

  if (uid === document.createdBy) {
    throw new ApiError(409, 'INVALID_STATUS', 'Cannot modify the creator');
  }

  const body = await req.json();
  const { oldRole, newRole } = body as { oldRole: string; newRole: string };

  if (!['editor', 'advisor', 'approver'].includes(newRole)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid role');
  }

  // Delete old role, create new one (since unique is [documentId, userId, role])
  await prisma.$transaction([
    prisma.documentMember.deleteMany({
      where: { documentId: id, userId: uid, role: oldRole },
    }),
    prisma.documentMember.create({
      data: { documentId: id, userId: uid, role: newRole },
    }),
  ]);

  const updatedMembers = await prisma.documentMember.findMany({
    where: { documentId: id, userId: uid },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({ data: updatedMembers });
});

// DELETE /api/documents/:id/members/:uid — remove member (all roles)
export const DELETE = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id, uid } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canManageMembers(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the creator can manage members');
  }

  if (uid === document.createdBy) {
    throw new ApiError(409, 'INVALID_STATUS', 'Cannot remove the creator');
  }

  await prisma.documentMember.deleteMany({
    where: { documentId: id, userId: uid },
  });

  return NextResponse.json({ data: { deleted: true } });
});
```

- [ ] **Step 3: Run all tests**
```bash
npx vitest run
```

- [ ] **Step 4: Commit**
```bash
git add src/app/api/documents/[id]/members/
git commit -m "feat: add member CRUD API endpoints (creator-only)"
```

---

## Task 3: Edit Lock API

**Files:**
- Create: `src/app/api/documents/[id]/lock/route.ts`

- [ ] **Step 1: Create lock acquire + release endpoint**

```typescript
// src/app/api/documents/[id]/lock/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, canEdit, canForceLock } from '@/lib/permissions';

// POST /api/documents/:id/lock — acquire lock
export const POST = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canEdit(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have edit permission');
  }

  // Try to acquire: only if unlocked or already locked by self
  const updated = await prisma.document.updateMany({
    where: {
      id,
      OR: [
        { lockedBy: null },
        { lockedBy: session.user.id },
      ],
    },
    data: {
      lockedBy: session.user.id,
      lockedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    // Someone else holds the lock
    const lockedDoc = await prisma.document.findUnique({
      where: { id },
      include: { locker: { select: { name: true } } },
    });
    throw new ApiError(
      409,
      'DOCUMENT_LOCKED',
      `${lockedDoc?.locker?.name || 'Someone'} is currently editing`,
    );
  }

  return NextResponse.json({
    data: { lockedBy: session.user.id, lockedAt: new Date().toISOString() },
  });
});

// DELETE /api/documents/:id/lock — release lock
export const DELETE = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  // Allow release if: lock owner OR creator (force unlock)
  if (document.lockedBy && document.lockedBy !== session.user.id) {
    const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
    if (!canForceLock(roles)) {
      throw new ApiError(403, 'FORBIDDEN', 'Only the lock owner or creator can release this lock');
    }
  }

  await prisma.document.update({
    where: { id },
    data: { lockedBy: null, lockedAt: null },
  });

  return NextResponse.json({ data: { released: true } });
});
```

- [ ] **Step 2: Run all tests**
```bash
npx vitest run
```

- [ ] **Step 3: Commit**
```bash
git add src/app/api/documents/[id]/lock/route.ts
git commit -m "feat: add edit lock acquire/release API with force-unlock"
```

---

**Note:** Background lock cleanup (stale locks > 10 min) is already implemented in `src/instrumentation.ts` from Phase 0-2. No additional task needed.

## Task 4: useEditLock Hook + MemberManager UI

**Files:**
- Create: `src/hooks/useEditLock.ts`
- Create: `src/components/documents/MemberManager.tsx`
- Modify: `src/app/documents/[id]/page.tsx`

- [ ] **Step 1: Create useEditLock hook**

```typescript
// src/hooks/useEditLock.ts
'use client';

import { useState, useEffect, useCallback } from 'react';

interface EditLockState {
  isLocked: boolean;
  lockedByMe: boolean;
  lockedByName: string | null;
  acquiring: boolean;
}

export function useEditLock(documentId: string, enabled: boolean = true) {
  const [state, setState] = useState<EditLockState>({
    isLocked: false,
    lockedByMe: false,
    lockedByName: null,
    acquiring: false,
  });

  const acquire = useCallback(async () => {
    setState((s) => ({ ...s, acquiring: true }));
    try {
      const res = await fetch(`/api/documents/${documentId}/lock`, { method: 'POST' });
      if (res.ok) {
        setState({ isLocked: true, lockedByMe: true, lockedByName: null, acquiring: false });
        return true;
      }
      const data = await res.json();
      setState({
        isLocked: true,
        lockedByMe: false,
        lockedByName: data.error?.message || 'Someone is editing',
        acquiring: false,
      });
      return false;
    } catch {
      setState((s) => ({ ...s, acquiring: false }));
      return false;
    }
  }, [documentId]);

  const release = useCallback(async () => {
    try {
      await fetch(`/api/documents/${documentId}/lock`, { method: 'DELETE' });
    } catch {
      // Best effort
    }
    setState({ isLocked: false, lockedByMe: false, lockedByName: null, acquiring: false });
  }, [documentId]);

  // Auto-acquire on mount if enabled
  useEffect(() => {
    if (!enabled) return;
    acquire();
    return () => {
      // Release on unmount via fetch with keepalive for reliability
      fetch(`/api/documents/${documentId}/lock`, { method: 'DELETE', keepalive: true });
    };
  }, [documentId, enabled, acquire]);

  // Also handle beforeunload
  useEffect(() => {
    if (!state.lockedByMe) return;
    const handler = () => {
      fetch(`/api/documents/${documentId}/lock`, { method: 'DELETE', keepalive: true });
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [documentId, state.lockedByMe]);

  return { ...state, acquire, release };
}
```

NOTE: We use `fetch` with `keepalive: true` instead of `sendBeacon` because `sendBeacon` only supports POST, but our lock release is a DELETE endpoint. `keepalive: true` ensures the request completes even after page navigation.

- [ ] **Step 2: Create MemberManager component**

```tsx
// src/components/documents/MemberManager.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { MemberRole } from '@/types';

interface Member {
  id: string;
  userId: string;
  role: MemberRole;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

interface MemberManagerProps {
  documentId: string;
  isCreator: boolean;
}

export function MemberManager({ documentId, isCreator }: MemberManagerProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('approver');
  const [error, setError] = useState('');

  const { data } = useQuery({
    queryKey: ['members', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/members`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json() as Promise<{ data: Member[] }>;
    },
  });

  const addMember = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to add member');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', documentId] });
      setEmail('');
      setError('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/documents/${documentId}/members/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', documentId] });
    },
  });

  // Group members by user (a user can have multiple roles)
  const membersByUser = new Map<string, Member[]>();
  for (const m of data?.data ?? []) {
    const existing = membersByUser.get(m.userId) || [];
    existing.push(m);
    membersByUser.set(m.userId, existing);
  }

  const roleColors: Record<MemberRole, string> = {
    editor: 'bg-blue-100 text-blue-800',
    advisor: 'bg-gray-100 text-gray-800',
    approver: 'bg-green-100 text-green-800',
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Members</h3>

      {/* Member list */}
      <div className="space-y-2">
        {Array.from(membersByUser.entries()).map(([userId, members]) => (
          <div key={userId} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <div className="flex items-center gap-2">
              <span>{members[0].user.name}</span>
              <span className="text-xs text-muted-foreground">{members[0].user.email}</span>
              <div className="flex gap-1">
                {members.map((m) => (
                  <span key={m.id} className={`rounded px-1.5 py-0.5 text-xs ${roleColors[m.role]}`}>
                    {m.role}
                  </span>
                ))}
              </div>
            </div>
            {isCreator && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMember.mutate(userId)}
                className="text-xs text-destructive"
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        {membersByUser.size === 0 && (
          <p className="text-sm text-muted-foreground">No members yet</p>
        )}
      </div>

      {/* Add member form (creator only) */}
      {isCreator && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className="rounded-md border px-2 text-sm"
            >
              <option value="approver">Approver</option>
              <option value="editor">Editor</option>
              <option value="advisor">Advisor</option>
            </select>
            <Button
              size="sm"
              onClick={() => addMember.mutate()}
              disabled={!email.trim() || addMember.isPending}
            >
              Add
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update document detail page to include MemberManager and lock status**

Modify `src/app/documents/[id]/page.tsx`:
- Import `MemberManager` and `useEditLock`
- Add a right sidebar section with `<MemberManager>`
- Show lock status in header (if locked by someone else, show warning + disable textarea)
- Pass `isCreator` to MemberManager based on session user vs document.createdBy

The implementer should read the existing page.tsx and integrate these additions without breaking existing functionality.

- [ ] **Step 4: Run all tests**
```bash
npx vitest run
```

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useEditLock.ts src/components/documents/MemberManager.tsx src/app/documents/[id]/page.tsx
git commit -m "feat: add edit lock hook and member management UI"
```

---

## Task 5: Install Tiptap + CodeMirror Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Tiptap packages**

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-image @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-code-block-lowlight tiptap-markdown lowlight
```

- [ ] **Step 2: Install CodeMirror packages**

```bash
npm install @codemirror/lang-markdown @codemirror/view @codemirror/state @codemirror/language codemirror @codemirror/theme-one-dark
```

- [ ] **Step 3: Install R2/S3 client**

```bash
npm install @aws-sdk/client-s3
```

- [ ] **Step 4: Verify dev server still works**
```bash
npm run dev &
sleep 5
curl -s http://localhost:3000 | head -3
kill %1 2>/dev/null || true
```

- [ ] **Step 5: Commit**
```bash
git add package.json package-lock.json
git commit -m "chore: install Tiptap, CodeMirror 6, and R2 client dependencies"
```

---

## Task 6: Tiptap Rich Text Editor Component

**Files:**
- Create: `src/components/editor/TiptapEditor.tsx`
- Create: `src/components/editor/EditorToolbar.tsx`

- [ ] **Step 1: Create EditorToolbar**

```tsx
// src/components/editor/EditorToolbar.tsx
'use client';

import { type Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';

interface EditorToolbarProps {
  editor: Editor | null;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  const btn = (
    label: string,
    action: () => void,
    isActive?: boolean,
  ) => (
    <Button
      type="button"
      variant={isActive ? 'default' : 'outline'}
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={action}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-wrap gap-1 border-b p-2">
      {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
      {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
      {btn('H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }))}
      <span className="mx-1 border-l" />
      {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
      {btn('S', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'))}
      <span className="mx-1 border-l" />
      {btn('UL', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
      {btn('OL', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
      {btn('Quote', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
      {btn('Code', () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
      <span className="mx-1 border-l" />
      {btn('HR', () => editor.chain().focus().setHorizontalRule().run())}
      {btn('Link', () => {
        const url = window.prompt('URL');
        if (url) editor.chain().focus().setLink({ href: url }).run();
      }, editor.isActive('link'))}
    </div>
  );
}
```

- [ ] **Step 2: Create TiptapEditor**

```tsx
// src/components/editor/TiptapEditor.tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { EditorToolbar } from './EditorToolbar';
import { useEffect, useRef } from 'react';

interface TiptapEditorProps {
  content: unknown; // Tiptap JSON or string
  onUpdate: (json: unknown) => void;
  editable?: boolean;
  placeholder?: string;
}

export function TiptapEditor({
  content,
  onUpdate,
  editable = true,
  placeholder = 'Start writing...',
}: TiptapEditorProps) {
  const isInitialized = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // We'll use CodeBlockLowlight later if needed
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      Markdown,
    ],
    editable,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[400px] p-4 focus:outline-none',
      },
    },
  });

  // Set initial content once
  useEffect(() => {
    if (editor && content && !isInitialized.current) {
      if (typeof content === 'string') {
        // Migration: old textarea content was plain string
        editor.commands.setContent(content);
      } else if (
        typeof content === 'object' &&
        content !== null &&
        Object.keys(content).length > 0
      ) {
        editor.commands.setContent(content);
      }
      isInitialized.current = true;
    }
  }, [editor, content]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  return (
    <div className="rounded-md border">
      {editable && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 3: Verify compilation**
```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**
```bash
git add src/components/editor/
git commit -m "feat: add Tiptap rich text editor with toolbar"
```

---

## Task 7: CodeMirror Markdown Editor + Mode Toggle

**Files:**
- Create: `src/components/editor/MarkdownEditor.tsx`
- Create: `src/components/editor/ModeToggle.tsx`

- [ ] **Step 1: Create MarkdownEditor**

```tsx
// src/components/editor/MarkdownEditor.tsx
'use client';

import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
}

export function MarkdownEditor({ value, onChange, editable = true }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const isExternalUpdate = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.editable.of(editable),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalUpdate.current) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
    // Only create once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== view.state.doc.toString()) {
      isExternalUpdate.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
      isExternalUpdate.current = false;
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="min-h-[400px] rounded-md border text-sm [&_.cm-editor]:min-h-[400px] [&_.cm-editor]:outline-none"
    />
  );
}
```

- [ ] **Step 2: Create ModeToggle**

```tsx
// src/components/editor/ModeToggle.tsx
'use client';

import { Button } from '@/components/ui/button';

interface ModeToggleProps {
  mode: 'richtext' | 'markdown';
  onToggle: (mode: 'richtext' | 'markdown') => void;
}

export function ModeToggle({ mode, onToggle }: ModeToggleProps) {
  return (
    <div className="flex gap-1">
      <Button
        variant={mode === 'richtext' ? 'default' : 'outline'}
        size="sm"
        className="h-7 text-xs"
        onClick={() => onToggle('richtext')}
      >
        Rich Text
      </Button>
      <Button
        variant={mode === 'markdown' ? 'default' : 'outline'}
        size="sm"
        className="h-7 text-xs"
        onClick={() => onToggle('markdown')}
      >
        Markdown
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**
```bash
git add src/components/editor/MarkdownEditor.tsx src/components/editor/ModeToggle.tsx
git commit -m "feat: add CodeMirror 6 markdown editor and mode toggle"
```

---

## Task 8: Image Upload (R2 + API)

**Files:**
- Create: `src/lib/r2.ts`
- Create: `src/app/api/upload/image/route.ts`

- [ ] **Step 1: Create R2 client**

```typescript
// src/lib/r2.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
```

- [ ] **Step 2: Create image upload API**

```typescript
// src/app/api/upload/image/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadToR2 } from '@/lib/r2';
import { apiHandler, ApiError } from '@/lib/api-handler';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const POST = apiHandler(async (req) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const formData = await req.formData();
  const file = formData.get('image') as File | null;
  const documentId = formData.get('documentId') as string | null;

  if (!file) throw new ApiError(422, 'VALIDATION_ERROR', 'No image provided');
  if (!documentId) throw new ApiError(422, 'VALIDATION_ERROR', 'documentId is required');

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Only JPEG, PNG, GIF, and WebP are supported');
  }

  if (file.size > MAX_SIZE) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'File size must be under 10MB');
  }

  const ext = file.name.split('.').pop() || 'png';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const key = `documents/${documentId}/${timestamp}-${random}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadToR2(key, buffer, file.type);

  return NextResponse.json({ data: { url } });
});
```

- [ ] **Step 3: Commit**
```bash
git add src/lib/r2.ts src/app/api/upload/image/route.ts
git commit -m "feat: add image upload API with Cloudflare R2 storage"
```

---

## Task 8.5: Image Upload Tiptap Extension

**Files:**
- Create: `src/components/editor/extensions/image-upload.ts`
- Modify: `src/components/editor/TiptapEditor.tsx`

- [ ] **Step 1: Create ImageUpload extension**

```typescript
// src/components/editor/extensions/image-upload.ts
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

async function uploadImage(file: File, documentId: string): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('documentId', documentId);
  const res = await fetch('/api/upload/image', { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Upload failed');
  const { data } = await res.json();
  return data.url;
}

export const ImageUpload = Extension.create({
  name: 'imageUpload',

  addOptions() {
    return { documentId: '' };
  },

  addProseMirrorPlugins() {
    const documentId = this.options.documentId;

    return [
      new Plugin({
        key: new PluginKey('imageUpload'),
        props: {
          handlePaste(view, event) {
            const items = Array.from(event.clipboardData?.items || []);
            const imageItem = items.find((item) => item.type.startsWith('image/'));

            if (!imageItem) return false;

            event.preventDefault();
            const file = imageItem.getAsFile();
            if (!file) return false;

            // Insert placeholder
            const { tr } = view.state;
            const pos = tr.selection.from;

            uploadImage(file, documentId)
              .then((url) => {
                const node = view.state.schema.nodes.image.create({ src: url });
                const transaction = view.state.tr.insert(pos, node);
                view.dispatch(transaction);
              })
              .catch((err) => {
                console.error('Image upload failed:', err);
              });

            return true;
          },
          handleDrop(view, event) {
            const files = Array.from(event.dataTransfer?.files || []);
            const imageFile = files.find((f) => f.type.startsWith('image/'));

            if (!imageFile) return false;

            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            if (pos === undefined) return false;

            uploadImage(imageFile, documentId)
              .then((url) => {
                const node = view.state.schema.nodes.image.create({ src: url });
                const transaction = view.state.tr.insert(pos, node);
                view.dispatch(transaction);
              })
              .catch((err) => {
                console.error('Image upload failed:', err);
              });

            return true;
          },
        },
      }),
    ];
  },
});
```

- [ ] **Step 2: Add ImageUpload to TiptapEditor**

Modify `src/components/editor/TiptapEditor.tsx` to:
1. Accept a `documentId` prop
2. Add `ImageUpload.configure({ documentId })` to the extensions array

- [ ] **Step 3: Commit**
```bash
git add src/components/editor/extensions/ src/components/editor/TiptapEditor.tsx
git commit -m "feat: add image upload extension for paste/drop in Tiptap"
```

---

## Task 9: Server-Side Markdown Conversion (TDD)

**Files:**
- Create: `src/lib/markdown.ts`
- Create: `src/lib/__tests__/markdown.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/__tests__/markdown.test.ts
import { describe, it, expect } from 'vitest';
import { tiptapJsonToMarkdown } from '@/lib/markdown';

describe('tiptapJsonToMarkdown', () => {
  it('converts heading to markdown', () => {
    const json = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello' }] },
      ],
    };
    const md = tiptapJsonToMarkdown(json);
    expect(md.trim()).toBe('# Hello');
  });

  it('converts paragraph with bold text', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'world' },
          ],
        },
      ],
    };
    const md = tiptapJsonToMarkdown(json);
    expect(md.trim()).toBe('Hello **world**');
  });

  it('converts bullet list', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }] },
          ],
        },
      ],
    };
    const md = tiptapJsonToMarkdown(json);
    expect(md).toContain('* Item 1');
    expect(md).toContain('* Item 2');
  });

  it('handles empty document', () => {
    const json = { type: 'doc', content: [] };
    const md = tiptapJsonToMarkdown(json);
    expect(md.trim()).toBe('');
  });

  it('converts string content (migration from textarea)', () => {
    const md = tiptapJsonToMarkdown('# Plain text content');
    expect(md).toContain('# Plain text content');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
```bash
npx vitest run src/lib/__tests__/markdown.test.ts
```

- [ ] **Step 3: Implement server-side conversion**

```typescript
// src/lib/markdown.ts
import { Node } from '@tiptap/pm/model';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';

// Schema for parsing Tiptap JSON into ProseMirror nodes (no DOM needed)
const schema = getSchema([
  StarterKit.configure({ codeBlock: false }),
  Table,
  TableRow,
  TableCell,
  TableHeader,
  Image,
  Link,
]);

/**
 * Convert Tiptap JSON (or plain string) to Markdown.
 * Used server-side when writing to git on state transitions.
 * Pure manual serializer — no DOM, no tiptap-markdown dependency.
 */
export function tiptapJsonToMarkdown(content: unknown): string {
  if (typeof content === 'string') return content;

  if (
    typeof content === 'object' &&
    content !== null &&
    Object.keys(content).length === 0
  ) {
    return '';
  }

  try {
    const doc = Node.fromJSON(schema, content);
    return serializeDoc(doc);
  } catch {
    return JSON.stringify(content, null, 2);
  }
}

function serializeDoc(doc: Node): string {
  const parts: string[] = [];

  doc.forEach((node) => {
    parts.push(serializeNode(node));
  });

  return parts.join('\n\n');
}

function serializeNode(node: Node): string {
  switch (node.type.name) {
    case 'heading': {
      const level = node.attrs.level as number;
      return `${'#'.repeat(level)} ${serializeInline(node)}`;
    }
    case 'paragraph':
      return serializeInline(node);
    case 'bulletList':
      return serializeList(node, '* ');
    case 'orderedList':
      return serializeList(node, '', true);
    case 'blockquote': {
      const inner: string[] = [];
      node.forEach((child) => inner.push(serializeNode(child)));
      return inner.map((line) => `> ${line}`).join('\n');
    }
    case 'codeBlock': {
      const lang = (node.attrs.language as string) || '';
      return `\`\`\`${lang}\n${node.textContent}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    case 'image':
      return `![${node.attrs.alt || ''}](${node.attrs.src})`;
    case 'table':
      return serializeTable(node);
    default:
      return node.textContent || '';
  }
}

function serializeInline(node: Node): string {
  const parts: string[] = [];
  node.forEach((child) => {
    let text = child.text || '';
    if (child.marks) {
      for (const mark of child.marks) {
        switch (mark.type.name) {
          case 'bold':
            text = `**${text}**`;
            break;
          case 'italic':
            text = `*${text}*`;
            break;
          case 'strike':
            text = `~~${text}~~`;
            break;
          case 'code':
            text = `\`${text}\``;
            break;
          case 'link':
            text = `[${text}](${mark.attrs.href})`;
            break;
        }
      }
    }
    parts.push(text);
  });
  return parts.join('');
}

function serializeList(node: Node, prefix: string, ordered = false): string {
  const items: string[] = [];
  let index = 1;
  node.forEach((item) => {
    const p = ordered ? `${index}. ` : prefix;
    const inner: string[] = [];
    item.forEach((child) => inner.push(serializeNode(child)));
    items.push(`${p}${inner.join('\n')}`);
    index++;
  });
  return items.join('\n');
}

function serializeTable(node: Node): string {
  const rows: string[][] = [];
  node.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      cells.push(cell.textContent || '');
    });
    rows.push(cells);
  });

  if (rows.length === 0) return '';

  const header = `| ${rows[0].join(' | ')} |`;
  const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
  const body = rows
    .slice(1)
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');

  return [header, separator, body].filter(Boolean).join('\n');
}
```

NOTE: This is a pure manual serializer that works in Node.js without DOM. It uses `@tiptap/pm/model` to parse the JSON into ProseMirror nodes, then serializes them to Markdown strings. The `tiptap-markdown` package is only used client-side (in TiptapEditor for mode conversion); the server-side code intentionally avoids it since it requires a full editor instance with DOM. The implementer should adjust the serializer if tests fail for edge cases.

- [ ] **Step 4: Run tests — expect PASS**
```bash
npx vitest run src/lib/__tests__/markdown.test.ts
```

- [ ] **Step 5: Commit**
```bash
git add src/lib/markdown.ts src/lib/__tests__/markdown.test.ts
git commit -m "feat: add server-side Tiptap JSON to Markdown conversion"
```

---

## Task 10: Integrate Editor into Document Page

**Files:**
- Modify: `src/app/documents/[id]/page.tsx`
- Modify: `src/hooks/useAutoSave.ts`

- [ ] **Step 1: Update useAutoSave to handle Tiptap JSON**

The existing `useAutoSave` already sends `content` as `unknown` to the PATCH endpoint, so it works with both strings and JSON. No code change needed — just verify.

- [ ] **Step 2: Replace textarea with TiptapEditor + ModeToggle**

Update `src/app/documents/[id]/page.tsx`:
- Import `TiptapEditor`, `MarkdownEditor`, `ModeToggle`
- Add `mode` state: `'richtext' | 'markdown'`
- When mode is `richtext`: show `<TiptapEditor>`
- When mode is `markdown`: show `<MarkdownEditor>`
- On mode toggle: convert content between formats
  - richtext → markdown: extract markdown from Tiptap editor via `editor.storage.markdown.getMarkdown()`
  - markdown → richtext: pass markdown string as content to TiptapEditor (tiptap-markdown auto-parses)
- Keep existing header, status badge, tags, save status, lock check

**Editor ref wiring:** The TiptapEditor component currently manages the editor internally. To support mode conversion, the page needs access to the editor instance. Two approaches:
1. **Recommended:** Add an `onEditorReady` callback prop to TiptapEditor that exposes the editor instance to the parent. The parent stores it in a ref and uses it for `getMarkdown()` during mode switch.
2. Alternative: Use `useImperativeHandle` + `forwardRef` to expose a `getMarkdown()` method.

```tsx
// In TiptapEditor, add:
interface TiptapEditorProps {
  // ... existing props
  onEditorReady?: (editor: Editor) => void;
}
// In useEditor's onCreate callback:
const editor = useEditor({
  // ...
  onCreate: ({ editor }) => { onEditorReady?.(editor); },
});

// In page.tsx:
const editorRef = useRef<Editor | null>(null);
// richtext → markdown:
const md = editorRef.current?.storage.markdown.getMarkdown() ?? '';
// markdown → richtext:
editorRef.current?.commands.setContent(markdownString);
```

The implementer should:
1. Read the current `page.tsx` (already shown above)
2. Add `onEditorReady` prop to TiptapEditor
3. Replace the `<textarea>` with the new editor components
4. Keep the `useAutoSave` integration (call `save(editor.getJSON())` on update)
5. Add mode toggle above the editor
6. Test that switching modes preserves content

- [ ] **Step 3: Verify the full flow**
```bash
npm run dev
# Visit a document page
# Verify: Rich Text editor renders, toolbar works
# Verify: Mode toggle switches between Rich Text and Markdown
# Verify: Auto-save works (Saving... → Saved indicator)
# Verify: Content persists on page refresh
```

- [ ] **Step 4: Run all tests**
```bash
npx vitest run
```

- [ ] **Step 5: Commit**
```bash
git add src/app/documents/[id]/page.tsx src/hooks/useAutoSave.ts
git commit -m "feat: replace textarea with Tiptap editor and Markdown mode"
```

---

## Task 11: Update HANDOFF.md

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Update HANDOFF.md**

Update the Phase Progress table:
- Phase 3: ✅ Done — permissions, member CRUD, edit locking
- Phase 4: ✅ Done — Tiptap editor, Markdown mode, image upload API, server-side conversion

Update Current State:
- Editor: Tiptap rich text with toolbar, CodeMirror 6 markdown mode, mode toggle
- Image upload API ready (needs R2 credentials in .env.local)
- Server-side Markdown conversion for git write operations

Update Next Step:
- Start Phase 5 (Document State Machine + Git Commit automation)

- [ ] **Step 2: Run all tests one final time**
```bash
npx vitest run
```

- [ ] **Step 3: Commit**
```bash
git add HANDOFF.md
git commit -m "docs: update HANDOFF.md — Phase 3-4 complete"
```
