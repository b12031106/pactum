import { describe, it, expect, vi } from 'vitest';

vi.mock('@/i18n/context', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'en', setLocale: () => {} }),
}));

/**
 * Test the mention matching logic used in DiscussionThread.renderMentions.
 * The approach: build a regex from known names, match @Name in text.
 */

function findMentions(text: string, knownNames: string[]): { name: string; index: number }[] {
  if (knownNames.length === 0) return [];
  const sorted = [...knownNames].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`@(${escaped.join('|')})`, 'g');

  const results: { name: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    results.push({ name: match[1], index: match.index });
  }
  return results;
}

describe('mention parsing in comments', () => {
  const knownNames = ['Justin Hsu', 'Alice', '許朝揚'];

  it('finds a simple @mention', () => {
    const mentions = findMentions('@Justin Hsu please review', knownNames);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].name).toBe('Justin Hsu');
  });

  it('finds @mention with CJK name', () => {
    const mentions = findMentions('cc @許朝揚 看一下', knownNames);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].name).toBe('許朝揚');
  });

  it('finds multiple @mentions', () => {
    const mentions = findMentions('@Alice and @Justin Hsu review please', knownNames);
    expect(mentions).toHaveLength(2);
    expect(mentions[0].name).toBe('Alice');
    expect(mentions[1].name).toBe('Justin Hsu');
  });

  it('ignores @mentions not matching known names', () => {
    const mentions = findMentions('@Unknown please help', knownNames);
    expect(mentions).toHaveLength(0);
  });

  it('returns empty for text without @', () => {
    const mentions = findMentions('no mentions here', knownNames);
    expect(mentions).toHaveLength(0);
  });

  it('handles @mention at end of text', () => {
    const mentions = findMentions('review by @Alice', knownNames);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].name).toBe('Alice');
  });

  it('handles empty known names', () => {
    const mentions = findMentions('@Alice test', []);
    expect(mentions).toHaveLength(0);
  });

  it('prefers longest name match', () => {
    const names = ['Justin', 'Justin Hsu'];
    const mentions = findMentions('@Justin Hsu test', names);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].name).toBe('Justin Hsu');
  });
});
