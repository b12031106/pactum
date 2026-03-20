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

  it('IDs are time-sortable (later > earlier)', async () => {
    const id1 = generateDocumentId();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const id2 = generateDocumentId();
    expect(id2 > id1).toBe(true);
  });
});
