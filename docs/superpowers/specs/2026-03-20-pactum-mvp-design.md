# Pactum MVP — Technical Design Spec

**Version**: 1.0.0
**Date**: 2026-03-20
**Status**: Approved (brainstorming complete)
**PRD**: `./PRD.md`
**Plan**: `~/.claude/plans/synchronous-orbiting-thacker.md`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Layer](#2-data-layer)
3. [Git Operations Layer](#3-git-operations-layer)
4. [Authentication & Permissions](#4-authentication--permissions)
5. [Editor Architecture](#5-editor-architecture)
6. [Document State Machine & Sign-off](#6-document-state-machine--sign-off)
7. [Discussion System](#7-discussion-system)
8. [Notification System & SSE](#8-notification-system--sse)
9. [API Response Format & Error Handling](#9-api-response-format--error-handling)
10. [Design Decisions Log](#10-design-decisions-log)

---

## 1. Architecture Overview

### Deployment Model

Long-running Node.js process (`next start` on VPS or Mac mini). NOT serverless.

This enables:
- In-memory mutex lock for git operations
- SSE long-lived connections for real-time notifications
- Background tasks (edit lock cleanup, push retry queue)
- Local filesystem access for docs-repo git operations

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js App Router (pages + API routes in one project) |
| Language | TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth.js (Google OAuth, JWT strategy) |
| Editor | Tiptap (Rich Text) + CodeMirror 6 (Markdown) |
| Git | simple-git + async-mutex |
| Image Storage | Cloudflare R2 (@aws-sdk/client-s3) |
| UI Components | shadcn/ui + Tailwind CSS |
| State Management | React Query (TanStack Query) + React Context |
| Notifications | SSE (in-app) + nodemailer (email) + Slack Incoming Webhook |

### Project Structure

```
pactum/
├── prisma/schema.prisma
├── src/
│   ├── app/
│   │   ├── api/auth/[...nextauth]/route.ts
│   │   ├── api/documents/...
│   │   ├── api/discussions/...
│   │   ├── api/upload/image/route.ts
│   │   ├── api/notifications/...
│   │   ├── api/users/me/...
│   │   ├── documents/...
│   │   ├── settings/page.tsx
│   │   └── login/page.tsx
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── prisma.ts
│   │   ├── git.ts
│   │   ├── markdown.ts
│   │   ├── r2.ts
│   │   ├── notifications.ts
│   │   ├── email.ts
│   │   ├── slack.ts
│   │   ├── permissions.ts
│   │   ├── api-handler.ts
│   │   └── ulid.ts
│   ├── components/
│   │   ├── editor/
│   │   ├── discussions/
│   │   ├── documents/
│   │   ├── history/
│   │   ├── notifications/
│   │   └── ui/
│   ├── hooks/
│   │   ├── useAutoSave.ts
│   │   ├── useEditLock.ts
│   │   ├── useSSE.ts
│   │   └── useDebounce.ts
│   └── types/index.ts
├── scripts/init-docs-repo.ts
└── docs-repo/                    # .gitignore'd
```

---

## 2. Data Layer

### Prisma Models (Complete)

**NextAuth strategy:** JWT session (no DB session table). `users` table only; upsert in `signIn` callback. DB user ID stored in JWT token.

```prisma
model User {
  id              String   @id @default(uuid()) @db.Uuid
  email           String   @unique
  name            String
  avatarUrl       String?
  notificationPrefs Json   @default("{\"inApp\": true, \"email\": true, \"slack\": false}")
  slackWebhookUrl String?
  createdAt       DateTime @default(now())

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
}

model Document {
  id         String    @id                        // ULID
  title      String
  content    Json      @default("{}")             // Tiptap JSON document
  status     String    @default("draft")          // draft | in_review | approved
  mode       String    @default("doc")            // doc | sbe (Phase 2)
  gitFile    String    @unique                    // e.g. "01HZ...abc.md"
  createdBy  String    @db.Uuid
  lockedBy   String?   @db.Uuid
  lockedAt   DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  creator    User      @relation("DocumentCreator", fields: [createdBy], references: [id])
  locker     User?     @relation("DocumentLocker", fields: [lockedBy], references: [id])
  tags       DocumentTag[]
  members    DocumentMember[]
  signoffs   DocumentSignoff[]
  discussions Discussion[]
  gitCommits DocumentGitCommit[]
  notifications Notification[]

  @@index([status])
  @@index([createdBy])
  @@index([updatedAt(sort: Desc)])
}

model DocumentTag {
  documentId String   @map("document_id")
  tag        String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@id([documentId, tag])
  @@index([tag])
}

model DocumentMember {
  id         String   @id @default(uuid()) @db.Uuid
  documentId String   @map("document_id")
  userId     String   @db.Uuid
  role       String                                // editor | advisor | approver
  addedAt    DateTime @default(now())

  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id])

  @@unique([documentId, userId, role])             // same user can have multiple roles
  @@index([userId])
}

model DocumentSignoff {
  id         String   @id @default(uuid()) @db.Uuid
  documentId String   @map("document_id")
  userId     String   @db.Uuid
  signedAt   DateTime @default(now())
  commitSha  String?

  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id])

  @@unique([documentId, userId])
}

model Discussion {
  id          String    @id @default(uuid()) @db.Uuid
  documentId  String    @map("document_id")
  createdBy   String    @db.Uuid
  anchorType  String                               // 'range' | 'line'
  anchorData  Json                                 // { from, to } or { lineNumber }
  status      String    @default("open")           // open | resolved
  cta         String?                              // no_change | need_change
  resolution  String?                              // resolution summary
  createdAt   DateTime  @default(now())
  resolvedAt  DateTime?
  resolvedBy  String?   @db.Uuid

  document    Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  creator     User      @relation("DiscussionCreator", fields: [createdBy], references: [id])
  resolver    User?     @relation("DiscussionResolver", fields: [resolvedBy], references: [id])
  comments    DiscussionComment[]
  signoffs    DiscussionSignoff[]

  @@index([documentId, status])
}

model DiscussionComment {
  id           String   @id @default(uuid()) @db.Uuid
  discussionId String   @map("discussion_id") @db.Uuid
  authorId     String   @db.Uuid
  content      String                              // Markdown
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  discussion   Discussion @relation(fields: [discussionId], references: [id], onDelete: Cascade)
  author       User       @relation(fields: [authorId], references: [id])
}

model DiscussionSignoff {
  id           String   @id @default(uuid()) @db.Uuid
  discussionId String   @map("discussion_id") @db.Uuid
  userId       String   @db.Uuid
  signedAt     DateTime @default(now())

  discussion   Discussion @relation(fields: [discussionId], references: [id], onDelete: Cascade)
  user         User       @relation(fields: [userId], references: [id])

  @@unique([discussionId, userId])
}

model DocumentGitCommit {
  id          String   @id @default(uuid()) @db.Uuid
  documentId  String   @map("document_id")
  commitSha   String
  eventType   String                               // create | review_started | discussion_resolved | approved | reopened
  summary     String                               // commit message subject line
  triggeredBy String?  @db.Uuid
  committedAt DateTime @default(now())

  document    Document @relation(fields: [documentId], references: [id])
  trigger     User?    @relation(fields: [triggeredBy], references: [id])
}

model Notification {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @db.Uuid
  documentId String?  @map("document_id")
  type       String
  payload    Json     @default("{}")
  isRead     Boolean  @default(false)
  createdAt  DateTime @default(now())

  user       User     @relation(fields: [userId], references: [id])
  document   Document? @relation(fields: [documentId], references: [id])

  @@index([userId, isRead, createdAt(sort: Desc)])
}
```

**Multi-role design:** `DocumentMember` unique constraint is `@@unique([documentId, userId, role])` (not `[documentId, userId]`). This allows the same user to have multiple roles (e.g., editor + approver). `getDocumentRoles()` returns all roles; permission checks use the highest.

### Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| documents | `(status)` | Status filtering |
| documents | `(created_by)` | My documents query |
| documents | `(updated_at DESC)` | Default sort |
| document_tags | `(tag)` | Tag filtering |
| document_members | `(user_id)` | My memberships query |
| discussions | `(document_id, status)` | Open discussions lookup |
| notifications | `(user_id, is_read, created_at DESC)` | Notification list |

### Prisma Relations

- `Document` 1:N `DocumentTag`, `DocumentMember`, `DocumentSignoff`, `Discussion`, `DocumentGitCommit`, `Notification`
- `Discussion` 1:N `DiscussionComment`, `DiscussionSignoff`
- All `user_id` / `created_by` fields relate to `User`

### Data Flow

```
[Tiptap Editor]
    ──(2s debounce)──> PATCH /api/documents/:id { content: JSON } ──> DB (content JSONB)

[發起審核]
    ──> DB content JSON → tiptapJsonToMarkdown() → write docs-repo/{ulid}.md → git commit → push

[開啟文件]
    ──> GET /api/documents/:id ──> return DB content JSON ──> Tiptap loads
```

---

## 3. Git Operations Layer

### File: `src/lib/git.ts`

### Mutex Strategy

Single `Mutex` instance shared by all git operations:

```typescript
const gitMutex = new Mutex();

async function withGitLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await gitMutex.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
```

All public functions (commitFile, getLog, getDiff, etc.) use `withGitLock` internally. Callers don't manage locks.

No timeout on mutex — queue-based waiting is fine for < 50 users.

### Git Author

Use `--author` flag per commit (not `addConfig`) to avoid config race conditions:

```typescript
await git.commit(message, files, { '--author': `${user.name} <${user.email}>` });
```

### Push Strategy

- Push immediately after each commit (fire-and-forget, not awaited)
- On push failure: log error, add to in-memory retry queue
- Retry queue: every 30 seconds, max 5 retries per entry
- Exceeds max retries: `console.error` (no alerting in MVP)

```typescript
async function commitAndPush(file: string, message: string, author: User, body?: string): Promise<string> {
  return withGitLock(async () => {
    await git.add(file);
    const result = await git.commit(fullMessage, [], { '--author': `${author.name} <${author.email}>` });
    pushWithRetry(result.commit).catch(err => console.error('Push failed:', err));
    return result.commit;
  });
}
```

### Error Handling

| Scenario | Handling |
|----------|----------|
| docs-repo missing | Init/clone on server startup (`instrumentation.ts`); exit process if fails |
| Commit fails (no diff) | Append metadata comment before commit for metadata-only events |
| Push fails | Background retry, does not block main flow |
| Mutex contention | Queue-based waiting, no timeout |

### Initialization (Server Startup)

Via Next.js `instrumentation.ts` (`register()` hook):

```typescript
async function initDocsRepo(): Promise<void> {
  const repoPath = process.env.DOCS_REPO_PATH || './docs-repo';
  if (!existsSync(join(repoPath, '.git'))) {
    if (process.env.DOCS_REPO_REMOTE) {
      await simpleGit().clone(process.env.DOCS_REPO_REMOTE, repoPath);
    } else {
      await simpleGit().init(repoPath);
    }
  }
}
```

---

## 4. Authentication & Permissions

### NextAuth Configuration

**File: `src/lib/auth.ts`**

- Google Provider with company domain restriction via `profile.hd` check
- JWT strategy (no DB session table)
- User upsert on first login in `signIn` callback
- DB user ID stored in JWT token, exposed in `session.user.id`

```typescript
callbacks: {
  signIn({ profile }) {
    return profile?.hd === process.env.ALLOWED_DOMAIN;
  },
  jwt({ token, user }) {
    if (user) token.userId = user.id;
    return token;
  },
  session({ session, token }) {
    session.user.id = token.userId;
    return session;
  }
}
```

### API Auth Helper

```typescript
async function requireAuth(): Promise<User> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');
  return session.user;
}
```

### Permission System

**File: `src/lib/permissions.ts`**

Role resolution priority: `creator > editor > approver > advisor > viewer`

A user can have multiple roles (e.g., editor + approver). `getDocumentRoles()` returns all roles; `getHighestRole()` picks the one with highest priority for permission checks.

```typescript
type DocumentRole = 'creator' | 'editor' | 'advisor' | 'approver' | 'viewer';

const ROLE_PRIORITY: Record<DocumentRole, number> = {
  creator: 4, editor: 3, approver: 2, advisor: 1, viewer: 0
};

async function getDocumentRoles(userId: string, document: Document): Promise<DocumentRole[]> {
  if (document.createdBy === userId) return ['creator'];

  const members = await prisma.documentMember.findMany({
    where: { documentId: document.id, userId }
  });

  if (members.length === 0) return ['viewer'];
  return members.map(m => m.role as DocumentRole);
}

function getHighestRole(roles: DocumentRole[]): DocumentRole {
  return roles.sort((a, b) => ROLE_PRIORITY[b] - ROLE_PRIORITY[a])[0];
}
```

Permission functions accept `roles: DocumentRole[]` and check if ANY role satisfies the condition. `needsSignoff` returns true if the user has ANY signoff-requiring role.

### Permission Matrix

| Function | creator | editor | advisor | approver | viewer |
|----------|---------|--------|---------|----------|--------|
| `canEdit` | Y | Y | - | - | - |
| `canManageMembers` | Y | - | - | - | - |
| `canStartReview` | Y | - | - | - | - |
| `canReopen` | Y | - | - | - | - |
| `canResolveDiscussion` | Y | Y | - | Y | - |
| `canForceLock` | Y | - | - | - | - |
| `needsSignoff` | Y | Y | - | Y | - |
| `canCreateDiscussion` | Y | Y | Y | Y | - |

All permission functions are pure: accept role, return boolean.

---

## 5. Editor Architecture

### Tiptap Extensions

| Extension | Source | Purpose |
|-----------|--------|---------|
| StarterKit | @tiptap/starter-kit | Base formatting |
| Table, TableRow, TableCell, TableHeader | @tiptap/extension-table | Tables |
| Image | @tiptap/extension-image | Image display |
| Link | @tiptap/extension-link | Hyperlinks |
| Placeholder | @tiptap/extension-placeholder | Empty doc hint |
| CodeBlockLowlight | @tiptap/extension-code-block-lowlight | Code syntax highlighting |
| Markdown | tiptap-markdown | JSON <-> Markdown conversion |
| DiscussionMark | Custom | Discussion anchor highlighting |
| ImageUpload | Custom | Paste/drop image upload |

### Markdown Conversion

```
                    tiptap-markdown
Tiptap JSON doc <───────────────────────> Markdown string
      │                                        │
      │ Tiptap native                  CodeMirror 6
      │ Rich Text editing              Raw editing
      ▼                                        ▼
  [Rich Text mode]                    [Markdown mode]
```

- `tiptap-markdown` handles bidirectional conversion on client
- Rich Text → Markdown: `editor.storage.markdown.getMarkdown()`
- Markdown → Rich Text: `editor.commands.setContent(markdownString)`
- Unsupported Markdown syntax preserved as plain text

**Server-side conversion** (`src/lib/markdown.ts`):
- Headless Tiptap instance with same extensions
- Used when writing to git on state transitions
- Shared utility for all API routes that need conversion

### Auto-Save Flow

```
User input → editor.on('update') → useDebounce(2000ms) → editor.getJSON()
  → PATCH /api/documents/:id { content: JSON }
  → UI: "儲存中..." → "已儲存"
```

Auto-save writes to DB only. No git commit.

### Custom ImageUpload Extension

Two upload triggers:
1. **Paste**: `handlePaste` → detect image in clipboardData → upload → insert
2. **Toolbar**: file input → upload → insert

Upload flow:
- Insert placeholder (loading animation) at cursor
- `POST /api/upload/image` (multipart/form-data)
- Replace placeholder with actual image on success
- Toast error on failure

### Custom DiscussionMark Extension

Mark attributes: `{ discussionId: string, status: 'open' | 'resolved' }`

Visual treatment:
- `open` → `bg-yellow-100` (yellow highlight)
- `resolved` → `bg-gray-100` (gray highlight)
- Click → sidebar scrolls to corresponding discussion
- Hover → discussion preview tooltip

### Anchor Position Tracking (ProseMirror Mapping)

On every document change, use ProseMirror's transaction mapping to update anchor positions:

```typescript
editor.on('transaction', ({ transaction }) => {
  if (!transaction.docChanged) return;

  openDiscussions.forEach(d => {
    const newFrom = transaction.mapping.map(d.anchor_data.from);
    const newTo = transaction.mapping.map(d.anchor_data.to);
    const deleted = newFrom === newTo;
    updateAnchor(d.id, deleted ? null : { from: newFrom, to: newTo });
  });
});
```

**Anchor persistence strategy:** Discussion anchors are stored in two places:
1. **DB `discussions.anchor_data`** — source of truth, used for API queries
2. **Tiptap document JSON** — DiscussionMark attributes within the content, persisted naturally via auto-save

On document load, anchors are synced from DB to Tiptap marks. During editing, ProseMirror Mapping keeps marks in correct positions. On auto-save, updated mark positions are extracted and sent to the server alongside the content:

```
PATCH /api/documents/:id
{
  content: JSON,
  anchorUpdates: [                    // optional, included when anchors moved
    { discussionId: "abc", from: 125, to: 190 },
    { discussionId: "def", anchor: null }   // null = anchor invalidated
  ]
}
```

Server updates `discussions.anchor_data` in the same transaction as content save.

---

## 6. Document State Machine & Sign-off

### State Transitions

```
draft ──[發起審核]──> in_review ──[全員畫押]──> approved
  ^                       |                        |
  └───────[重開修訂]───────┴────────────────────────┘
```

### 發起審核 (draft → in_review)

```
1. Verify: caller === creator, status === 'draft'
2. Verify: at least one approver exists
3. Read content JSON from DB
4. tiptapJsonToMarkdown() via src/lib/markdown.ts (headless Tiptap)
5. Write to docs-repo/{ulid}.md
6. git commit: "docs: review started - {title}"
7. DB: status → 'in_review', update updated_at
8. DB: insert document_git_commits
9. Notify: all editor, advisor, approver
```

### 文件畫押 (signoff)

```
1. Verify: status === 'in_review'
2. Verify: caller is needsSignoff role
3. Verify: no open discussions
4. Verify: caller hasn't signed yet
5. DB: insert document_signoffs (with current latest commit_sha)
6. Notify: creator "{name} 已完成畫押"
7. Check all signed:
   - Get all needsSignoff users (creator + editor + approver)
   - Compare with document_signoffs
   - If all complete → trigger approved flow
```

### 全員畫押完成 (auto-trigger approved)

```
1. Append metadata: <!-- pactum:approved {timestamp} by {emails} -->
2. git commit: "docs: approved - {title} / signed by: {name1}, {name2}, ..."
   body: each signer's email + sign time
3. DB: status → 'approved', update updated_at
4. DB: insert document_git_commits
5. Notify: all document members
```

### 重開修訂 (reopen)

```
1. Verify: caller === creator, status in ('in_review', 'approved'), reason not empty
2. DB transaction:
   a. DELETE document_signoffs WHERE document_id = ?
   b. DELETE discussion_signoffs WHERE discussion_id IN (doc's discussions)
   c. UPDATE status → 'draft'
3. Append metadata: <!-- pactum:reopen {timestamp} by {email} -->
4. git commit: "docs: reopen - {title} / reason: {reason}"
   body: from: {previous_status}, reopened_by: {name}, time: {timestamp}
5. DB: insert document_git_commits
6. Notify: all editor, approver
```

### Edit Lock Mechanism

**API Endpoints:**

```
POST   /api/documents/:id/lock          Acquire lock (canEdit required)
DELETE /api/documents/:id/lock          Release lock (owner or creator for force unlock)
```

**POST /api/documents/:id/lock** — Acquire:

Request: `{}` (no body, uses session user)

Response (success): `{ "data": { "lockedBy": "user-id", "lockedAt": "..." } }`

Response (conflict 409): `{ "error": { "code": "DOCUMENT_LOCKED", "message": "Alice Chen 正在編輯中" } }`

```sql
UPDATE documents
SET locked_by = :userId, locked_at = now()
WHERE id = :docId AND (locked_by IS NULL OR locked_by = :userId)
RETURNING *;
```

Affected rows = 0 means locked by someone else.

**DELETE /api/documents/:id/lock** — Release:

- Normal release: only lock owner can release
- Force unlock: creator can release any lock (`canForceLock` permission)
- Frontend uses `navigator.sendBeacon` on `beforeunload` for reliable delivery on page close

**Passive cleanup:** `setInterval` in `instrumentation.ts`, every 5 minutes:

```sql
UPDATE documents SET locked_by = NULL, locked_at = NULL
WHERE locked_by IS NOT NULL AND locked_at < now() - interval '10 minutes';
```

---

## 7. Discussion System

### Discussion Lifecycle

```
[Create] open
  → Reply comments (any number)
  → [Resolve] choose CTA (no_change / need_change)
  → [Discussion signoff] all editor + approver sign
  → [All signed] resolved → git commit
```

### Create Discussion API

```
POST /api/documents/:id/discussions
{
  anchorType: 'range' | 'line',
  anchorData: { from: number, to: number } | { lineNumber: number },
  content: string,        // First comment (Markdown)
  mentions: string[]      // @mentioned user IDs
}
```

Server: create discussion + first comment + notify mentions + creator.

### Resolve Flow

```
POST /api/discussions/:discussionId/resolve
{
  cta: 'no_change' | 'need_change'
}
```

Server:
1. Verify: caller is creator / editor / approver
2. Set `discussion.cta`
3. Do NOT immediately resolve — enter discussion signoff phase
4. Notify: all editor + approver "討論串發起結案投票"

**Note:** `resolution` is NOT provided by the caller. It is auto-generated when all signoffs complete (see Discussion Signoff step 4a below).

### Discussion Signoff

```
POST /api/discussions/:discussionId/signoff
```

Server:
1. Verify: caller is editor / approver / creator
2. Verify: discussion has cta set (resolve initiated)
3. Insert discussion_signoffs
4. Check all signed → if complete:
   a. AI generates resolution summary: call LLM API with all comments in the discussion thread → store in `discussion.resolution`. (PRD §8.3 requires AI auto-summary. This is distinct from "AI auto-edit" which is Phase 2.)
   b. Update discussion: status → 'resolved', resolved_at, resolved_by
   c. Get latest document content from DB → tiptapJsonToMarkdown() → write to docs-repo/{ulid}.md (this ensures a diff exists even for `no_change` CTA, since the file may have been edited since last commit)
   d. If file content unchanged since last commit (e.g. pure `no_change` with no edits), append metadata comment: `<!-- pactum:discussion_resolved {timestamp} by {email} -->` to ensure valid diff
   e. git commit: `"docs: discussion resolved - {title} / {resolution first 80 chars}"`
   f. commit body: full resolution + CTA + resolver + signoff names
   g. DB: insert document_git_commits
   h. Notify: creator "討論串全員畫押完成"
   i. If ALL discussions resolved → notify creator "可發起文件畫押"

### need_change Flow (MVP Simplified)

MVP implements manual edit only (no AI auto-edit):
1. After CTA `need_change`, discussion enters "pending edit + pending signoff" state
2. Editor manually modifies content (normal edit + auto-save flow)
3. Each person signs off on the discussion
4. All signed → formally resolved

**Editing during `in_review`:** PRD §14.2 says `PATCH /api/documents/:id` is only allowed in `draft` status. However, `need_change` discussions require editors to modify content during `in_review`. The PATCH endpoint is extended to also allow edits when:
- Status is `in_review`, AND
- There is at least one discussion with `cta = 'need_change'` that is not yet resolved, AND
- Caller has `canEdit` permission

This is a controlled relaxation — edits are only possible when a discussion explicitly requests changes.

UI shows: "此討論需要修改文件，請 editor 修改後進行畫押確認"

### Frontend Component Structure

```
[Document Page]
├── [Editor Area]
│   ├── Text highlighted by DiscussionMark
│   ├── Select text → BubbleMenu "新增討論" button
│   └── Click highlight → sidebar scrolls to discussion
│
└── [Right Sidebar] (tab: Discussion / History)
    └── [Discussion Tab]
        ├── Filter: Open / Resolved / All
        ├── DiscussionThread × N
        │   ├── Anchor preview (click to jump in editor)
        │   ├── CommentList
        │   ├── CommentForm (Markdown + @mention autocomplete)
        │   ├── Resolve button (CTA + resolution input)
        │   └── DiscussionSignoff (progress + sign button)
        └── "還有 N 個討論未結案" hint
```

---

## 8. Notification System & SSE

### Architecture

```
[Business API]
  → notificationService.send(type, documentId, recipientIds, payload)
  → Parallel dispatch:
      ├── DB insert → notifications table (in-app)
      ├── emailService.send() (if user enabled)
      └── slackService.send() (if user configured webhook)
```

### SSE Implementation

**File: `GET /api/notifications/stream`**

```typescript
// In-memory connection registry
const sseConnections = new Map<string, ReadableStreamDefaultController>();

// Stream endpoint
export async function GET(req: Request) {
  const user = await requireAuth();
  const stream = new ReadableStream({
    start(controller) {
      sseConnections.set(user.id, controller);
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 30000);
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        sseConnections.delete(user.id);
      });
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

**Push to SSE:**

```typescript
function pushToSSE(userId: string, notification: Notification) {
  const controller = sseConnections.get(userId);
  if (controller) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(notification)}\n\n`));
  }
}
```

### Frontend SSE Hook

```typescript
// src/hooks/useSSE.ts
function useSSE() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const es = new EventSource('/api/notifications/stream');
    es.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (notification.documentId) {
        queryClient.invalidateQueries({ queryKey: ['document', notification.documentId] });
      }
      showToast(notification);
    };
    return () => es.close();
  }, []);
}
```

### Email Service (`src/lib/email.ts`)

`nodemailer` + Google Workspace SMTP. Async, fire-and-forget. Failure only logged.

### Slack Service (`src/lib/slack.ts`)

Per-user Incoming Webhook URL. Simple `fetch` POST. Async, fire-and-forget.

### User Notification Settings

Stored in `users` table:
- `notification_prefs JSONB` — `{ inApp: boolean, email: boolean, slack: boolean }`
- `slack_webhook_url TEXT` — nullable

---

## 9. API Response Format & Error Handling

### Unified Response Format

**Success:**
```json
{ "data": { ... } }
```

**List with pagination:**
```json
{
  "data": [ ... ],
  "pagination": { "total": 42, "page": 1, "pageSize": 20, "totalPages": 3 }
}
```

**Error:**
```json
{
  "error": { "code": "DOCUMENT_LOCKED", "message": "Alice Chen 正在編輯中" }
}
```

### ApiError Class & Handler

**File: `src/lib/api-handler.ts`**

```typescript
class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) { super(message); }
}

function apiHandler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message } },
          { status: err.statusCode }
        );
      }
      console.error(err);
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
        { status: 500 }
      );
    }
  };
}
```

### Error Codes

| HTTP | Code | Scenario |
|------|------|----------|
| 401 | UNAUTHORIZED | Not logged in |
| 403 | FORBIDDEN | No permission |
| 404 | NOT_FOUND | Document/discussion not found |
| 409 | DOCUMENT_LOCKED | Edit lock conflict |
| 409 | INVALID_STATUS | Invalid state transition |
| 409 | OPEN_DISCUSSIONS | Signoff with open discussions |
| 409 | ALREADY_SIGNED | Duplicate signoff |
| 422 | VALIDATION_ERROR | Invalid request params |

### Frontend Error Handling

React Query global `onError` shows toast. Specific scenarios override with detailed messages (e.g., lock conflict shows who is editing).

---

## 10. Design Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Long-running Node.js process (not serverless) | Requires local filesystem (git), in-memory state (mutex, SSE), background tasks |
| 2 | Next.js API Routes (no separate backend) | Single deployment, shared types, simplified DX for POC |
| 3 | JWT session (no DB session table) | Simpler; user data in cookie, only users table needed |
| 4 | DB stores Tiptap JSON, git stores Markdown | JSON is native editor format; Markdown only needed at state transitions |
| 5 | React Query + Context for state management | Handles mutations, optimistic updates, cache invalidation well for CRUD-heavy app |
| 6 | ProseMirror Mapping for discussion anchors | Best stability — anchors survive edits, only fail when text is deleted |
| 7 | CodeMirror 6 for Markdown mode | Lightweight (~150KB), has markdown support, not overkill like Monaco |
| 8 | async-mutex for git operations | Single queue, no timeout; sufficient for < 50 users |
| 9 | SSE (not WebSocket) for notifications | Server→client push only; simpler than WebSocket |
| 10 | Prisma schema defined upfront (all 10 tables) | Avoid frequent migrations during development |
| 11 | AI discussion summary in MVP (not deferred) | PRD §8.3 requires AI auto-summary on resolve. Only "AI auto-edit of document content" is Phase 2. |
| 12 | sendBeacon for edit lock release | Ensures request delivery on page close/navigation |
| 13 | Multi-role via multiple DocumentMember rows | `@@unique([documentId, userId, role])` allows same user to be editor + approver per PRD §6.2 |
| 14 | Anchors stored in both DB and Tiptap marks | DB is source of truth for API; marks persist naturally with auto-save; synced on load |
| 15 | `discussion_resolved` added to metadata comment events | For `no_change` CTA where file content hasn't changed, ensures valid git diff |
| 16 | PATCH allowed during `in_review` for `need_change` | Controlled relaxation of PRD §14.2 — only when a discussion explicitly requests changes |
