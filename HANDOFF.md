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
- shadcn/ui v4 with base-ui (not radix) + sonner for toasts

## Phase Progress
| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Project Init | ✅ Done | Next.js + Prisma + shadcn/ui + git lib |
| Phase 1: Auth | ✅ Done | Google OAuth + JWT + middleware guard |
| Phase 2: Document CRUD | ✅ Done | Create, list, detail, auto-save, git commit |
| Phase 3: Roles & Locking | ✅ Done | Permissions lib, member CRUD API, edit lock API, useEditLock hook, MemberManager UI |
| Phase 4: Tiptap Editor | ✅ Done | Tiptap editor w/ toolbar, CodeMirror markdown mode, mode toggle, image upload (R2), server-side markdown conversion |
| Phase 5: State Machine | ⏳ Pending | |
| Phase 6: Discussions | ⏳ Pending | |
| Phase 7: Git Diff Viewer | ⏳ Pending | |
| Phase 8: Notifications | ⏳ Pending | |
| Phase 9: @Mention + Polish | ⏳ Pending | |

## Current State
- Dev server: `npm run dev` works
- DB: All 10 tables created via Prisma migration (PostgreSQL via Docker: `docker start pactum-postgres`)
- Auth: Google OAuth configured (needs GOOGLE_CLIENT_ID/SECRET in .env.local)
- Documents: Can create, list, view, edit with rich text (Tiptap) or markdown (CodeMirror), auto-save to DB
- Editor: Tiptap with toolbar (headings, bold, italic, lists, code blocks, tables, links, images), CodeMirror markdown mode with mode toggle, image upload to R2
- Permissions: Role-based access (creator, editor, reviewer, viewer), member CRUD, edit locking with heartbeat
- Git: Initial commit on document create, docs-repo initialized on server start
- Tests: vitest configured, 29 tests passing (ULID, ApiError, GitService, permissions, markdown conversion)

## Key Files
- `prisma/schema.prisma` — all 10 data models
- `src/lib/git.ts` — GitService with mutex
- `src/lib/auth.ts` — NextAuth config
- `src/lib/api-handler.ts` — ApiError + apiHandler
- `src/lib/permissions.ts` — role-based permission functions
- `src/lib/markdown.ts` — server-side markdown-to-HTML conversion
- `src/instrumentation.ts` — server startup hooks (docs-repo init, lock cleanup, push retry)
- `src/app/api/documents/route.ts` — document create + list API
- `src/app/api/documents/[id]/route.ts` — document detail + update API
- `src/app/api/documents/[id]/members/route.ts` — member CRUD API
- `src/app/api/documents/[id]/lock/route.ts` — edit lock acquire/release API
- `src/app/api/upload/image/route.ts` — image upload to R2
- `src/components/editor/TiptapEditor.tsx` — Tiptap rich text editor with extensions
- `src/components/editor/EditorToolbar.tsx` — editor toolbar (formatting buttons)
- `src/components/editor/MarkdownEditor.tsx` — CodeMirror 6 markdown editor
- `src/components/editor/ModeToggle.tsx` — richtext/markdown mode toggle
- `src/components/editor/extensions/image-upload.ts` — Tiptap image upload extension
- `src/components/documents/MemberManager.tsx` — member management UI
- `src/hooks/useAutoSave.ts` — debounced auto-save hook
- `src/hooks/useEditLock.ts` — edit lock acquisition/release hook
- `src/app/documents/[id]/page.tsx` — document detail page (Tiptap + markdown editor integrated)

## Next Step
Start Phase 5 (Document State Machine + Git Commit automation).

Tasks:
1. Implement document status transitions (draft -> in_review -> approved, with rollback via need_change)
2. Create state machine logic with validation rules
3. Add git commit on status transitions (snapshot document content)
4. Build status transition UI (submit for review, approve, request changes)
5. Add transition history/audit log

## Known Issues
- [ ] Google OAuth Client ID needs to be created in Google Cloud Console
- [ ] ALLOWED_DOMAIN env var needs to be set to company domain
- [ ] docs-repo remote (DOCS_REPO_REMOTE) not configured — commits are local only
- [ ] prisma.config.ts has a TypeScript warning (Prisma 7.x migration artifact)
