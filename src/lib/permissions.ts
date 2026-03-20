import type { DocumentRole } from '@/types';

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
