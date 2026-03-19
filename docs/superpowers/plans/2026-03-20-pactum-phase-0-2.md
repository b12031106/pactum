# Pactum Phase 0-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working app skeleton with Google OAuth login, document CRUD, tag system, and git integration — the foundation for all subsequent features.

**Architecture:** Next.js App Router monolith with API Routes, PostgreSQL via Prisma ORM, simple-git for docs repo operations, JWT-based sessions via NextAuth.js.

**Tech Stack:** Next.js 15, TypeScript, Prisma, NextAuth.js, simple-git, async-mutex, shadcn/ui, Tailwind CSS, React Query, Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-pactum-mvp-design.md`

---

## File Map

### Phase 0 — Project Init
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `prisma/schema.prisma` | All 10 data models + indexes + relations |
| Create | `src/lib/prisma.ts` | Prisma client singleton (dev-safe) |
| Create | `src/lib/api-handler.ts` | ApiError class + apiHandler wrapper |
| Create | `src/lib/ulid.ts` | ULID generation helper |
| Create | `src/types/index.ts` | Shared TypeScript types |
| Create | `scripts/init-docs-repo.ts` | Initialize pactum-docs local git repo |
| Create | `.env.example` | All required env vars documented |
| Create | `HANDOFF.md` | Cross-session handoff document |
| Modify | `.gitignore` | Add docs-repo/, .env.local |
| Create | `src/instrumentation.ts` | Next.js server startup hooks (docs-repo init, lock cleanup) |

### Phase 1 — Authentication
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/auth.ts` | NextAuth config (Google OAuth, JWT, domain check, upsert) |
| Create | `src/app/api/auth/[...nextauth]/route.ts` | NextAuth route handler |
| Create | `src/middleware.ts` | Auth guard — redirect unauthenticated to /login |
| Create | `src/app/layout.tsx` | Root layout with SessionProvider + QueryClientProvider |
| Create | `src/app/login/page.tsx` | Login page with Google button |
| Create | `src/app/page.tsx` | Home redirect to /documents |
| Create | `src/components/layout/Header.tsx` | Top nav bar (avatar, name, logout) |
| Create | `src/lib/query-client.ts` | React Query client provider wrapper |

### Phase 2 — Document CRUD + Git
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/git.ts` | simple-git wrapper with mutex, commit, log, diff, push retry |
| Create | `src/app/api/documents/route.ts` | GET (list) + POST (create) |
| Create | `src/app/api/documents/[id]/route.ts` | GET (detail) + PATCH (update content) |
| Create | `src/app/documents/page.tsx` | Document list page |
| Create | `src/app/documents/new/page.tsx` | New document dialog/page |
| Create | `src/app/documents/[id]/page.tsx` | Document detail page (textarea for now) |
| Create | `src/components/documents/DocumentList.tsx` | List with cards |
| Create | `src/components/documents/DocumentCard.tsx` | Single document card |
| Create | `src/components/documents/StatusBadge.tsx` | draft/in_review/approved badge |
| Create | `src/components/documents/TagSelector.tsx` | Tag input (create/select tags) |
| Create | `src/components/documents/CreateDocumentDialog.tsx` | Modal for title + tags |

### Tests
| Action | File | Tests |
|--------|------|-------|
| Create | `src/lib/__tests__/ulid.test.ts` | ULID generation |
| Create | `src/lib/__tests__/api-handler.test.ts` | ApiError + apiHandler |
| — | ~~`src/lib/__tests__/permissions.test.ts`~~ | Moved to Phase 3 plan |
| Create | `src/lib/__tests__/git.test.ts` | Git operations (init, commit, log, diff) |

---

## Task 1: Next.js Project Scaffolding

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create Next.js project**

Since the directory already has files (PRD.md, docs/, .git), we need to create the Next.js project in a temp dir and move files in:

```bash
cd /Users/justinhsu/work/b12031106
npx create-next-app@latest pactum-temp --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

When prompted, accept defaults (yes to all).

- [ ] **Step 2: Move Next.js files into pactum directory (preserve existing files)**

```bash
# Back up existing .gitignore before copy
cp pactum/.gitignore /tmp/pactum-old-gitignore 2>/dev/null || true
# Copy everything from temp except .git
cp -r pactum-temp/. pactum/ 2>/dev/null || true
# Merge old .gitignore entries back
cat /tmp/pactum-old-gitignore >> pactum/.gitignore 2>/dev/null || true
# Clean up
rm -rf pactum-temp
cd /Users/justinhsu/work/b12031106/pactum
```

- [ ] **Step 3: Update .gitignore**

Add these lines to the existing `.gitignore`:

```
# Pactum
docs-repo/
.env.local
.env.*.local
```

- [ ] **Step 4: Create .env.example**

```bash
# .env.example
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/pactum?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# Google OAuth
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
ALLOWED_DOMAIN="yourcompany.com"

# Docs Repo
DOCS_REPO_PATH="./docs-repo"
DOCS_REPO_REMOTE=""

# Cloudflare R2 (Phase 4)
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME=""
R2_PUBLIC_URL=""

# Email (Phase 8)
EMAIL_FROM=""
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASS=""
```

- [ ] **Step 5: Install core dependencies**

```bash
npm install prisma @prisma/client next-auth@4 ulid simple-git async-mutex @tanstack/react-query
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom tsx
```

Note: Using next-auth@4 (v4 is stable with App Router support. v5 is beta). `@aws-sdk/client-s3` deferred to Phase 4 (image upload). `tsx` is for running TypeScript scripts directly.

- [ ] **Step 6: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 7: Add test script to package.json**

Add to `scripts` in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 8: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
```

Accept defaults (New York style, Zinc color, CSS variables).

- [ ] **Step 9: Install commonly needed shadcn components**

```bash
npx shadcn@latest add button input label dialog badge toast dropdown-menu avatar card separator
```

- [ ] **Step 10: Verify dev server starts**

```bash
npm run dev
# Visit http://localhost:3000 — should see default Next.js page
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with dependencies and shadcn/ui"
```

---

## Task 2: Prisma Schema + Database

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`

