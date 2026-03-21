import { describe, it, expect } from 'vitest';
import { translate } from '@/i18n';

const msgs: Record<string, string> = {
  'greeting': 'Hello',
  'welcome': 'Welcome, {name}!',
  'stats': '{count} items by {author}',
};

describe('translate', () => {
  it('returns the value for a known key', () => {
    expect(translate(msgs, 'greeting')).toBe('Hello');
  });

  it('returns the key itself when key is not found', () => {
    expect(translate(msgs, 'unknown.key')).toBe('unknown.key');
  });

  it('interpolates a single {name} param', () => {
    expect(translate(msgs, 'welcome', { name: 'Alice' })).toBe('Welcome, Alice!');
  });

  it('interpolates multiple params', () => {
    expect(translate(msgs, 'stats', { count: 3, author: 'Bob' })).toBe('3 items by Bob');
  });

  it('leaves {param} as-is when param is not provided', () => {
    expect(translate(msgs, 'stats', { count: 5 })).toBe('5 items by {author}');
  });
});
