# Pactum

Git-based document collaboration tool with structured review workflows. Documents are contracts — every change is tracked, every approval is recorded.

## Features

- **Rich Text Editor** — Tiptap (Rich Text) + CodeMirror 6 (Markdown) with mode toggle
- **Document State Machine** — `draft → in_review → approved` with reopen support
- **Role-Based Access** — Creator, Editor, Approver, Advisor, Viewer (multi-role per user)
- **Edit Locking** — Pessimistic locking with heartbeat and passive cleanup
- **Discussion System** — Inline discussions with CTA resolve flow (no_change / need_change) and signoff
- **Git Audit Trail** — Every state transition commits to git with author attribution
- **Diff Viewer** — Commit history with diff2html (unified / side-by-side)
- **Real-Time Notifications** — SSE push + email (SMTP) + Slack (webhook)
- **@Mention** — Autocomplete mentions in discussion comments
- **Image Upload** — Paste/drop upload to Cloudflare R2

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 App Router |
| Language | TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth.js (Google OAuth, JWT) |
| Editor | Tiptap + CodeMirror 6 |
| Git | simple-git + async-mutex |
| Image Storage | Cloudflare R2 |
| Notifications | SSE + nodemailer + Slack webhook |
| UI | shadcn/ui v4 + Tailwind CSS |
| State | React Query (TanStack Query) |
| Testing | Vitest |

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ (or Docker)
- Git

## Getting Started

### 1. Clone and install

```bash
git clone git@github.com:b12031106/pactum.git
cd pactum
npm install
```

### 2. Set up PostgreSQL

```bash
# Using Docker:
docker run -d --name pactum-postgres \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=pactum \
  postgres:16
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pactum"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<generate with: openssl rand -base64 32>"
GOOGLE_CLIENT_ID="<from Google Cloud Console>"
GOOGLE_CLIENT_SECRET="<from Google Cloud Console>"
ALLOWED_DOMAIN="yourcompany.com"
```

### 4. Initialize database

```bash
npx prisma migrate dev
```

### 5. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npx prisma studio` | Open Prisma database browser |

## Project Structure

```
pactum/
├── prisma/schema.prisma           # Database schema (10 models)
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── api/                   # API routes
│   │   │   ├── auth/              # NextAuth
│   │   │   ├── documents/         # Document CRUD, review, signoff, lock
│   │   │   ├── discussions/       # Discussion, comments, resolve, signoff
│   │   │   ├── notifications/     # List, mark-read, SSE stream
│   │   │   ├── upload/            # Image upload to R2
│   │   │   └── users/             # User settings
│   │   ├── documents/             # Document pages (list, new, detail)
│   │   ├── settings/              # User settings page
│   │   └── login/                 # Login page
│   ├── components/
│   │   ├── editor/                # TiptapEditor, MarkdownEditor, ModeToggle
│   │   ├── discussions/           # DiscussionSidebar, Thread, CommentForm, MentionSuggestion
│   │   ├── documents/             # DocumentList, Card, Actions, SignoffProgress, MemberManager
│   │   ├── history/               # CommitList, DiffViewer, HistorySidebar
│   │   ├── notifications/         # NotificationBell, NotificationList
│   │   ├── layout/                # Header
│   │   └── ui/                    # shadcn/ui components
│   ├── hooks/                     # useAutoSave, useEditLock, useSSE, useDebounce
│   ├── lib/                       # Server utilities
│   │   ├── git.ts                 # GitService with mutex
│   │   ├── auth.ts                # NextAuth config
│   │   ├── permissions.ts         # Role-based permission functions
│   │   ├── notifications.ts       # Notification dispatch (DB + SSE + email + Slack)
│   │   ├── sse.ts                 # SSE connection registry
│   │   ├── markdown.ts            # Tiptap JSON → Markdown converter
│   │   ├── email.ts               # Nodemailer SMTP
│   │   ├── slack.ts               # Slack webhook
│   │   ├── api-handler.ts         # API error handling
│   │   ├── prisma.ts              # Prisma client singleton
│   │   └── r2.ts                  # Cloudflare R2 client
│   └── types/index.ts             # Shared TypeScript types
├── docs-repo/                     # Git repository for document files (gitignored)
├── HANDOFF.md                     # Cross-session development handoff
├── PRD.md                         # Product Requirements Document
└── docs/superpowers/              # Design specs and implementation plans
```

## Document Workflow

```
draft ──[Submit for Review]──> in_review ──[All Signers Sign Off]──> approved
  ^                                |                                    |
  └────────────[Reopen]────────────┴────────────────────────────────────┘
```

1. **Creator** writes document, adds members (editor/approver/advisor)
2. **Creator** submits for review → content written to git as Markdown
3. **Members** create discussions, comment, resolve with CTA
4. **Signers** (creator + editors + approvers) sign off on document
5. All signers complete → document auto-approved with git commit

## Environment Variables

See `.env.example` for the full list. Required for basic operation:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_URL` | Yes | App URL (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Yes | Session encryption key |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `ALLOWED_DOMAIN` | Yes | Restrict login to company domain |
| `DOCS_REPO_PATH` | No | Git repo path (default: `./docs-repo`) |
| `R2_*` | No | Cloudflare R2 for image upload |
| `SMTP_*` | No | Email notifications |

## License

Private.