- [ ] **Step 1: Write Prisma schema**

Replace the default `prisma/schema.prisma` with the full schema from the design spec. The complete file:

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                String   @id @default(uuid()) @db.Uuid
  email             String   @unique
  name              String
  avatarUrl         String?  @map("avatar_url")
  notificationPrefs Json     @default("{\"inApp\": true, \"email\": true, \"slack\": false}") @map("notification_prefs")
  slackWebhookUrl   String?  @map("slack_webhook_url")
  createdAt         DateTime @default(now()) @map("created_at")

  createdDocuments    Document[]          @relation("DocumentCreator")
  lockedDocuments     Document[]          @relation("DocumentLocker")
  memberships         DocumentMember[]
  documentSignoffs    DocumentSignoff[]
  discussions         Discussion[]        @relation("DiscussionCreator")
  discussionComments  DiscussionComment[]
  discussionSignoffs  DiscussionSignoff[]
  resolvedDiscussions Discussion[]        @relation("DiscussionResolver")
  triggeredCommits    DocumentGitCommit[]
  notifications       Notification[]

  @@map("users")
}

model Document {
  id        String    @id                                          // ULID
  title     String
  content   Json      @default("{}")                               // Tiptap JSON
  status    String    @default("draft")                            // draft | in_review | approved
  mode      String    @default("doc")                              // doc | sbe (Phase 2)
  gitFile   String    @unique @map("git_file")                     // e.g. "01HZ...abc.md"
  createdBy String    @map("created_by") @db.Uuid
  lockedBy  String?   @map("locked_by") @db.Uuid
  lockedAt  DateTime? @map("locked_at")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  creator       User                @relation("DocumentCreator", fields: [createdBy], references: [id])
  locker        User?               @relation("DocumentLocker", fields: [lockedBy], references: [id])
  tags          DocumentTag[]
  members       DocumentMember[]
  signoffs      DocumentSignoff[]
  discussions   Discussion[]
  gitCommits    DocumentGitCommit[]
  notifications Notification[]

  @@index([status])
  @@index([createdBy])
  @@index([updatedAt(sort: Desc)])
  @@map("documents")
}

model DocumentTag {
  documentId String   @map("document_id")
  tag        String

  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@id([documentId, tag])
  @@index([tag])
  @@map("document_tags")
}

model DocumentMember {
  id         String   @id @default(uuid()) @db.Uuid
  documentId String   @map("document_id")
  userId     String   @map("user_id") @db.Uuid
  role       String                                                // editor | advisor | approver
  addedAt    DateTime @default(now()) @map("added_at")

  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id])

  @@unique([documentId, userId, role])
  @@index([userId])
  @@map("document_members")
}

model DocumentSignoff {
  id         String   @id @default(uuid()) @db.Uuid
  documentId String   @map("document_id")
  userId     String   @map("user_id") @db.Uuid
  signedAt   DateTime @default(now()) @map("signed_at")
  commitSha  String?  @map("commit_sha")

  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id])

  @@unique([documentId, userId])
  @@map("document_signoffs")
}

model Discussion {
  id         String    @id @default(uuid()) @db.Uuid
  documentId String    @map("document_id")
  createdBy  String    @map("created_by") @db.Uuid
  anchorType String    @map("anchor_type")                         // 'range' | 'line'
  anchorData Json      @map("anchor_data")                         // { from, to } or { lineNumber }
  status     String    @default("open")                            // open | resolved
  cta        String?                                               // no_change | need_change
  resolution String?                                               // AI-generated summary
  createdAt  DateTime  @default(now()) @map("created_at")
  resolvedAt DateTime? @map("resolved_at")
  resolvedBy String?   @map("resolved_by") @db.Uuid

  document Document            @relation(fields: [documentId], references: [id], onDelete: Cascade)
  creator  User                @relation("DiscussionCreator", fields: [createdBy], references: [id])
  resolver User?               @relation("DiscussionResolver", fields: [resolvedBy], references: [id])
  comments DiscussionComment[]
  signoffs DiscussionSignoff[]

  @@index([documentId, status])
  @@map("discussions")
}

model DiscussionComment {
  id           String   @id @default(uuid()) @db.Uuid
  discussionId String   @map("discussion_id") @db.Uuid
  authorId     String   @map("author_id") @db.Uuid
  content      String                                              // Markdown
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  discussion Discussion @relation(fields: [discussionId], references: [id], onDelete: Cascade)
  author     User       @relation(fields: [authorId], references: [id])

  @@map("discussion_comments")
}

model DiscussionSignoff {
  id           String   @id @default(uuid()) @db.Uuid
  discussionId String   @map("discussion_id") @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  signedAt     DateTime @default(now()) @map("signed_at")

  discussion Discussion @relation(fields: [discussionId], references: [id], onDelete: Cascade)
  user       User       @relation(fields: [userId], references: [id])

  @@unique([discussionId, userId])
  @@map("discussion_signoffs")
}

model DocumentGitCommit {
  id          String   @id @default(uuid()) @db.Uuid
  documentId  String   @map("document_id")
  commitSha   String   @map("commit_sha")
  eventType   String   @map("event_type")                          // create | review_started | discussion_resolved | approved | reopened
  summary     String                                               // commit message subject line
  triggeredBy String?  @map("triggered_by") @db.Uuid
  committedAt DateTime @default(now()) @map("committed_at")

  document Document @relation(fields: [documentId], references: [id])
  trigger  User?    @relation(fields: [triggeredBy], references: [id])

  @@map("document_git_commits")
}

