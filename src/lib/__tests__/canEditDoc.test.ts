import { describe, it, expect } from 'vitest';

/**
 * Tests the canEditDoc logic from the document page:
 *   const canEditDoc = !isApproved && (doc.status !== 'in_review' || hasNeedChange);
 *
 * Bug: previously in_review without need_change still allowed editing.
 */

function canEditDoc(status: string, hasNeedChange: boolean): boolean {
  const isApproved = status === 'approved';
  return !isApproved && (status !== 'in_review' || hasNeedChange);
}

describe('canEditDoc logic', () => {
  it('draft → canEdit = true', () => {
    expect(canEditDoc('draft', false)).toBe(true);
  });

  it('in_review with no need_change discussions → canEdit = false', () => {
    expect(canEditDoc('in_review', false)).toBe(false);
  });

  it('in_review with need_change discussion → canEdit = true', () => {
    expect(canEditDoc('in_review', true)).toBe(true);
  });

  it('approved → canEdit = false', () => {
    expect(canEditDoc('approved', false)).toBe(false);
  });

  it('approved even with need_change → canEdit = false', () => {
    expect(canEditDoc('approved', true)).toBe(false);
  });
});
