import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}));

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
