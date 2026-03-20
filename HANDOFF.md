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
| Phase 5: State Machine | ✅ Done | review/reopen/signoff API, auto-approve, state machine UI (DocumentActions + SignoffProgress) |
| Phase 6: Discussions | ✅ Done | discussion CRUD + comments API, resolve/signoff API with git commit, discussion sidebar UI |
| Phase 7: Git Diff Viewer | ⏳ Pending | |
| Phase 8: Notifications | ⏳ Pending | |
| Phase 9: @Mention + Polish | ⏳ Pending | |

## Current State
- Dev server: `npm run dev` works
- DB: All 10 tables created via Prisma migration (PostgreSQL via Docker: `docker start pactum-postgres`)
- Auth: Google OAuth configured (needs GOOGLE_CLIENT_ID/SECRET in .env.local)
- Documents: full state machine (draft → in_review → approved), reopen with reason, auto-save to DB
- Editor: Tiptap with toolbar (headings, bold, italic, lists, code blocks, tables, links, images), CodeMirror markdown mode with mode toggle, image upload to R2
- Permissions: Role-based access (creator, editor, reviewer, viewer), member CRUD, edit locking with heartbeat
- Signoff: document-level signoff with auto-approve when all reviewers sign
- Discussions: create, comment, resolve (no_change/need_change), discussion signoff, git commit on resolve
- UI: two-column layout with editor + sidebar (Discussions/Members tabs), DocumentActions, SignoffProgress, new discussion button
- Git: Initial commit on document create, git commit on discussion resolve, docs-repo initialized on server start
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
- `src/components/documents/DocumentActions.tsx` — status transition buttons (submit, approve, reopen)
- `src/components/documents/SignoffProgress.tsx` — signoff progress tracker
- `src/app/api/documents/[id]/review/route.ts` — submit for review API
- `src/app/api/documents/[id]/reopen/route.ts` — reopen document API
- `src/app/api/documents/[id]/signoff/route.ts` — signoff (POST) API
- `src/app/api/documents/[id]/signoffs/route.ts` — list signoffs (GET) API
- `src/app/api/documents/[id]/discussions/route.ts` — create/list discussions API
- `src/app/api/discussions/[discussionId]/route.ts` — discussion detail API
- `src/app/api/discussions/[discussionId]/comments/route.ts` — comments CRUD API
- `src/app/api/discussions/[discussionId]/resolve/route.ts` — resolve discussion API (with git commit)
- `src/app/api/discussions/[discussionId]/signoff/route.ts` — discussion signoff API
- `src/components/discussions/DiscussionSidebar.tsx` — discussion sidebar with tabs
- `src/components/discussions/DiscussionThread.tsx` — discussion thread with comments
- `src/components/discussions/CommentForm.tsx` — comment input form
- `src/components/discussions/DiscussionSignoff.tsx` — discussion signoff UI
- `src/hooks/useAutoSave.ts` — debounced auto-save hook
- `src/hooks/useEditLock.ts` — edit lock acquisition/release hook
- `src/app/documents/[id]/page.tsx` — document detail page (Tiptap + markdown editor integrated)

## Next Step
Start Phase 7 (Git Diff Viewer).

## Known Issues
- [ ] Google OAuth Client ID needs to be created in Google Cloud Console
- [ ] ALLOWED_DOMAIN env var needs to be set to company domain
- [ ] docs-repo remote (DOCS_REPO_REMOTE) not configured — commits are local only
- [ ] prisma.config.ts has a TypeScript warning (Prisma 7.x migration artifact)
- [ ] AI resolution summary is a stub — TODO: integrate LLM API