model Notification {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  documentId String?  @map("document_id")
  type       String
  payload    Json     @default("{}")
  isRead     Boolean  @default(false) @map("is_read")
  createdAt  DateTime @default(now()) @map("created_at")

  user     User      @relation(fields: [userId], references: [id])
  document Document? @relation(fields: [documentId], references: [id])

  @@index([userId, isRead, createdAt(sort: Desc)])
  @@map("notifications")
}
```

- [ ] **Step 2: Create .env.local with real DATABASE_URL**

```bash
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL to your local PostgreSQL
# e.g. DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pactum?schema=public"
```

Ensure PostgreSQL is running locally. Create the database if needed:

```bash
createdb pactum
```

- [ ] **Step 3: Run Prisma migration**

```bash
npx prisma migrate dev --name init
```

Expected: migration created, all tables visible.

- [ ] **Step 4: Verify with Prisma Studio**

```bash
npx prisma studio
# Opens http://localhost:5555 — verify all 10 tables exist
```

- [ ] **Step 5: Create Prisma client singleton**

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 6: Commit**

```bash
git add prisma/ src/lib/prisma.ts .env.example
git commit -m "feat: add Prisma schema with all 10 data models and migration"
```

---

## Task 3: Shared Utilities (ApiError, ULID, Types)

**Files:**
- Create: `src/lib/api-handler.ts`
- Create: `src/lib/ulid.ts`
- Create: `src/types/index.ts`
- Create: `src/lib/__tests__/api-handler.test.ts`
- Create: `src/lib/__tests__/ulid.test.ts`

- [ ] **Step 1: Write failing test for ULID**

```typescript
// src/lib/__tests__/ulid.test.ts
import { describe, it, expect } from 'vitest';
import { generateDocumentId } from '@/lib/ulid';

