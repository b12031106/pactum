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
| Phase 3: Roles & Locking | ⏳ Pending | |
| Phase 4: Tiptap Editor | ⏳ Pending | |
| Phase 5: State Machine | ⏳ Pending | |
| Phase 6: Discussions | ⏳ Pending | |
| Phase 7: Git Diff Viewer | ⏳ Pending | |
| Phase 8: Notifications | ⏳ Pending | |
| Phase 9: @Mention + Polish | ⏳ Pending | |

## Current State
- Dev server: `npm run dev` works
- DB: All 10 tables created via Prisma migration (PostgreSQL via Docker: `docker start pactum-postgres`)
- Auth: Google OAuth configured (needs GOOGLE_CLIENT_ID/SECRET in .env.local)
- Documents: Can create, list, view, edit (textarea), auto-save to DB
- Git: Initial commit on document create, docs-repo initialized on server start
- Tests: vitest configured, 12 tests passing (ULID, ApiError, GitService)

## Key Files
- `prisma/schema.prisma` — all 10 data models
- `src/lib/git.ts` — GitService with mutex
- `src/lib/auth.ts` — NextAuth config
- `src/lib/api-handler.ts` — ApiError + apiHandler
- `src/instrumentation.ts` — server startup hooks (docs-repo init, lock cleanup, push retry)
- `src/app/api/documents/route.ts` — document create + list API
- `src/app/api/documents/[id]/route.ts` — document detail + update API

## Next Step
Start Phase 3 (Roles & Permissions + Edit Locking). Next plan to be created for Phase 3-4.

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
- [ ] prisma.config.ts has a TypeScript warning (Prisma 7.x migration artifact)
