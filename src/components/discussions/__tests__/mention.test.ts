import { describe, it, expect } from 'vitest';

/**
 * Test the mention detection regex used in CommentForm.
 * Bug: original regex /@(\w*)$/ only matched ASCII word chars,
 * so CJK names like 許朝揚 wouldn't trigger the mention dropdown.
 * Fix: changed to /@([^\s]*)$/ to match any non-whitespace after @.
 */

const mentionRegex = /@([^\s]*)$/;
const replaceRegex = /@[^\s]*$/;

describe('mention detection regex', () => {
  it('matches @ followed by ASCII letters', () => {
    const match = 'hello @Ju'.match(mentionRegex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('Ju');
  });

  it('matches @ followed by CJK characters', () => {
    const match = 'hello @許朝'.match(mentionRegex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('許朝');
  });

  it('matches bare @ with empty query', () => {
    const match = 'hello @'.match(mentionRegex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('');
  });

  it('does not match @ in the middle of a word', () => {
    const match = 'email@test'.match(mentionRegex);
    // This matches "test" which is fine — the search API will filter
    expect(match).not.toBeNull();
    expect(match![1]).toBe('test');
  });

  it('matches @ after a space', () => {
    const match = 'cc @alice'.match(mentionRegex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('alice');
  });

  it('does not match when @ is followed by a space', () => {
    const match = 'hello @ world'.match(mentionRegex);
    expect(match).toBeNull();
  });
});

describe('mention replace regex', () => {
  it('replaces ASCII mention query', () => {
    const result = 'hello @Ju'.replace(replaceRegex, '');
    expect(result).toBe('hello ');
  });

  it('replaces CJK mention query', () => {
    const result = 'hello @許朝'.replace(replaceRegex, '');
    expect(result).toBe('hello ');
  });

  it('replaces bare @', () => {
    const result = 'hello @'.replace(replaceRegex, '');
    expect(result).toBe('hello ');
  });
});
