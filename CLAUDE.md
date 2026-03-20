@AGENTS.md

# Pactum Project Instructions

## Architecture

- **Next.js App Router** single project — API routes at `src/app/api/`, pages at `src/app/`
- **Long-running Node.js process** (NOT serverless) — requires local filesystem, in-memory mutex, SSE connections
- **PostgreSQL + Prisma ORM** — schema at `prisma/schema.prisma`, 10 models
- **Git as audit trail** — `simple-git` + `async-mutex`, all ops go through `src/lib/git.ts`

## Conventions

### API Routes
- All handlers use `apiHandler()` wrapper from `src/lib/api-handler.ts`
- `apiHandler` signature: `(req: Request, context?: { params: Promise<Record<string, string>> })`
- Params is a **Promise** — always `await context!.params`
- Throw `ApiError(statusCode, code, message)` for errors
- Response format: `{ data: ... }` or `{ data: [...], pagination: { ... } }`
- Auth: `getServerSession(authOptions)` → `session.user.id`

### Frontend
- **React Query** (`@tanstack/react-query`) for all data fetching and mutations
- **shadcn/ui v4** uses `@base-ui/react` (NOT radix) — `Dialog`, `DropdownMenu` use `render` prop pattern
- **sonner** for toasts — `import { toast } from 'sonner'`, NOT `@/components/ui/toast`
- **lucide-react** for icons
- Client components must have `'use client'` directive

### Permissions
- Roles: `creator > editor > approver > advisor > viewer` (priority order)
- Multi-role support: same user can have `editor + approver` via `@@unique([documentId, userId, role])`
- All permission functions in `src/lib/permissions.ts` are pure: accept `DocumentRole[]`, return boolean

### Git Operations
- All public methods use `mutex.runExclusive()` — callers don't manage locks
- Push is fire-and-forget with retry queue
- Git author set per-commit via `--author` flag

### Notifications
- `sendNotification()` from `src/lib/notifications.ts` — always fire-and-forget with `.catch(() => {})`
- SSE registry at `src/lib/sse.ts` supports multiple tabs per user

## Commands

```bash
npm run dev          # Start dev server
npm run test         # Run vitest (31 tests)
npm run test:watch   # Watch mode
npm run build        # Production build
npm run lint         # ESLint
docker start pactum-postgres   # Start PostgreSQL
npx prisma studio    # DB browser
npx prisma migrate dev         # Run migrations
```

## Key Documents
- `PRD.md` — Product Requirements Document
- `HANDOFF.md` — Cross-session handoff (progress, state, next steps)
- `docs/superpowers/specs/2026-03-20-pactum-mvp-design.md` — Technical design spec
- `docs/superpowers/plans/` — Phase implementation plans

## Do NOT
- Use `sendBeacon` — use `fetch` with `keepalive: true` instead
- Import `toast` from `@/components/ui/toast` — use `sonner`
- Use `asChild` prop on shadcn components — use `render` prop (base-ui)
- Modify git config inside GitService — use `--author` per commit
- Call git operations without going through `GitService` class