describe('generateDocumentId', () => {
  it('returns a string of 26 characters (ULID format)', () => {
    const id = generateDocumentId();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateDocumentId()));
    expect(ids.size).toBe(100);
  });

  it('IDs are time-sortable (later > earlier)', () => {
    const id1 = generateDocumentId();
    const id2 = generateDocumentId();
    expect(id2 >= id1).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/ulid.test.ts
```

Expected: FAIL — `generateDocumentId` not found.

- [ ] **Step 3: Implement ULID**

```typescript
// src/lib/ulid.ts
import { ulid } from 'ulid';

export function generateDocumentId(): string {
  return ulid();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/ulid.test.ts
```

Expected: PASS

- [ ] **Step 5: Write failing test for ApiError + apiHandler**

```typescript
// src/lib/__tests__/api-handler.test.ts
import { describe, it, expect } from 'vitest';
import { ApiError, createErrorResponse } from '@/lib/api-handler';

describe('ApiError', () => {
  it('creates error with statusCode, code, and message', () => {
    const err = new ApiError(404, 'NOT_FOUND', 'Document not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Document not found');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('createErrorResponse', () => {
  it('formats ApiError into standard error JSON', () => {
    const err = new ApiError(409, 'DOCUMENT_LOCKED', 'Alice is editing');
    const result = createErrorResponse(err);
    expect(result).toEqual({
      status: 409,
      body: { error: { code: 'DOCUMENT_LOCKED', message: 'Alice is editing' } },
    });
  });

  it('formats unknown errors as 500 INTERNAL_ERROR', () => {
    const err = new Error('something broke');
    const result = createErrorResponse(err);
    expect(result).toEqual({
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/api-handler.test.ts
```

Expected: FAIL

- [ ] **Step 7: Implement ApiError + apiHandler**

```typescript
// src/lib/api-handler.ts
import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createErrorResponse(err: unknown): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  if (err instanceof ApiError) {
    return {
      status: err.statusCode,
      body: { error: { code: err.code, message: err.message } },
    };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
  };
}

type ApiRouteHandler = (req: Request, context?: { params: Promise<Record<string, string>> }) => Promise<NextResponse>;

export function apiHandler(fn: ApiRouteHandler): ApiRouteHandler {
  return async (req, context) => {
    try {
      return await fn(req, context);
    } catch (err) {
      const { status, body } = createErrorResponse(err);
      if (!(err instanceof ApiError)) {
        console.error('Unhandled API error:', err);
      }
      return NextResponse.json(body, { status });
    }
  };
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/api-handler.test.ts
```

Expected: PASS

- [ ] **Step 9: Create shared types**

```typescript
// src/types/index.ts
export type DocumentStatus = 'draft' | 'in_review' | 'approved';
export type DocumentMode = 'doc' | 'sbe';
export type MemberRole = 'editor' | 'advisor' | 'approver';
export type DocumentRole = 'creator' | 'editor' | 'advisor' | 'approver' | 'viewer';
export type DiscussionStatus = 'open' | 'resolved';
export type DiscussionCta = 'no_change' | 'need_change';
export type AnchorType = 'range' | 'line';

export interface RangeAnchor {
  from: number;
  to: number;
}

export interface LineAnchor {
  lineNumber: number;
}

export type AnchorData = RangeAnchor | LineAnchor;

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/ulid.ts src/lib/api-handler.ts src/types/index.ts src/lib/__tests__/
git commit -m "feat: add shared utilities — ULID, ApiError, types"
```

---

## Task 4: Git Operations Library

**Files:**
- Create: `src/lib/git.ts`
- Create: `scripts/init-docs-repo.ts`
- Create: `src/instrumentation.ts`
- Create: `src/lib/__tests__/git.test.ts`

- [ ] **Step 1: Write failing test for git operations**

```typescript
// src/lib/__tests__/git.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GitService } from '@/lib/git';

describe('GitService', () => {
  let tempDir: string;
  let gitService: GitService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pactum-test-'));
    gitService = new GitService(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('initializes a new git repo', async () => {
    await gitService.init();
    const { existsSync } = await import('fs');
    expect(existsSync(join(tempDir, '.git'))).toBe(true);
  });

  it('commits a file and returns commit SHA', async () => {
    await gitService.init();
    const sha = await gitService.commitFile(
      'test.md',
      '# Hello',
      'docs: create - test',
      { name: 'Test User', email: 'test@example.com' },
    );
    expect(sha).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it('gets log for a specific file', async () => {
    await gitService.init();
    await gitService.commitFile(
      'doc1.md',
      '# Doc 1',
      'docs: create - doc1',
      { name: 'Alice', email: 'alice@test.com' },
    );
    await gitService.commitFile(
      'doc1.md',
      '# Doc 1 Updated',
      'docs: update - doc1',
      { name: 'Bob', email: 'bob@test.com' },
    );

    const log = await gitService.getLog('doc1.md');
    expect(log).toHaveLength(2);
    expect(log[0].message).toBe('docs: update - doc1');
    expect(log[1].message).toBe('docs: create - doc1');
  });

  it('gets diff for a specific commit', async () => {
    await gitService.init();
    await gitService.commitFile(
      'doc.md',
      '# Original',
      'docs: create',
      { name: 'Alice', email: 'alice@test.com' },
    );
    const sha = await gitService.commitFile(
      'doc.md',
      '# Updated',
      'docs: update',
      { name: 'Alice', email: 'alice@test.com' },
    );

    const diff = await gitService.getDiff(sha, 'doc.md');
    expect(diff).toContain('-# Original');
    expect(diff).toContain('+# Updated');
  });

  it('appends metadata comment to file', async () => {
    await gitService.init();
    await gitService.commitFile(
      'doc.md',
      '# Content',
      'docs: create',
      { name: 'Alice', email: 'alice@test.com' },
    );

    await gitService.appendMetadataComment('doc.md', 'approved', 'alice@test.com');
    const content = readFileSync(join(tempDir, 'doc.md'), 'utf-8');
    expect(content).toContain('<!-- pactum:approved');
    expect(content).toContain('alice@test.com');
  });

  it('serializes concurrent operations via mutex', async () => {
    await gitService.init();
    const results = await Promise.all([
      gitService.commitFile('a.md', '# A', 'create a', { name: 'A', email: 'a@test.com' }),
      gitService.commitFile('b.md', '# B', 'create b', { name: 'B', email: 'b@test.com' }),
    ]);
    expect(results[0]).toBeTruthy();
    expect(results[1]).toBeTruthy();
    // Both should succeed without git lock errors
    const logA = await gitService.getLog('a.md');
    const logB = await gitService.getLog('b.md');
    expect(logA).toHaveLength(1);
    expect(logB).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/git.test.ts
```

Expected: FAIL — `GitService` not found.

- [ ] **Step 3: Implement GitService**

```typescript
// src/lib/git.ts
import simpleGit, { SimpleGit } from 'simple-git';
import { Mutex } from 'async-mutex';
import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

interface GitAuthor {
  name: string;
  email: string;
}

interface GitLogEntry {
  sha: string;
  message: string;
  author: string;
  email: string;
  date: string;
  body: string;
}

const pushRetryQueue: Array<{ sha: string; retries: number }> = [];
const MAX_PUSH_RETRIES = 5;

export class GitService {
  private git: SimpleGit;
  private mutex = new Mutex();
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  async init(): Promise<void> {
    if (!existsSync(join(this.repoPath, '.git'))) {
      await this.git.init();
      // Configure defaults for the repo
      await this.git.addConfig('user.name', 'Pactum System');
      await this.git.addConfig('user.email', 'system@pactum.local');
    }
  }

  async cloneOrInit(remoteUrl?: string): Promise<void> {
    if (existsSync(join(this.repoPath, '.git'))) return;
    if (remoteUrl) {
      await simpleGit().clone(remoteUrl, this.repoPath);
    } else {
      await this.init();
    }
  }

  async commitFile(
    fileName: string,
    content: string,
    message: string,
    author: GitAuthor,
    body?: string,
  ): Promise<string> {
    return this.mutex.runExclusive(async () => {
      const filePath = join(this.repoPath, fileName);
      writeFileSync(filePath, content, 'utf-8');
      await this.git.add(fileName);

      const fullMessage = body ? `${message}\n\n${body}` : message;
      const result = await this.git.commit(fullMessage, [fileName], {
        '--author': `${author.name} <${author.email}>`,
      });

      const sha = result.commit;
      this.pushAsync();
      return sha;
    });
  }

  async appendMetadataComment(
    fileName: string,
    eventType: string,
    email: string,
  ): Promise<void> {
    const filePath = join(this.repoPath, fileName);
    const timestamp = new Date().toISOString();
    const comment = `\n<!-- pactum:${eventType} ${timestamp} by ${email} -->`;
    appendFileSync(filePath, comment, 'utf-8');
  }

  async commitWithMetadata(
    fileName: string,
    eventType: string,
    message: string,
    author: GitAuthor,
    body?: string,
  ): Promise<string> {
    return this.mutex.runExclusive(async () => {
      await this.appendMetadataComment(fileName, eventType, author.email);
      await this.git.add(fileName);

      const fullMessage = body ? `${message}\n\n${body}` : message;
      const result = await this.git.commit(fullMessage, [fileName], {
        '--author': `${author.name} <${author.email}>`,
      });

      const sha = result.commit;
      this.pushAsync();
      return sha;
    });
  }

  async getLog(fileName: string): Promise<GitLogEntry[]> {
    return this.mutex.runExclusive(async () => {
      const log = await this.git.log({ file: fileName });
      return log.all.map((entry) => ({
        sha: entry.hash,
        message: entry.message,
        author: entry.author_name,
        email: entry.author_email,
        date: entry.date,
        body: entry.body,
      }));
    });
  }

  async getDiff(sha: string, fileName: string): Promise<string> {
    return this.mutex.runExclusive(async () => {
      try {
        return await this.git.diff([`${sha}^..${sha}`, '--', fileName]);
      } catch {
        // First commit has no parent — diff against empty tree
        return await this.git.diff([
          '4b825dc642cb6eb9a060e54bf899d15363da7f63',
          sha,
          '--',
          fileName,
        ]);
      }
    });
  }

  async readFile(fileName: string): Promise<string | null> {
    const filePath = join(this.repoPath, fileName);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf-8');
  }

  private pushAsync(): void {
    // Only push if remote is configured
    this.git.getRemotes().then((remotes) => {
      if (remotes.length > 0) {
        this.git.push().catch((err) => {
          console.error('Git push failed, queued for retry:', err.message);
          pushRetryQueue.push({ sha: 'latest', retries: 0 });
        });
      }
    }).catch(() => {
      // No remotes configured — skip push
    });
  }

  async retryFailedPushes(): Promise<void> {
    const pending = [...pushRetryQueue];
    pushRetryQueue.length = 0;

    for (const item of pending) {
      if (item.retries >= MAX_PUSH_RETRIES) {
        console.error(`Git push abandoned after ${MAX_PUSH_RETRIES} retries`);
        continue;
      }
      try {
        await this.git.push();
      } catch {
        pushRetryQueue.push({ sha: item.sha, retries: item.retries + 1 });
      }
    }
  }
}

// Singleton for the docs repo
let _docsGit: GitService | null = null;

export function getDocsGitService(): GitService {
  if (!_docsGit) {
    const repoPath = process.env.DOCS_REPO_PATH || './docs-repo';
    _docsGit = new GitService(repoPath);
  }
  return _docsGit;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/git.test.ts
```

Expected: PASS

- [ ] **Step 5: Create init-docs-repo script**

```typescript
// scripts/init-docs-repo.ts
import { GitService } from '../src/lib/git';

async function main() {
  const repoPath = process.env.DOCS_REPO_PATH || './docs-repo';
  const remoteUrl = process.env.DOCS_REPO_REMOTE || undefined;

  console.log(`Initializing docs repo at: ${repoPath}`);
  const git = new GitService(repoPath);
  await git.cloneOrInit(remoteUrl);
  console.log('Docs repo ready.');
}

main().catch((err) => {
  console.error('Failed to init docs repo:', err);
  process.exit(1);
});
```

Add a package.json script to run it:

```json
"init-docs-repo": "tsx scripts/init-docs-repo.ts"
```

Run with: `npm run init-docs-repo`

- [ ] **Step 6: Create instrumentation.ts**

```typescript
// src/instrumentation.ts
export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getDocsGitService } = await import('@/lib/git');

    // Initialize docs repo
    const git = getDocsGitService();
    try {
      await git.cloneOrInit(process.env.DOCS_REPO_REMOTE || undefined);
      console.log('[Pactum] Docs repo initialized');
    } catch (err) {
      console.error('[Pactum] Failed to initialize docs repo:', err);
      process.exit(1);
    }

    // Background task: clean up expired edit locks every 5 minutes
    const { prisma } = await import('@/lib/prisma');
    setInterval(async () => {
      try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const result = await prisma.document.updateMany({
          where: {
            lockedBy: { not: null },
            lockedAt: { lt: tenMinutesAgo },
          },
          data: {
            lockedBy: null,
            lockedAt: null,
          },
        });
        if (result.count > 0) {
          console.log(`[Pactum] Cleaned up ${result.count} expired edit lock(s)`);
        }
      } catch (err) {
        console.error('[Pactum] Lock cleanup error:', err);
      }
    }, 5 * 60 * 1000);

    // Background task: retry failed git pushes every 30 seconds
    setInterval(async () => {
      try {
        await git.retryFailedPushes();
      } catch (err) {
        console.error('[Pactum] Push retry error:', err);
      }
    }, 30 * 1000);
  }
}
```

- [ ] **Step 7: Verify instrumentation auto-detection**

Next.js 15+ automatically detects `src/instrumentation.ts` — no config changes needed. Verify by starting the dev server and checking for the `[Pactum] Docs repo initialized` log message.

```bash
npm run dev
# Look for: [Pactum] Docs repo initialized
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/git.ts src/lib/__tests__/git.test.ts scripts/ src/instrumentation.ts next.config.ts
git commit -m "feat: add git operations library with mutex, push retry, and server startup hooks"
```

---

## Task 5: NextAuth Authentication

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: Create auth configuration**

```typescript
// src/lib/auth.ts
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ profile }) {
      // Restrict to company domain
      const allowedDomain = process.env.ALLOWED_DOMAIN;
      if (allowedDomain && (profile as { hd?: string })?.hd !== allowedDomain) {
        return false;
      }
      return true;
    },
    async jwt({ token, user, profile }) {
      if (user && profile) {
        // Upsert user on first login
        const dbUser = await prisma.user.upsert({
          where: { email: profile.email! },
          update: {
            name: profile.name || user.name || '',
            avatarUrl: (profile as { picture?: string }).picture || user.image,
          },
          create: {
            email: profile.email!,
            name: profile.name || user.name || '',
            avatarUrl: (profile as { picture?: string }).picture || user.image,
          },
        });
        token.userId = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      return session;
    },
  },
};
```

- [ ] **Step 2: Create NextAuth route handler**

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 3: Create middleware for auth guard**

```typescript
// src/middleware.ts
import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: [
    // Protect all routes except login, api/auth, and static files
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

- [ ] **Step 4: Create login page**

```tsx
// src/app/login/page.tsx
'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Pactum</h1>
          <p className="mt-2 text-muted-foreground">
            Git-based document collaboration
          </p>
        </div>
        <Button
          size="lg"
          className="w-full"
          onClick={() => signIn('google', { callbackUrl: '/documents' })}
        >
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add NEXTAUTH_SECRET to .env.local**

```bash
# Generate a secret
openssl rand -base64 32
# Add to .env.local:
# NEXTAUTH_SECRET="<generated-value>"
# NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/ src/middleware.ts src/app/login/
git commit -m "feat: add Google OAuth authentication with domain restriction"
```

---

## Task 6: Root Layout + QueryClient + Header

**Files:**
- Create: `src/lib/query-client.ts`
- Modify: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/components/layout/Header.tsx`

- [ ] **Step 1: Create QueryClient provider**

```tsx
// src/lib/query-client.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

- [ ] **Step 2: Create Header component**

```tsx
// src/components/layout/Header.tsx
'use client';

import { signOut, useSession } from 'next-auth/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';

export function Header() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  const initials = session.user.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="border-b">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/documents" className="text-lg font-bold">
          Pactum
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={session.user.image || undefined} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="flex items-center gap-2 p-2">
              <div className="text-sm font-medium">{session.user.name}</div>
            </div>
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create Providers wrapper (client component)**

`SessionProvider` and `QueryProvider` are client components. They must be in a separate `'use client'` file — not in `layout.tsx` which is a server component (because it exports `metadata`).

```tsx
// src/components/Providers.tsx
'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryProvider } from '@/lib/query-client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>{children}</QueryProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 4: Update root layout**

Replace `src/app/layout.tsx`:

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Header } from '@/components/layout/Header';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Pactum',
  description: 'Git-based document collaboration',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body className={inter.className}>
        <Providers>
          <Header />
          <main className="container py-6">{children}</main>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Create home page redirect**

```tsx
// src/app/page.tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/documents');
}
```

- [ ] **Step 6: Verify dev server compiles**

```bash
npm run dev
# Check for compilation errors in terminal
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/query-client.tsx src/components/Providers.tsx src/components/layout/Header.tsx src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add root layout with SessionProvider, QueryClient, and Header"
```

---

## Task 7: Document API — Create + List

**Files:**
- Create: `src/app/api/documents/route.ts`

- [ ] **Step 1: Implement POST /api/documents (create) and GET /api/documents (list)**

```typescript
// src/app/api/documents/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateDocumentId } from '@/lib/ulid';
import { getDocsGitService } from '@/lib/git';
import { apiHandler, ApiError } from '@/lib/api-handler';

// POST /api/documents — Create document
export const POST = apiHandler(async (req) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const body = await req.json();
  const { title, tags } = body as { title: string; tags?: string[] };

  if (!title?.trim()) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Title is required');
  }

  const id = generateDocumentId();
  const gitFile = `${id}.md`;

  // Create document in DB
  const document = await prisma.document.create({
    data: {
      id,
      title: title.trim(),
      gitFile,
      createdBy: session.user.id,
      tags: tags?.length
        ? { create: tags.map((tag: string) => ({ tag: tag.trim() })) }
        : undefined,
    },
    include: { tags: true, creator: true },
  });

  // Create file in docs repo + initial commit
  const git = getDocsGitService();
  const initialContent = `# ${title.trim()}\n`;
  const sha = await git.commitFile(
    gitFile,
    initialContent,
    `docs: create - ${title.trim()}`,
    { name: session.user.name, email: session.user.email },
  );

  // Record git commit
  await prisma.documentGitCommit.create({
    data: {
      documentId: id,
      commitSha: sha,
      eventType: 'create',
      summary: `docs: create - ${title.trim()}`,
      triggeredBy: session.user.id,
    },
  });

  return NextResponse.json({ data: document }, { status: 201 });
});

// GET /api/documents — List documents
export const GET = apiHandler(async (req) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const tag = searchParams.get('tag');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  if (tag) {
    // Support multiple tags (comma-separated, AND logic — document must have ALL tags)
    const tags = tag.split(',').map((t) => t.trim());
    where.AND = tags.map((t) => ({ tags: { some: { tag: t } } }));
  }

  if (search) {
    where.title = { contains: search, mode: 'insensitive' };
  }

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        tags: true,
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.document.count({ where }),
  ]);

  return NextResponse.json({
    data: documents,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});
```

- [ ] **Step 2: Verify API compiles**

```bash
npm run dev
# Check no compilation errors
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/documents/route.ts
git commit -m "feat: add document create and list API endpoints"
```

---

## Task 8: Document API — Detail + Update

**Files:**
- Create: `src/app/api/documents/[id]/route.ts`

- [ ] **Step 1: Implement GET /api/documents/:id and PATCH /api/documents/:id**

```typescript
// src/app/api/documents/[id]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

// GET /api/documents/:id — Document detail
export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      tags: true,
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      },
      signoffs: {
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      },
      locker: { select: { id: true, name: true } },
    },
  });

  if (!document) {
    throw new ApiError(404, 'NOT_FOUND', 'Document not found');
  }

  return NextResponse.json({ data: document });
});

// PATCH /api/documents/:id — Update document content
export const PATCH = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: { discussions: { where: { status: 'open', cta: 'need_change' } } },
  });

  if (!document) {
    throw new ApiError(404, 'NOT_FOUND', 'Document not found');
  }

  // Check edit permission: draft always allowed, in_review only with need_change
  const isCreator = document.createdBy === session.user.id;
  const membership = await prisma.documentMember.findMany({
    where: { documentId: id, userId: session.user.id, role: 'editor' },
  });
  const canEdit = isCreator || membership.length > 0;

  if (!canEdit) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have edit permission');
  }

  if (document.status === 'approved') {
    throw new ApiError(409, 'INVALID_STATUS', 'Cannot edit an approved document');
  }

  if (document.status === 'in_review') {
    // Only allow if there's a need_change discussion
    const hasNeedChange = document.discussions.length > 0;
    if (!hasNeedChange) {
      throw new ApiError(409, 'INVALID_STATUS', 'Cannot edit during review without a need_change discussion');
    }
  }

  // Check lock
  if (document.lockedBy && document.lockedBy !== session.user.id) {
    const locker = await prisma.user.findUnique({ where: { id: document.lockedBy } });
    throw new ApiError(409, 'DOCUMENT_LOCKED', `${locker?.name || 'Someone'} is currently editing`);
  }

  const body = await req.json();
  const { content, title, anchorUpdates } = body as {
    content?: unknown;
    title?: string;
    anchorUpdates?: Array<{ discussionId: string; from?: number; to?: number; anchor?: null }>;
  };

  const updateData: Record<string, unknown> = {};
  if (content !== undefined) updateData.content = content;
  if (title !== undefined) updateData.title = title;

  // Update document + anchor positions in one transaction
  const updated = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.update({
      where: { id },
      data: updateData,
      include: {
        tags: true,
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    // Update discussion anchors if provided
    if (anchorUpdates?.length) {
      for (const update of anchorUpdates) {
        if (update.anchor === null) {
          // Anchor invalidated
          await tx.discussion.update({
            where: { id: update.discussionId },
            data: { anchorData: { invalid: true } },
          });
        } else if (update.from !== undefined && update.to !== undefined) {
          await tx.discussion.update({
            where: { id: update.discussionId },
            data: { anchorData: { from: update.from, to: update.to } },
          });
        }
      }
    }

    return doc;
  });

  return NextResponse.json({ data: updated });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/documents/[id]/route.ts
git commit -m "feat: add document detail and update API endpoints"
```

---

## Task 9: Document List Frontend

**Files:**
- Create: `src/components/documents/StatusBadge.tsx`
- Create: `src/components/documents/DocumentCard.tsx`
- Create: `src/components/documents/DocumentList.tsx`
- Create: `src/app/documents/page.tsx`

- [ ] **Step 1: Create StatusBadge**

```tsx
// src/components/documents/StatusBadge.tsx
import { Badge } from '@/components/ui/badge';
import type { DocumentStatus } from '@/types';

const statusConfig: Record<DocumentStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  in_review: { label: 'In Review', variant: 'default' },
  approved: { label: 'Approved', variant: 'outline' },
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const config = statusConfig[status] || statusConfig.draft;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

- [ ] **Step 2: Create DocumentCard**

```tsx
// src/components/documents/DocumentCard.tsx
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from './StatusBadge';
import type { DocumentStatus } from '@/types';

interface DocumentCardProps {
  id: string;
  title: string;
  status: DocumentStatus;
  tags: Array<{ tag: string }>;
  creator: { name: string; avatarUrl?: string | null };
  updatedAt: string;
}

export function DocumentCard({ id, title, status, tags, creator, updatedAt }: DocumentCardProps) {
  return (
    <Link href={`/documents/${id}`}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base">{title}</CardTitle>
            <StatusBadge status={status} />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map(({ tag }) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{creator.name}</span>
            <span>{new Date(updatedAt).toLocaleDateString('zh-TW')}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 3: Create DocumentList**

```tsx
// src/components/documents/DocumentList.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { DocumentCard } from './DocumentCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';
import type { DocumentStatus } from '@/types';

interface Document {
  id: string;
  title: string;
  status: DocumentStatus;
  tags: Array<{ tag: string }>;
  creator: { name: string; avatarUrl?: string | null };
  updatedAt: string;
}

async function fetchDocuments(params: {
  search?: string;
  status?: string;
  page?: number;
}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));

  const res = await fetch(`/api/documents?${query}`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

export function DocumentList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['documents', { search, status: statusFilter }],
    queryFn: () => fetchDocuments({ search, status: statusFilter }),
  });

  const documents: Document[] = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input
          placeholder="Search by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              {statusFilter || 'All Status'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setStatusFilter('')}>All</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('draft')}>Draft</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('in_review')}>In Review</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('approved')}>Approved</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No documents found</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} {...doc} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create documents list page**

```tsx
// src/app/documents/page.tsx
import { DocumentList } from '@/components/documents/DocumentList';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documents</h1>
        <Link href="/documents/new">
          <Button>New Document</Button>
        </Link>
      </div>
      <DocumentList />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/documents/ src/app/documents/page.tsx
git commit -m "feat: add document list page with search and status filter"
```

---

## Task 10: Create Document Page

**Files:**
- Create: `src/components/documents/TagSelector.tsx`
- Create: `src/components/documents/CreateDocumentDialog.tsx`
- Create: `src/app/documents/new/page.tsx`

- [ ] **Step 1: Create TagSelector**

```tsx
// src/components/documents/TagSelector.tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useState, KeyboardEvent } from 'react';

interface TagSelectorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagSelector({ tags, onChange }: TagSelectorProps) {
  const [input, setInput] = useState('');

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="cursor-pointer"
            onClick={() => removeTag(tag)}
          >
            {tag} &times;
          </Badge>
        ))}
      </div>
      <Input
        placeholder="Type tag and press Enter..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create new document page**

```tsx
// src/app/documents/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { TagSelector } from '@/components/documents/TagSelector';

export default function NewDocumentPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), tags }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to create document');
      }

      const { data: document } = await res.json();
      router.push(`/documents/${document.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>New Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Document title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Tags (optional)</Label>
              <TagSelector tags={tags} onChange={setTags} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/documents/TagSelector.tsx src/app/documents/new/
git commit -m "feat: add new document page with title and tag input"
```

---

## Task 11: Document Detail Page (Textarea MVP)

**Files:**
- Create: `src/app/documents/[id]/page.tsx`
- Create: `src/hooks/useAutoSave.ts`
- Create: `src/hooks/useDebounce.ts`

- [ ] **Step 1: Create useDebounce hook**

```typescript
// src/hooks/useDebounce.ts
import { useEffect, useRef, useCallback } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callback(...args), delay);
    },
    [callback, delay],
  );
}
```

- [ ] **Step 2: Create useAutoSave hook**

```typescript
// src/hooks/useAutoSave.ts
'use client';

import { useState, useCallback } from 'react';
import { useDebouncedCallback } from './useDebounce';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useAutoSave(documentId: string) {
  const [status, setStatus] = useState<SaveStatus>('idle');

  const save = useCallback(
    async (content: unknown) => {
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
    },
    [documentId],
  );

  const debouncedSave = useDebouncedCallback(save, 2000);

  return { status, save: debouncedSave, saveImmediate: save };
}
```

- [ ] **Step 3: Create document detail page (textarea placeholder for editor)**

```tsx
// src/app/documents/[id]/page.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useAutoSave } from '@/hooks/useAutoSave';
import { StatusBadge } from '@/components/documents/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';

async function fetchDocument(id: string) {
  const res = await fetch(`/api/documents/${id}`);
  if (!res.ok) throw new Error('Failed to fetch document');
  return res.json();
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => fetchDocument(id),
  });
  const { status: saveStatus, save } = useAutoSave(id);
  const [content, setContent] = useState('');

  const document = data?.data;

  useEffect(() => {
    if (document?.content) {
      // For textarea MVP: store as plain text
      // Will be replaced by Tiptap JSON in Phase 4
      const text =
        typeof document.content === 'string'
          ? document.content
          : JSON.stringify(document.content) === '{}'
            ? ''
            : JSON.stringify(document.content, null, 2);
      setContent(text);
    }
  }, [document?.content]);

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  if (!document) {
    return <div className="text-center py-8 text-muted-foreground">Document not found</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{document.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={document.status} />
            {document.tags?.map(({ tag }: { tag: string }) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Created by {document.creator.name}
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && 'Saved'}
          {saveStatus === 'error' && 'Save failed'}
        </div>
      </div>

      <Separator />

      {/* Editor (textarea placeholder — replaced by Tiptap in Phase 4) */}
      <textarea
        className="w-full min-h-[500px] rounded-md border p-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          save(e.target.value);
        }}
        placeholder="Start writing..."
        disabled={document.status === 'approved'}
      />

      {/* NOTE: This textarea MVP stores content as a plain string in the DB JSON column.
          Phase 4 (Tiptap) will replace this with proper Tiptap JSON.
          Migration strategy: on first Tiptap load, if content is a string,
          convert it to Tiptap JSON via editor.commands.setContent(string). */}
    </div>
  );
}
```

- [ ] **Step 4: Verify the full flow works**

```bash
npm run dev
# 1. Visit http://localhost:3000 → should redirect to /login
# 2. (If Google OAuth not configured yet, temporarily set ALLOWED_DOMAIN="" to bypass)
# 3. After login → /documents (empty list)
# 4. Click "New Document" → enter title + tags → Create
# 5. Redirected to document detail → textarea works
# 6. Type text → auto-save indicator shows "Saving..." → "Saved"
# 7. Go back to /documents → document appears in list
# 8. Check docs-repo/ has the .md file with initial commit
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/ src/app/documents/[id]/
git commit -m "feat: add document detail page with auto-save textarea"
```

---

## Task 12: HANDOFF.md + Run All Tests + Final Commit

**Files:**
- Create: `HANDOFF.md`

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Create HANDOFF.md**

```markdown
# Pactum — Handoff Document

## Overview
Pactum is a Git-based document collaboration tool. PRD at `./PRD.md`. Design spec at `docs/superpowers/specs/2026-03-20-pactum-mvp-design.md`.

## Tech Decisions
- Next.js App Router (single project, API routes instead of separate backend)
- PostgreSQL + Prisma ORM (JWT sessions, no DB session table)
- simple-git + async-mutex for git operations on local docs-repo
- React Query + Context for frontend state
- Tiptap + CodeMirror 6 for editor (Phase 4)
- SSE for real-time notifications (Phase 8)

## Phase Progress
| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Project Init | ✅ Done | Next.js + Prisma + shadcn/ui + git lib |
| Phase 1: Auth | ✅ Done | Google OAuth + JWT + middleware guard |
| Phase 2: Document CRUD | ✅ Done | Create, list, detail, auto-save, git commit |
| Phase 3: Roles & Locking | ⏳ Pending | |
| Phase 4: Tiptap Editor | ⏳ Pending | |
| Phase 5: State Machine | ⏳ Pending | |
| Phase 6: Discussions | ⏳ Pending | |
| Phase 7: Git Diff Viewer | ⏳ Pending | |
| Phase 8: Notifications | ⏳ Pending | |
| Phase 9: @Mention + Polish | ⏳ Pending | |

## Current State
- Dev server: `npm run dev` works
- DB: All 10 tables created via Prisma migration
- Auth: Google OAuth configured (needs GOOGLE_CLIENT_ID/SECRET in .env.local)
- Documents: Can create, list, view, edit (textarea), auto-save to DB
- Git: Initial commit on document create, docs-repo initialized on server start
- Tests: vitest configured, tests for ULID, ApiError, GitService

## Key Files
- `prisma/schema.prisma` — all data models
- `src/lib/git.ts` — GitService with mutex
- `src/lib/auth.ts` — NextAuth config
- `src/lib/api-handler.ts` — ApiError + apiHandler
- `src/instrumentation.ts` — server startup hooks (docs-repo init, lock cleanup, push retry)

## Next Step
Start Phase 3 (Roles & Permissions + Edit Locking). Plan: `docs/superpowers/plans/2026-03-20-pactum-phase-0-2.md` (tasks done). Next plan to be created for Phase 3-4.

Tasks:
1. Create `src/lib/permissions.ts` with getDocumentRoles, permission functions
2. Create member CRUD API endpoints
3. Create lock acquire/release API endpoints
4. Create `src/hooks/useEditLock.ts`
5. Create `MemberManager.tsx` component

## Known Issues
- [ ] Google OAuth Client ID needs to be created in Google Cloud Console
- [ ] ALLOWED_DOMAIN env var needs to be set to company domain
- [ ] docs-repo remote (DOCS_REPO_REMOTE) not configured — commits are local only
```

- [ ] **Step 3: Final commit**

```bash
git add HANDOFF.md
git commit -m "docs: add HANDOFF.md for cross-session continuity"
```

- [ ] **Step 4: Verify everything works end-to-end**

```bash
# Run tests
npx vitest run

# Start dev server
npm run dev

# Verify:
# - /login page renders
# - /documents shows empty list (or redirects to login)
# - Creating a document works
# - docs-repo/ contains .md file with git log
```
